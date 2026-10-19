"""Contract tests for standalone HMAC worker and WeiGuo HTTPS gateway."""
from __future__ import annotations

import base64
import importlib.util
import os
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch

import httpx
import pdfcraft_remote as remote
from pdfcraft_wire import (
    WireDenied, sign_request, verify_request, READY_PATH, COMBINE_PATH,
)

WORKER_ROOT = Path(__file__).resolve().parents[1] / "pdfcraft-worker"
spec = importlib.util.spec_from_file_location("independent_pdfcraft_worker", WORKER_ROOT / "worker_api.py")
assert spec and spec.loader
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

SECRET = "ab" * 32
ENV = {
    "WEIGUO_PDFCRAFT_WORKER_SECRET": SECRET,
    "WEIGUO_PDFCRAFT_REMOTE_ENABLED": "true",
    "WEIGUO_PDFCRAFT_WORKER_URL": "https://isolated.example.com",
}


def sample_pdf() -> bytes:
    return b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


class WireContract(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        worker._replay.clear()

    def test_nonce_expiry_mac_body_tamper_and_replay(self):
        with patch.dict(os.environ, ENV):
            ts = int(time.time())
            headers = sign_request("POST", COMBINE_PATH, b"body", timestamp=ts, nonce="a"*32)
            lower = {key.lower(): value for key, value in headers.items()}
            used = {}
            verify_request("POST", COMBINE_PATH, b"body", lower, used, now=ts)
            with self.assertRaises(WireDenied):
                verify_request("POST", COMBINE_PATH, b"body", lower, used, now=ts)
            with self.assertRaises(WireDenied):
                verify_request("POST", COMBINE_PATH, b"modified", lower, {}, now=ts)
            with self.assertRaises(WireDenied):
                verify_request("POST", COMBINE_PATH, b"body", lower, {}, now=ts + 100)
            with self.assertRaises(WireDenied):
                sign_request("DELETE", COMBINE_PATH)
        with patch.dict(os.environ, {"WEIGUO_PDFCRAFT_WORKER_SECRET": ""}):
            with self.assertRaises(WireDenied):
                sign_request("GET", READY_PATH)

    async def test_worker_requires_signature_and_runtime_proof(self):
        with patch.dict(os.environ, ENV):
            transport = httpx.ASGITransport(app=worker.app)
            async with httpx.AsyncClient(transport=transport, base_url=ENV["WEIGUO_PDFCRAFT_WORKER_URL"]) as client:
                self.assertEqual((await client.get(READY_PATH)).status_code, 401)
                headers = sign_request("GET", READY_PATH)
                self.assertEqual((await client.get(READY_PATH, headers=headers)).status_code, 503)
                with patch.object(worker, "available", return_value=True):
                    response = await client.get(READY_PATH, headers=sign_request("GET", READY_PATH))
                    self.assertEqual(response.status_code, 200)
                    self.assertTrue(response.json()["ready"])
                    self.assertEqual((await client.post(COMBINE_PATH, content=b"bad")).status_code, 401)

    async def test_gateway_to_worker_over_signed_transport(self):
        original_client = httpx.AsyncClient
        transport = httpx.ASGITransport(app=worker.app)
        def client_factory(**kwargs):
            return original_client(transport=transport, base_url=ENV["WEIGUO_PDFCRAFT_WORKER_URL"],
                                   follow_redirects=False, timeout=kwargs.get("timeout"))
        docs = [base64.b64encode(sample_pdf()).decode()] * 2
        with patch.dict(os.environ, ENV), patch.object(remote.httpx, "AsyncClient", side_effect=client_factory), \
             patch.object(worker, "available", return_value=True), \
             patch.object(worker, "combine_pdfs", return_value=sample_pdf()):
            self.assertTrue(await remote.remote_ready())
            output = await remote.combine_pdfs(docs)
            self.assertEqual(output, sample_pdf())
        with patch.dict(os.environ, ENV),patch.object(remote.httpx,"AsyncClient",side_effect=client_factory), \
             patch.object(worker,"available",return_value=False):
            self.assertFalse(await remote.remote_ready())

    async def test_fail_closed_on_invalid_remote_url(self):
        for url in ["http://untrusted.example", "https://127.0.0.1", "https://localhost",
                    "https://good.test/redirect", "https://name:secret@good.test"]:
            with self.subTest(url=url), patch.dict(os.environ,{**ENV,"WEIGUO_PDFCRAFT_WORKER_URL":url}):
                self.assertIsNone(remote.remote_origin())
                with self.assertRaises(remote.PdfCraftUnavailable):
                    await remote.combine_pdfs([base64.b64encode(sample_pdf()).decode()] * 2)


if __name__=="__main__":
    unittest.main()
