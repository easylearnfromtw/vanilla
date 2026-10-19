"""Cloud Run Medusa worker contract tests; no cloud credentials required."""
from __future__ import annotations
import asyncio
import os
import unittest
from unittest.mock import patch

import httpx
import app as worker

SECRET = "unit-test-cloud-gateway-secret-0123456789-abcdef-9876543210"


class WorkerTests(unittest.TestCase):
    def api(self, method, path, **kwargs):
        async def request():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=worker.app),
                base_url="http://medusa.internal"
            ) as client:
                return await client.request(method, path, **kwargs)
        return asyncio.run(request())

    def test_absent_cloudrun_launcher_fails_closed(self):
        with patch.dict(os.environ, {"MEDUSA_CLOUD_SHARED_SECRET": SECRET, "K_SERVICE": "medusa"}, clear=True):
            self.assertEqual(self.api("GET", "/v1/status", headers={"Authorization":"Bearer "+SECRET}).status_code, 503)
            self.assertEqual(self.api("POST", "/v1/execute", json={"source_code":"print(1)"},
                                      headers={"Authorization":"Bearer "+SECRET}).status_code, 503)

    def test_worker_auth_and_request_validation(self):
        with patch.dict(os.environ, {"MEDUSA_CLOUD_SHARED_SECRET": SECRET, "K_SERVICE": "medusa"}, clear=True), \
             patch.object(worker.os.path, "isfile", return_value=True), \
             patch.object(worker, "_execute_sandbox", return_value={
                 "engine":"medusa","backend":"cloudrun-sandbox","finished":True,
                 "accepted":True,"status_id":3,"status":"Accepted","stdout":"42\\n",
                 "stderr":"","compile_output":"","exit_code":0,"time":"0.001","memory":None,
                 "language":"python"
             }) as executor:
            self.assertEqual(self.api("GET","/v1/status").status_code,401)
            self.assertEqual(self.api("GET","/v1/status",
                headers={"Authorization":"Bearer bad"}).status_code,401)
            self.assertTrue(self.api("GET","/v1/status",
                headers={"Authorization":"Bearer "+SECRET}).json()["ready"])
            headers={"Authorization":"Bearer "+SECRET}
            self.assertEqual(self.api("POST","/v1/execute",json={"source_code":"x" * 16001},headers=headers).status_code,422)
            self.assertEqual(self.api("POST","/v1/execute",json={"source_code":"界" * 6000},headers=headers).status_code,413)
            self.assertEqual(self.api("POST","/v1/execute",json={"source_code":"a"+chr(0)},headers=headers).status_code,400)
            res=self.api("POST","/v1/execute",json={"source_code":"print(42)","stdin":""},headers=headers)
            self.assertEqual(res.status_code,200,res.text)
            self.assertEqual(res.json()["stdout"],"42\\n")
            self.assertEqual(res.headers.get("cache-control"),"no-store, private")
            executor.assert_called_once_with("print(42)", "")

    def test_cli_is_required_and_source_never_runs_on_host(self):
        with patch.dict(os.environ, {"MEDUSA_CLOUD_SHARED_SECRET": SECRET, "K_SERVICE":"medusa"}, clear=True), \
             patch.object(worker.os.path, "isfile", return_value=True), \
             patch.object(worker.subprocess, "Popen", side_effect=OSError("fake")) as popen:
            with self.assertRaises(worker.HTTPException) as error:
                worker._execute_sandbox("print(1)", "")
            self.assertEqual(error.exception.status_code, 502)
            argv=popen.call_args.args[0]
            self.assertEqual(argv[0], worker._SANDBOX)
            self.assertEqual(argv[1], "do")
            self.assertIn("--sandbox-name",argv)
            self.assertNotIn("--allow-egress", argv)
            self.assertIn("-I",argv)
            self.assertIn("print(1)",argv)
            self.assertTrue(popen.call_args.kwargs["start_new_session"])


if __name__=="__main__":
    unittest.main()
