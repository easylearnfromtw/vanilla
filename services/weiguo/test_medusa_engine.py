"""Medusa unit tests: no Judge0 container or external network required."""
from __future__ import annotations

import asyncio
import os
import unittest
from unittest.mock import patch

import medusa_engine as medusa


class FakeResponse:
    def __init__(self, status_code=201, data=None):
        self.status_code = status_code
        self.data = data or {"status": {"id": 3, "description": "Accepted"},
                             "stdout": "42\n", "stderr": None}
        self.content = b'{}'

    def json(self):
        return self.data


class FakeClient:
    calls = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        pass

    async def post(self, url, **kwargs):
        self.calls.append((url, kwargs, self.kwargs))
        return FakeResponse()


class MedusaTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_and_restrict_endpoint(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(medusa.endpoint())
            with self.assertRaises(medusa.MedusaUnavailable):
                await medusa.execute_code("python", "print(1)")
        with patch.dict(os.environ, {"WEIGUO_MEDUSA_ENABLED": "true",
                                     "WEIGUO_MEDUSA_ISOLATED": "true",
                                     "WEIGUO_MEDUSA_URL": "http://169.254.169.254:2358"}):
            self.assertIsNone(medusa.endpoint())
        with patch.dict(os.environ, {"WEIGUO_MEDUSA_ENABLED": "true",
                                     "WEIGUO_MEDUSA_ISOLATED": "true",
                                     "WEIGUO_MEDUSA_URL": "http://medusa:2358"}):
            self.assertEqual(medusa.endpoint(), "http://medusa:2358")

    async def test_input_limits_and_allowlisted_languages(self):
        for lang, code, stdin in (("bash", "ls", ""), ("python", "", ""),
                                  ("python", "x" * 12001, ""),
                                  ("python", "print(1)", "a" * 2001),
                                  ("python", "x\0y", "")):
            with self.subTest(lang=lang):
                with self.assertRaises(ValueError):
                    medusa.validate_submission(lang, code, stdin)

    async def test_expected_judge0_payload(self):
        FakeClient.calls.clear()
        with patch.dict(os.environ, {"WEIGUO_MEDUSA_ENABLED": "true",
                                     "WEIGUO_MEDUSA_ISOLATED": "true",
                                     "WEIGUO_MEDUSA_URL": "http://medusa:2358"}), patch.object(
                medusa.httpx, "AsyncClient", FakeClient):
            result = await medusa.execute_code("python", "print(42)", "")
        self.assertEqual(result["stdout"], "42\n")
        self.assertTrue(result["success"])
        url, opts, client_opts = FakeClient.calls[0]
        self.assertTrue(url.startswith("http://medusa:2358/submissions?"))
        self.assertFalse(opts["json"]["enable_network"])
        self.assertLessEqual(opts["json"]["cpu_time_limit"], 2)
        self.assertFalse(client_opts["follow_redirects"])
        self.assertFalse(client_opts["trust_env"])

    async def test_failed_code_is_not_a_success(self):
        class CompileErrorClient(FakeClient):
            async def post(self, *_args, **_kwargs):
                return FakeResponse(data={"status": {"id": 6, "description": "Compilation Error"},
                                          "compile_output": "syntax error"})
        with patch.dict(os.environ, {"WEIGUO_MEDUSA_ENABLED": "true",
                                     "WEIGUO_MEDUSA_ISOLATED": "true",
                                     "WEIGUO_MEDUSA_URL": "http://medusa:2358"}), patch.object(
                medusa.httpx, "AsyncClient", CompileErrorClient):
            result = await medusa.execute_code("cpp", "bad syntax")
        self.assertFalse(result["success"])
        self.assertIn("syntax error", result["compile_output"])


if __name__ == "__main__":
    unittest.main()
