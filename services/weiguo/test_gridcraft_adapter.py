"""GridCraft adapter must fail closed and never execute an arbitrary command."""
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from gridcraft_adapter import CellEntry, SheetExport, validate_export, _render


def sheet(entries):
    return SheetExport(cells=[CellEntry(cell=k, input=v) for k, v in entries])


class GridCraftAdapterTests(unittest.TestCase):
    def test_supported_formula_and_cells(self):
        commands = validate_export(sheet([
            ("A1", "月份"), ("B2", "180"), ("C2", "=SUM(B2:B2)"),
        ]))
        self.assertEqual([item["command"] for item in commands], ["cell.set"] * 3)
        self.assertEqual(commands[2]["params"]["input"], "=SUM(B2:B2)")

    def test_external_formula_functions_and_injection_rejected(self):
        inputs = [
            "=WEBSERVICE(A1)", "=HYPERLINK(A1,B1)", "=SUM(Sheet1!A1)",
            "=A201", "@SUM(B2)", "+CMD", "-malicious",
        ]
        for value in inputs:
            with self.subTest(value=value), self.assertRaises(HTTPException):
                validate_export(sheet([("A1", value)]))

    def test_outside_bounds_and_duplicate_rejected(self):
        for entries in [
            [("AA1", "x")], [("A201", "x")], [("A0", "x")],
            [("A1", "1"), ("a1", "2")],
        ]:
            with self.subTest(entries=entries), self.assertRaises(HTTPException):
                validate_export(sheet(entries))

    def test_missing_binary_fails_closed(self):
        with patch("gridcraft_adapter.shutil.which", return_value=None):
            with self.assertRaises(HTTPException) as error:
                _render(validate_export(sheet([("A1", "safe")])))
        self.assertEqual(error.exception.status_code, 503)

    def test_fixed_binary_arguments_and_secret_scrubbing(self):
        calls = []
        def fake_run(argv, **kwargs):
            calls.append((argv, kwargs))
            script_path = Path(argv[argv.index("--script") + 1])
            script = script_path.read_text()
            self.assertIn('"command":"cell.set"', script)
            with zipfile.ZipFile(argv[argv.index("--out") + 1], "w") as handle:
                handle.writestr("[Content_Types].xml", "<Types/>")
            return subprocess.CompletedProcess(argv, 0, stdout=b"", stderr=b"")

        with patch("gridcraft_adapter.shutil.which", return_value="/usr/bin/gridcraft-cli"), \
             patch("gridcraft_adapter.subprocess.run", side_effect=fake_run), \
             patch.dict(os.environ, {"WEIGUO_ADMIN_TOKEN":"sensitive-token"}):
            content = _render(validate_export(sheet([("A1", "安全"), ("B1", "=SUM(1,2)")])))
        self.assertTrue(content.startswith(b"PK"))
        argv, kwargs = calls[0]
        self.assertEqual(argv[1:3], ["run", "--script"])
        self.assertNotIn("sensitive-token", str(kwargs))
        self.assertIs(kwargs["stdin"], subprocess.DEVNULL)
        self.assertFalse(kwargs["check"])
        self.assertEqual(kwargs["timeout"], 25)

    def test_failed_cli_does_not_expose_stderr(self):
        with patch("gridcraft_adapter.shutil.which", return_value="/usr/bin/gridcraft-cli"), \
             patch("gridcraft_adapter.subprocess.run", return_value=subprocess.CompletedProcess(
                 ["cli"], 1, stdout=b"", stderr=b"SECRET")):
            with self.assertRaises(HTTPException) as error:
                _render(validate_export(sheet([("A1", "safe")])))
        self.assertNotIn("SECRET", str(error.exception.detail))


if __name__ == "__main__":
    unittest.main()
