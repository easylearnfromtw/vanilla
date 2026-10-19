"""Quirinus operator-only adapter: fail-closed and fixed-command tests."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
import quirinus_adapter as quirinus
from policy import private_operator_route

SAFE_ENV = {
    "QUIRINUS_ENABLED": "true",
    "QUIRINUS_EGRESS_BLOCKED": "true",
    "QUIRINUS_SOURCE_READONLY": "true",
}


class QuirinusTests(unittest.TestCase):
    def test_disabled_by_default(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as error:
                quirinus.validated_config()
        self.assertEqual(error.exception.status_code, 503)

    def test_public_family_origin_hides_operator_api(self):
        self.assertTrue(private_operator_route("/v1/operator/quirinus/scan"))
        self.assertFalse(private_operator_route("/v1/family/tasks"))

    def test_each_isolation_attestation_required(self):
        for key in SAFE_ENV:
            with self.subTest(key=key), patch.dict(os.environ, {**SAFE_ENV, key: "false"}):
                with self.assertRaises(HTTPException):
                    quirinus.validated_config()

    def test_fixed_scan_and_sanitized_findings(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "source"
            root.mkdir()
            cli = Path(temp) / "vulnclaw"
            cli.write_text("#!/bin/sh\n", encoding="utf-8")
            cli.chmod(0o700)
            upstream = {
                "files_scanned": 1,
                "findings": [{
                    "severity": "High", "vuln_type": "unsafe_eval",
                    "title": "Unsafe eval", "target": str(root / "src" / "app.py"),
                    "line": 7, "cwe": "CWE-95", "remediation": "Avoid eval",
                    "evidence": "SECRET_NOT_ALLOWED_IN_RESPONSE",
                }],
            }
            fake = SimpleNamespace(returncode=1, stdout=json.dumps(upstream), stderr="secret error")
            with patch.dict(os.environ, SAFE_ENV), \\
                 patch.object(quirinus, "_SOURCE_ROOT", root), \\
                 patch.object(quirinus, "_CLI_BIN", cli), \\
                 patch.object(quirinus.subprocess, "run", return_value=fake) as runner:
                result = quirinus.run_fixed_scan()
            command = runner.call_args.args[0]
            self.assertEqual(command, [
                str(cli), "code", "scan", str(root), "--layer", "L1,L2",
                "--format", "json", "--no-progress",
            ])
            self.assertFalse(runner.call_args.kwargs["shell"])
            self.assertNotIn("API_KEY", runner.call_args.kwargs["env"])
            self.assertEqual(result["scanner_exit_code"], 1)
            self.assertEqual(result["findings"][0]["file"], "src/app.py")
            self.assertNotIn("SECRET_NOT_ALLOWED_IN_RESPONSE", str(result))
            self.assertNotIn("secret error", str(result))

    def test_foreign_paths_redacted(self):
        output = quirinus.normalize_report({
            "findings": [{"severity": "Low", "target": "/etc/shadow",
                          "title": "Unsafe path", "line": 1}],
        }, Path("/workspace/vanilla"))
        self.assertEqual(output["findings"][0]["file"], "[redacted]")

    def test_nonzero_failure_and_timeout_are_not_success(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "source"
            root.mkdir()
            cli = Path(temp) / "vulnclaw"
            cli.write_text("#!/bin/sh\n", encoding="utf-8")
            cli.chmod(0o700)
            with patch.dict(os.environ, SAFE_ENV), \\
                 patch.object(quirinus, "_SOURCE_ROOT", root), \\
                 patch.object(quirinus, "_CLI_BIN", cli):
                with patch.object(quirinus.subprocess, "run",
                                  return_value=SimpleNamespace(returncode=2, stdout="", stderr="private")):
                    with self.assertRaises(HTTPException) as error:
                        quirinus.run_fixed_scan()
                    self.assertEqual(error.exception.status_code, 502)
                with patch.object(quirinus.subprocess, "run",
                                  side_effect=subprocess.TimeoutExpired("scan", 35)):
                    with self.assertRaises(HTTPException) as error:
                        quirinus.run_fixed_scan()
                    self.assertEqual(error.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
