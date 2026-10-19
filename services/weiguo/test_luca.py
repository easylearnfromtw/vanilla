"""Privacy, local rollups, and family owner boundary for LUCA."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import httpx
import luca
from auth import FamilyIdentity, family_user
import app as gateway


class LucaTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        config = patch.dict(os.environ, {"LUCA_ENABLED": "true",
                          "LUCA_DB": str(Path(temp.name) / "metrics.sqlite3"),
                          "LUCA_OTLP_ENDPOINT": ""})
        config.start()
        self.addCleanup(config.stop)
        with luca._LOCK:
            luca._EVENTS.clear()

    def get(self, path):
        async def call():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),
                                         base_url="http://weiguo.test") as client:
                return await client.get(path)
        return asyncio.run(call())

    def test_static_route_and_no_payload(self):
        luca.record_http("/v1/family/tasks/{task_id}", 200, 21)
        luca.record_http("/v1/family/tasks/secret?access_token=SECRET", 503, 100)
        luca.record("cream", "arbitrary secret prompt", 200, 20)
        report = luca.summary()
        self.assertEqual(report["count"], 1)
        self.assertEqual(report["daily"][0]["count"], 1)
        self.assertEqual(report["components"][0]["name"], "scouts")
        self.assertNotIn("SECRET", json.dumps(report))
        self.assertNotIn("prompt", json.dumps(report))

    def test_owner_auth_and_no_cache(self):
        self.assertEqual(self.get("/v1/family/luca/summary").status_code, 401)
        owner = FamilyIdentity("123456789012345678901", "Owner", "owner", "owner@example.org")
        member = FamilyIdentity("123456789012345678901", "Member", "member", "member@example.org")
        try:
            gateway.app.dependency_overrides[family_user] = lambda: member
            self.assertEqual(self.get("/v1/family/luca/summary").status_code, 403)
            gateway.app.dependency_overrides[family_user] = lambda: owner
            response = self.get("/v1/family/luca/summary")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers.get("cache-control"), "private, no-store")
            self.assertEqual(response.json()["scope"], "backend-only")
        finally:
            gateway.app.dependency_overrides.pop(family_user, None)

    def test_external_collector_refused(self):
        for target in ("https://telemetry.example.com/v1/traces",
                       "http://localhost:4318/v1/traces?secret=1",
                       "http://127.0.0.1:9999/v1/traces"):
            with self.subTest(target=target), patch.dict(os.environ, {"LUCA_OTLP_ENDPOINT": target}):
                with self.assertRaises(ValueError):
                    luca._local_otlp_endpoint()

    def test_diagnostics_and_opt_out(self):
        for _ in range(5):
            luca.record("scouts", "browser.execute", 503, 5200)
        report = luca.summary()
        self.assertEqual(report["failures"], 5)
        self.assertEqual(len(report["recommendations"]), 2)
        with patch.dict(os.environ, {"LUCA_ENABLED": "false"}):
            self.assertFalse(luca.summary()["enabled"])


if __name__ == "__main__":
    unittest.main()
