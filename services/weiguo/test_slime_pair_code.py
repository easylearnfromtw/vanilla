"""Integration/security tests for 12-character one-time Slime pairing codes."""
import os
import re
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request
from slime import (_db, _digest, PairRequest, pair, issue_short_pair,
                   normalize_short_code, PAIR_MAX_FAILED_PER_IP, INVITE_SECONDS,
                   _redeem_short_pair)


def fake_request(ip="192.0.2.44",headers=None):
    return Request({"type":"http","client":(ip,5150),
                    "headers":headers or []})


class SlimePairingCodeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        env=patch.dict(os.environ,{
            "SLIME_DB_PATH":self.tmp.name+"/nodes.sqlite",
            "SLIME_ENABLED":"true",
            "SLIME_PUBLIC_API_ORIGIN":"https://vanilla.example.net",
        })
        env.start()
        self.addCleanup(env.stop)

    def test_issue_code_has_entropy_and_is_only_hashed_at_rest(self):
        info=issue_short_pair("trusted-owner")
        code=info["code"]
        self.assertRegex(code,r"^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-(?:[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-)[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$")
        self.assertEqual(info["expires_seconds"],INVITE_SECONDS)
        self.assertEqual(info["link"],"https://vanilla.example.net/#slime="+code)
        with open(self.tmp.name+"/nodes.sqlite","rb") as storage:
            self.assertNotIn(code.encode(),storage.read())
        self.assertEqual(normalize_short_code(code.lower().replace("-"," ")),code.replace("-",""))
        self.assertIsNone(normalize_short_code("0000-0000-0000"))
        self.assertIsNone(normalize_short_code("bad input"))

    def test_pair_one_use_only_and_exclusive_owner_isolation(self):
        issued=issue_short_pair("owner-a")
        req=fake_request()
        result=pair(PairRequest(code=issued["code"].lower(),label="Work PC",role="friend"),req)
        self.assertEqual(result["heartbeat_interval_seconds"],60)
        self.assertFalse(result["inference_enabled"])
        self.assertGreaterEqual(len(result["token"]),32)
        with _db() as db:
            row=db.execute("SELECT owner,token_digest,role FROM nodes WHERE id=?",
                           (result["node_id"],)).fetchone()
        self.assertEqual(row["owner"],"owner-a")
        self.assertEqual(row["role"],"friend")
        self.assertEqual(row["token_digest"],_digest(result["token"]))
        with self.assertRaises(HTTPException) as denied:
            pair(PairRequest(code=issued["code"],label="Replay PC",role="friend"),req)
        self.assertEqual(denied.exception.status_code,403)
        self.assertNotEqual(issued["code"],issue_short_pair("owner-b")["code"])

    def test_expired_code_and_invalid_attempts_are_rate_limited(self):
        issued=issue_short_pair("owner-a")
        with _db() as db:
            db.execute("UPDATE slime_short_pair SET expires=?",
                       (time.time()-1,))
        with self.assertRaises(HTTPException) as expired:
            pair(PairRequest(code=issued["code"],label="Old PC",role="friend"),fake_request())
        self.assertEqual(expired.exception.status_code,403)
        bad="ABCD-EFGH-JKMP"
        for i in range(PAIR_MAX_FAILED_PER_IP-1):
            with self.assertRaises(HTTPException) as invalid:
                pair(PairRequest(code=bad,label="Fake",role="friend"),fake_request())
            self.assertEqual(invalid.exception.status_code,403)
        with self.assertRaises(HTTPException) as blocked:
            pair(PairRequest(code=bad,label="Fake",role="friend"),fake_request())
        self.assertEqual(blocked.exception.status_code,429)
        # Client-supplied forwarding headers must never bypass the actual observed peer IP.
        forwarded=fake_request(headers=[(b"x-forwarded-for",b"1.2.3.4")])
        with self.assertRaises(HTTPException) as spoofed:
            pair(PairRequest(code=bad,label="Fake",role="friend"),forwarded)
        self.assertEqual(spoofed.exception.status_code,429)

    def test_old_legacy_long_invites_remain_a_different_one_time_path(self):
        from slime import JoinRequest,join
        legacy="R"*43
        with _db() as db:
            db.execute("INSERT INTO invites VALUES(?,?,?)",
                       (_digest(legacy),"owner-legacy",time.time()+600))
        result=join(JoinRequest(invite=legacy,label="Old Client",role="friend"))
        self.assertEqual(len(result["node_id"]),24)
        with self.assertRaises(HTTPException):
            pair(PairRequest(code=legacy,label="Wrong Endpoint"),fake_request())


if __name__=="__main__":
    unittest.main()
