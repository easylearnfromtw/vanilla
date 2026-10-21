"""Real ASGI tests of October's disabled-by-default, authenticated receipt gateway."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

import app as gateway
import auth
from ceres_gateway import _session

ALICE = "123456789012345678901"
BOB = "223456789012345678901"
VIEWER = "323456789012345678901"
RECEIPT_KEY = "october-only-receipt-secret-that-is-not-family-auth-2026"


class OctoberReceiptTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        env = patch.dict(os.environ, {
            "CERES_DB_PATH": str(Path(temp.name) / "october-test.sqlite3"),
            "WEIGUO_SESSION_SECRET": "independent-long-family-secret-private-00001",
            "WEIGUO_ADMIN_TOKEN": "operator-token-other-than-session-secret-00002",
            "WEIGUO_FAMILY_ACL_JSON": json.dumps({
                ALICE: {"member": "Alice", "role": "owner"},
                BOB: {"member": "Bob", "role": "member"},
                VIEWER: {"member": "Observer", "role": "viewer"},
            }),
            "OCTOBER_SERVER_READONLY_ENABLED": "true",
            "OCTOBER_RECEIPT_SECRET": RECEIPT_KEY,
            "WEIGUO_GMAIL_ACL_ENFORCE": "false",
        })
        env.start()
        self.addCleanup(env.stop)
        self.sample = {
            "task_id": "october_task_0001",
            "kind": "csv-descriptive-statistics",
            "source": "trial.csv",
            "csv": "月份,數值\n一月,5\n二月,7\n三月,6",
        }

    def token(self, subject):
        now = int(time.time())
        payload = {"v": 1, "aud": "weiguo-family", "sub": subject,
                   "email": "user@example.org", "iat": now, "exp": now + 600}
        message = auth._encode(json.dumps(payload, separators=(",", ":")).encode())
        mac = hmac.new(os.environ["WEIGUO_SESSION_SECRET"].encode(),
                       message.encode(), hashlib.sha256).digest()
        return {"Authorization": "Bearer " + message + "." + auth._encode(mac)}

    def http(self, method, path, **kwargs):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),
                                         base_url="http://october.test") as client:
                return await client.request(method, path, **kwargs)
        return asyncio.run(run())

    def test_end_to_end_authenticated_readonly_receipt(self):
        result = self.http("POST", "/v1/family/october/csv",
                           headers=self.token(ALICE), json=self.sample)
        self.assertEqual(result.status_code, 200, result.text)
        data = result.json()
        self.assertEqual(data["result"]["metrics"][0]["mean"], 6)
        self.assertEqual(data["result"]["metrics"][0]["sum"], 18)
        self.assertEqual(data["result"]["metrics"][0]["sampleStdDev"], 1)
        self.assertFalse(data["result"]["modelInvoked"])
        self.assertFalse(data["replayed"])
        self.assertEqual(len(data["receipt"]["signature"]), 64)
        self.assertNotIn(self.sample["csv"], json.dumps(data["receipt"]))
        fetched = self.http("GET", "/v1/family/october/receipts/october_task_0001",
                            headers=self.token(ALICE))
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["resultSha256"],
                         data["receipt"]["resultSha256"])

    def test_missing_identity_viewer_and_revoked_session_fail_closed(self):
        self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                   json=self.sample).status_code, 401)
        self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                   json=self.sample, headers=self.token(VIEWER)).status_code, 403)
        alice = self.token(ALICE)
        os.environ["WEIGUO_FAMILY_ACL_JSON"] = json.dumps({
            BOB: {"member": "Bob", "role": "member"}})
        self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                   json=self.sample, headers=alice).status_code, 403)

    def test_multi_tenant_data_and_receipts_are_isolated(self):
        a = self.http("POST", "/v1/family/october/csv", headers=self.token(ALICE),
                      json=self.sample)
        self.assertEqual(a.status_code, 200)
        b = self.http("GET", "/v1/family/october/receipts/october_task_0001",
                      headers=self.token(BOB))
        self.assertEqual(b.status_code, 404)
        different = dict(self.sample, csv="A,B\nx,1\ny,3")
        bwrite = self.http("POST", "/v1/family/october/csv",
                           headers=self.token(BOB), json=different)
        self.assertEqual(bwrite.status_code, 200)
        self.assertNotEqual(a.json()["receipt"]["resultSha256"],
                            bwrite.json()["receipt"]["resultSha256"])

    def test_exact_retry_is_idempotent_but_changed_payload_is_rejected(self):
        first = self.http("POST", "/v1/family/october/csv",
                          headers=self.token(ALICE), json=self.sample)
        again = self.http("POST", "/v1/family/october/csv",
                          headers=self.token(ALICE), json=self.sample)
        self.assertEqual(again.status_code, 200)
        self.assertTrue(again.json()["replayed"])
        self.assertEqual(first.json()["receipt"], again.json()["receipt"])
        altered = dict(self.sample, csv="月份,數值\n一月,5\n二月,8")
        self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                   headers=self.token(ALICE), json=altered).status_code, 409)
        with _session() as db:
            count = db.execute("SELECT COUNT(*) FROM october_readonly_receipts").fetchone()[0]
        self.assertEqual(count, 1)

    def test_receipt_tampering_is_detected(self):
        response = self.http("POST", "/v1/family/october/csv",
                             headers=self.token(ALICE), json=self.sample)
        self.assertEqual(response.status_code, 200)
        with _session() as db:
            db.execute("UPDATE october_readonly_receipts SET result_sha256=?",
                       ("0" * 64,))
        get = self.http("GET", "/v1/family/october/receipts/october_task_0001",
                        headers=self.token(ALICE))
        self.assertEqual(get.status_code, 409)

    def test_unconfigured_server_is_disabled_and_key_is_distinct(self):
        os.environ["OCTOBER_SERVER_READONLY_ENABLED"] = "false"
        self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                   json=self.sample, headers=self.token(ALICE)).status_code, 503)
        os.environ["OCTOBER_SERVER_READONLY_ENABLED"] = "true"
        os.environ["OCTOBER_RECEIPT_SECRET"] = os.environ["WEIGUO_SESSION_SECRET"]
        self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                   json=self.sample, headers=self.token(ALICE)).status_code, 503)

    def test_unknown_task_execution_fields_are_rejected(self):
        for field, value in [("kind", "deploy"), ("tenant", BOB),
                             ("tool", "exec"), ("script", "print('unsafe')")]:
            req = dict(self.sample, **{field: value})
            result = self.http("POST", "/v1/family/october/csv",
                               json=req, headers=self.token(ALICE))
            self.assertEqual(result.status_code, 422, result.text)

    def test_raw_csv_is_never_persisted_even_with_inert_instruction_cells(self):
        secret = "do-not-store-the-raw-secret"
        payload = dict(self.sample, csv="動作,值\n" + secret + ",3\n=HYPERLINK(),5")
        result = self.http("POST", "/v1/family/october/csv",
                           headers=self.token(ALICE), json=payload)
        self.assertEqual(result.status_code, 200, result.text)
        contents = Path(os.environ["CERES_DB_PATH"]).read_bytes()
        self.assertNotIn(secret.encode(), contents)
        self.assertNotIn(payload["csv"].encode(), contents)

    def test_malformed_nonnumeric_and_large_csv_rejected_without_receipt(self):
        for text in ['x,y\n1,"bad', "name,label\nabc,def\nhij,klm",
                     "a,a\nx,2", "a,b\nx,5,unexpected"]:
            result = self.http("POST", "/v1/family/october/csv",
                               json=dict(self.sample, csv=text), headers=self.token(ALICE))
            self.assertEqual(result.status_code, 422, text)
        with _session() as db:
            db.execute("CREATE TABLE IF NOT EXISTS october_readonly_receipts("
                       "tenant_sub TEXT, task_id TEXT)")
            count = db.execute("SELECT COUNT(*) FROM october_readonly_receipts").fetchone()[0]
        self.assertEqual(count, 0)

    def test_expired_receipt_is_not_replayed_or_readable(self):
        import october_readonly
        self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                   headers=self.token(ALICE), json=self.sample).status_code, 200)
        old = int(time.time()) - 31 * 86400
        with _session() as db:
            row = db.execute("SELECT * FROM october_readonly_receipts").fetchone()
            sig = october_readonly._sign(RECEIPT_KEY.encode(), ALICE,
                                         row["task_id"], row["input_sha256"],
                                         row["result_sha256"], old)
            db.execute("UPDATE october_readonly_receipts SET created_at=?, signature=?",
                       (old, sig))
        get = self.http("GET", "/v1/family/october/receipts/october_task_0001",
                        headers=self.token(ALICE))
        self.assertEqual(get.status_code, 404)
        replay = self.http("POST", "/v1/family/october/csv",
                           headers=self.token(ALICE), json=self.sample)
        self.assertEqual(replay.status_code, 200)
        self.assertFalse(replay.json()["replayed"])

    def test_extreme_numeric_inputs_return_validation_error(self):
        examples = [
            "name,value\na,1e308\nb,1e308",
            "name,value\na," + "9" * 90,
            "name,value\na,1e9999",
        ]
        for number, data in enumerate(examples):
            payload = dict(self.sample, task_id=f"october_extreme_{number:04d}", csv=data)
            response = self.http("POST", "/v1/family/october/csv",
                                 headers=self.token(ALICE), json=payload)
            self.assertEqual(response.status_code, 422, response.text)
    def test_receipt_quota_rejects_before_numeric_calculation(self):
        for index in range(12):
            payload = dict(self.sample, task_id=f"october_bounded_{index:04d}")
            response = self.http("POST", "/v1/family/october/csv",
                                 headers=self.token(ALICE), json=payload)
            self.assertEqual(response.status_code, 200)
        import october_readonly
        with patch.object(october_readonly, "_calculate",
                          side_effect=AssertionError("unexpected work")):
            attempt = self.http("POST", "/v1/family/october/csv",
                                headers=self.token(ALICE),
                                json=dict(self.sample, task_id="october_bounded_9999"))
        self.assertEqual(attempt.status_code, 429)

    def test_replayed_requests_have_independent_request_quota(self):
        actor = self.token(ALICE)
        for _ in range(60):
            response = self.http("POST", "/v1/family/october/csv",
                                 headers=actor, json=self.sample)
            self.assertEqual(response.status_code, 200, response.text)
        response = self.http("POST", "/v1/family/october/csv",
                             headers=actor, json=self.sample)
        self.assertEqual(response.status_code, 429)
        other = self.http("POST", "/v1/family/october/csv",
                          headers=self.token(BOB), json=self.sample)
        self.assertEqual(other.status_code, 200)

    def test_per_subject_rate_limit(self):
        for i in range(12):
            req = dict(self.sample, task_id=f"october_rate_{i:04d}")
            self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                       json=req, headers=self.token(ALICE)).status_code, 200)
        blocked = dict(self.sample, task_id="october_rate_9999")
        self.assertEqual(self.http("POST", "/v1/family/october/csv",
                                   json=blocked, headers=self.token(ALICE)).status_code, 429)


if __name__ == "__main__":
    unittest.main()
