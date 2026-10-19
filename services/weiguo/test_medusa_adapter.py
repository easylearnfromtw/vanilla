"""Medusa contract and security regression tests (no real Judge0 required)."""
import asyncio
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
import medusa_adapter as medusa
from policy import private_operator_route


SAFE_ENV = {
    "MEDUSA_ENABLED": "true",
    "MEDUSA_SANDBOX_EGRESS_BLOCKED": "true",
    "MEDUSA_JUDGE0_URL": "http://judge0:2358",
    "MEDUSA_PYTHON_LANGUAGE_ID": "109",
}


class FakeResponse:
    status_code = 201
    content = b'{"ok": true}'

    def json(self):
        return {
            "status": {"id": 3, "description": "Accepted"},
            "stdout": "2\\n",
            "stderr": None,
            "compile_output": None,
            "exit_code": 0,
            "time": "0.01",
            "memory": 1234,
        }


class FakeClient:
    calls = []

    def __init__(self, *args, **kwargs):
        self.calls = FakeClient.calls
        assert kwargs.get("trust_env") is False
        assert kwargs.get("follow_redirects") is False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse()


class MedusaTests(unittest.TestCase):
    def test_disabled_fails_closed(self):
        with patch.dict(os.environ, {"MEDUSA_ENABLED": "false"}):
            with self.assertRaises(HTTPException) as error:
                medusa.validated_config()
        self.assertEqual(error.exception.status_code, 503)

    def test_operator_route_never_on_public_family_origin(self):
        self.assertTrue(private_operator_route("/v1/operator/medusa/run"))
        self.assertFalse(private_operator_route("/v1/family/tasks"))

    def test_config_requires_isolation_and_pinned_internal_endpoint(self):
        for key, value in [
            ("MEDUSA_SANDBOX_EGRESS_BLOCKED", "false"),
            ("MEDUSA_JUDGE0_URL", "https://evil.example.com"),
            ("MEDUSA_JUDGE0_URL", "http://judge0:2358/other"),
            ("MEDUSA_PYTHON_LANGUAGE_ID", "0"),
        ]:
            with self.subTest(key=key), patch.dict(os.environ, {**SAFE_ENV, key: value}):
                with self.assertRaises(HTTPException):
                    medusa.validated_config()

    def test_bounded_execution_uses_fixed_endpoint_and_resource_limits(self):
        FakeClient.calls = []
        with patch.dict(os.environ, SAFE_ENV), patch.object(medusa.httpx, "AsyncClient", FakeClient):
            result = asyncio.run(medusa.execute_medusa(medusa.MedusaRunRequest(
                source_code="print(1+1)", stdin="")))
        self.assertTrue(result["accepted"])
        self.assertEqual(result["engine"], "medusa")
        self.assertEqual(result["stdout"], "2\\n")
        url, options = FakeClient.calls[0]
        self.assertEqual(url, "http://judge0:2358/submissions")
        self.assertEqual(options["json"]["cpu_time_limit"], 2)
        self.assertEqual(options["json"]["wall_time_limit"], 5)
        self.assertEqual(options["json"]["memory_limit"], 128000)
        self.assertFalse(options["json"]["enable_network"])
        self.assertEqual(options["json"]["number_of_runs"], 1)
        self.assertEqual(options["json"]["max_processes_and_or_threads"], 8)
        self.assertEqual(options["json"]["max_file_size"], 256)
        self.assertEqual(options["json"]["language_id"], 109)
        self.assertNotIn("MEDUSA_JUDGE0_URL", options["json"])

    def test_oversized_utf8_submission_is_rejected(self):
        with patch.dict(os.environ, SAFE_ENV):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(medusa.execute_medusa(medusa.MedusaRunRequest(
                    source_code="界" * 6000)))
        self.assertEqual(error.exception.status_code, 413)

    def test_result_output_is_bounded_and_pending_never_claimed_done(self):
        result = medusa.parse_result({
            "status": {"id": 6, "description": "Compilation Error"},
            "stderr": "x" * 90000, "exit_code": 1,
        })
        self.assertFalse(result["accepted"])
        self.assertEqual(len(result["stderr"]), 4096)
        with self.assertRaises(HTTPException):
            medusa.parse_result({"status": {"id": 2, "description": "Processing"}})


if __name__ == "__main__":
    unittest.main()
