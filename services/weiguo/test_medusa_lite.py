"""Medusa Lite: deterministic, fail-closed AST interpreter regression tests."""
import asyncio
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from medusa_adapter import MedusaRunRequest, execute_medusa
import medusa_lite
from medusa_lite import run_subset, lite_status

ENABLED = {"MEDUSA_ENABLED": "true", "MEDUSA_ENGINE": "lite", "MEDUSA_LITE_ENABLED": "true"}


class LiteTests(unittest.TestCase):
    def test_disabled_without_explicit_three_flags(self):
        for key in ENABLED:
            with self.subTest(key=key), patch.dict(os.environ, {**ENABLED, key: "false"}):
                with self.assertRaises(HTTPException) as ex:
                    asyncio.run(execute_medusa(MedusaRunRequest(source_code="print(42)")))
                self.assertEqual(ex.exception.status_code, 503)


    def test_startup_proof_fails_closed_and_recovers_after_new_boot(self):
        with patch.dict(os.environ, ENABLED):
            self.assertTrue(medusa_lite.production_selftest())
            self.assertTrue(medusa_lite.enabled())
            with patch.object(medusa_lite, "run_subset", side_effect=RuntimeError("internal fault")):
                self.assertFalse(medusa_lite.production_selftest())
            self.assertFalse(medusa_lite.enabled())
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(execute_medusa(MedusaRunRequest(source_code="print(42)")))
            self.assertEqual(caught.exception.status_code, 503)
            self.assertTrue(medusa_lite.production_selftest())
            self.assertTrue(medusa_lite.enabled())

    def test_real_execution_and_status_no_external_cloud(self):
        with patch.dict(os.environ, ENABLED):
            ready = lite_status()
            self.assertTrue(ready["connected"])
            self.assertEqual(ready["backend"], "medusa-lite")
            result = asyncio.run(execute_medusa(MedusaRunRequest(source_code="print(40 + 2)")))
            self.assertEqual(result["stdout"], "42\n")
            self.assertEqual(result["backend"], "medusa-lite")
            self.assertTrue(result["accepted"])

    def test_assign_for_if_input_and_builtin_math(self):
        sample = ("total = 0\n"
                  "for i in range(10):\n"
                  "    total += i\n"
                  "if total == 45:\n"
                  "    print(total, sum(range(5)))\n"
                  "print(int(input()))\n")
        result = run_subset(sample, "17\n")
        self.assertTrue(result["accepted"], result)
        self.assertEqual(result["stdout"], "45 10\n17\n")

    def test_forbidden_python_cannot_access_host(self):
        programs = [
            "import os", "from os import environ",
            "print(__import__('os'))",
            "print(open('/etc/passwd').read())",
            "print((1).__class__)",
            "class X: pass",
            "def f(): return 1",
            "while True: pass",
            "print([x for x in range(20)])",
            "print(lambda: 1)",
            "print(f'{1}')",
            "print(globals())",
            "__builtins__ = 1",
            "print(eval('2+2'))",
            "print((1, 2)[0:1])",
            "print({'a': 1})",
        ]
        for program in programs:
            with self.subTest(program=program):
                result = run_subset(program)
                self.assertFalse(result["accepted"], result)
                self.assertNotIn("/etc/", result["stdout"])
                self.assertEqual(result["stdout"], "")

    def test_large_numbers_ranges_and_output_fail_closed(self):
        for program in [
            "print(10 ** 100)", "print(10 ** 13)",
            "for i in range(1000000): print(i)",
            "print('X' * 1000000)",
            "print('X' * 2048)\nprint('Y' * 2048)",
            "x = [1] * 9999999",
            "print(1 / 0)",
            "print(float('inf'))",
        ]:
            with self.subTest(program=program):
                result = run_subset(program)
                self.assertFalse(result["accepted"], result)
                self.assertLessEqual(len(result["stdout"].encode("utf-8")), 4096)

    def test_long_utf8_and_nul_rejected_before_parse(self):
        with patch.dict(os.environ, ENABLED):
            with self.assertRaises(HTTPException) as ex:
                asyncio.run(execute_medusa(MedusaRunRequest(source_code="界" * 1400)))
            self.assertEqual(ex.exception.status_code, 413)
            with self.assertRaises(HTTPException) as ex:
                asyncio.run(execute_medusa(MedusaRunRequest(source_code="print(1)\x00")))
            self.assertEqual(ex.exception.status_code, 400)

    def test_recoverable_user_errors_are_not_stack_traces(self):
        for source in ["x = 1\nprint(missing)", "print([1][100])", "print(1 / 0)"]:
            result = run_subset(source)
            self.assertFalse(result["accepted"])
            self.assertEqual(result["exit_code"], 1)
            self.assertNotIn("Traceback", result["stderr"])
            self.assertNotIn("/app/", result["stderr"])

    def test_no_imported_os_execution_from_user_source(self):
        with patch.dict(os.environ, ENABLED):
            result = asyncio.run(execute_medusa(
                MedusaRunRequest(source_code="import subprocess\nsubprocess.run(['echo', 'hello'])")))
            self.assertFalse(result["accepted"])
            self.assertEqual(result["status"], "Unsupported Syntax")


if __name__ == "__main__":
    unittest.main()
