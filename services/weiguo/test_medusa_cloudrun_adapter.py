"""Medusa Cloud Run adapter tests; exercise strict URL/secret and actual dispatch."""
import asyncio
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
import medusa_adapter
import medusa_cloudrun_adapter as cloud

SECRET = "cloud-gateway-unit-test-abcdefgh-0123456789-abcdefgh-9876543210"
URL = "https://medusa-cloud-abcd-uc.a.run.app"
ENV = {
    "MEDUSA_ENABLED": "true",
    "MEDUSA_ENGINE": "cloudrun",
    "MEDUSA_CLOUD_RUN_VERIFIED": "true",
    "MEDUSA_CLOUD_RUN_URL": URL,
    "MEDUSA_CLOUD_SHARED_SECRET": SECRET,
}


class FakeResponse:
    status_code = 200
    content = b'{"backend":"cloudrun-sandbox"}'
    def json(self):
        return {
            "engine": "medusa", "backend": "cloudrun-sandbox",
            "language": "python", "finished": True,
            "accepted": True, "status_id": 3, "status": "Accepted",
            "stdout": "42\\n", "stderr": "", "compile_output": "",
            "exit_code": 0, "time": "0.01", "memory": None,
        }


class FakeClient:
    last = None
    def __init__(self, *args, **kwargs):
        assert kwargs["trust_env"] is False
        assert kwargs["follow_redirects"] is False
    async def __aenter__(self):
        return self
    async def __aexit__(self, *args):
        return False
    async def post(self, url, **kwargs):
        FakeClient.last = (url, kwargs)
        return FakeResponse()


class CloudRunTests(unittest.TestCase):
    def test_strict_fail_closed_and_secret_is_independent(self):
        bad_configs = [
            {"MEDUSA_ENABLED": "false"},
            {"MEDUSA_CLOUD_RUN_VERIFIED": "false"},
            {"MEDUSA_ENGINE": "judge0"},
            {"MEDUSA_CLOUD_RUN_URL": "http://medusa-cloud-abcd-uc.a.run.app"},
            {"MEDUSA_CLOUD_RUN_URL": "https://localhost:8080"},
            {"MEDUSA_CLOUD_RUN_URL": "https://medusa-cloud-foo.a.run.app/redirect"},
            {"MEDUSA_CLOUD_RUN_URL": "https://medusa-cloud-foo.a.run.app@evil.com"},
            {"MEDUSA_CLOUD_RUN_URL": "https://medusa-cloud-foo.a.run.app:443"},
            {"MEDUSA_CLOUD_SHARED_SECRET": "short"},
            {"WEIGUO_ADMIN_TOKEN": SECRET},
        ]
        for override in bad_configs:
            with self.subTest(override=override), patch.dict(os.environ, {**ENV, **override}):
                with self.assertRaises(HTTPException) as context:
                    cloud.validated_cloud_config()
                self.assertEqual(context.exception.status_code, 503)

    def test_successful_python_dispatch_over_https(self):
        with patch.dict(os.environ, ENV), patch.object(cloud.httpx, "AsyncClient", FakeClient):
            result = asyncio.run(medusa_adapter.execute_medusa(
                medusa_adapter.MedusaRunRequest(source_code="print(42)")))
        self.assertEqual(result["stdout"], "42\\n")
        self.assertEqual(result["backend"], "cloudrun-sandbox")
        url, opts = FakeClient.last
        self.assertEqual(url, URL + "/v1/execute")
        self.assertEqual(opts["headers"]["Authorization"], "Bearer " + SECRET)
        self.assertEqual(opts["json"], {"source_code": "print(42)", "stdin": ""})
        self.assertNotIn("MEDUSA_CLOUD_SHARED_SECRET", opts["json"])

    def test_no_oversized_payloads(self):
        with patch.dict(os.environ, ENV):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(medusa_adapter.execute_medusa(
                    medusa_adapter.MedusaRunRequest(source_code="界" * 6000)))
        self.assertEqual(error.exception.status_code, 413)

    def test_no_unknown_engine(self):
        with patch.dict(os.environ, {**ENV,"MEDUSA_ENGINE":"unknown"}):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(medusa_adapter.execute_medusa(
                    medusa_adapter.MedusaRunRequest(source_code="print(42)")))
        self.assertEqual(error.exception.status_code,503)


if __name__ == "__main__":
    unittest.main()
