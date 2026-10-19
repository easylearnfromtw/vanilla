"""No Google network calls: mock the cryptographic verifier, not its claims."""
import asyncio
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import auth
import tasks
from fastapi import HTTPException

SUB_A = "123456789012345678901"
SUB_B = "234567890123456789012"
CLIENT = "test-client.apps.googleusercontent.com"
SECRET = "test-session-secret-unique-from-admin-32chars-at-least"


def claims(sub=SUB_A, email="member@example.com", verified=True):
    return {"sub": sub, "email": email, "email_verified": verified,
            "iss": "https://accounts.google.com", "aud": CLIENT,
            "exp": int(time.time()) + 300}


class WeiGuoAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {
            "WEIGUO_GOOGLE_CLIENT_ID": CLIENT,
            "WEIGUO_SESSION_SECRET": SECRET,
            "WEIGUO_ADMIN_TOKEN": "different-operator-key-32-characters",
            "WEIGUO_TASK_DB": str(Path(self.temp.name) / "tasks.db"),
            "WEIGUO_FAMILY_ACL_JSON": '{"' + SUB_A + '":{"member":"哲愷","role":"member"},'
                                      '"' + SUB_B + '":{"member":"曉芬","role":"viewer"}}',
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def login(self, info=None):
        with patch.object(auth.id_token, "verify_oauth2_token", return_value=info or claims()):
            return auth.google_login("header." + ("x"*150) + ".signature")

    def test_verified_google_sub_and_session(self):
        token, user = self.login()
        self.assertEqual(user.member, "哲愷")
        self.assertEqual(auth.verify_family_token(token).sub, SUB_A)
        self.assertEqual(asyncio.run(auth.family_reader("Bearer " + token)).role, "member")
        self.assertNotIn(SECRET, token)
        self.assertNotIn("different-operator", token)

    def test_unknown_google_account_is_denied(self):
        with self.assertRaises(HTTPException) as error:
            self.login(claims("333333333333333333333"))
        self.assertEqual(error.exception.status_code, 403)

    def test_unverified_email_denied(self):
        with self.assertRaises(HTTPException):
            self.login(claims(verified=False))

    def test_reject_forged_and_expired_tokens(self):
        token, _ = self.login()
        with self.assertRaises(HTTPException):
            auth.verify_family_token(token[:-4] + "aaaa")
        with patch.object(auth.time, "time", return_value=time.time()+901):
            with self.assertRaises(HTTPException):
                auth.verify_family_token(token)
        with self.assertRaises(HTTPException):
            auth.verify_family_token("Bearer google-drive-access-token")

    def test_acl_revocation_is_immediate(self):
        token, _ = self.login()
        os.environ["WEIGUO_FAMILY_ACL_JSON"] = "{}"
        with self.assertRaises(HTTPException) as error:
            auth.verify_family_token(token)
        self.assertEqual(error.exception.status_code, 403)

    def test_role_changes_take_effect_immediately(self):
        token, _ = self.login()
        os.environ["WEIGUO_FAMILY_ACL_JSON"] = '{"' + SUB_A + '":{"member":"哲愷","role":"viewer"}}'
        self.assertEqual(auth.verify_family_token(token).role, "viewer")
        with self.assertRaises(HTTPException) as error:
            asyncio.run(auth.family_reader("Bearer " + token))
        self.assertEqual(error.exception.status_code, 403)

    def test_session_secret_missing_or_equals_admin_fails_closed(self):
        with patch.dict(os.environ, {"WEIGUO_SESSION_SECRET":"short"}):
            with self.assertRaises(HTTPException) as error:
                self.login()
            self.assertEqual(error.exception.status_code, 503)
        with patch.dict(os.environ, {"WEIGUO_SESSION_SECRET":os.environ["WEIGUO_ADMIN_TOKEN"]}):
            with self.assertRaises(HTTPException):
                self.login()

    def test_isolated_task_ownership_and_rate_limit(self):
        tasks.initialize()
        for i in range(6):
            job=tasks.start("https://example.org", [{"action":"extract"}], owner_sub=SUB_A, limit_per_minute=6)
            self.assertIsNotNone(tasks.fetch(job["id"], owner_sub=SUB_A))
            self.assertIsNone(tasks.fetch(job["id"], owner_sub=SUB_B))
        with self.assertRaisesRegex(ValueError, "上限"):
            tasks.start("https://example.org", [{"action":"extract"}], owner_sub=SUB_A, limit_per_minute=6)
        other=tasks.start("https://example.org", [{"action":"extract"}], owner_sub=SUB_B, limit_per_minute=6)
        self.assertIsNone(tasks.fetch(other["id"],owner_sub=SUB_A))

    def test_schema_migration_legacy_tasks_remain_operator_only(self):
        import sqlite3
        filename=os.environ["WEIGUO_TASK_DB"]
        with sqlite3.connect(filename) as db:
            db.execute("CREATE TABLE tasks (id TEXT PRIMARY KEY,state TEXT NOT NULL,url TEXT NOT NULL,"
                       "steps TEXT NOT NULL,result TEXT,error TEXT,created_at INTEGER NOT NULL,"
                       "updated_at INTEGER NOT NULL)")
            db.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?)",
                       ("legacy","completed","https://example.org","[]",None,None,1,1))
        self.assertIsNotNone(tasks.fetch("legacy"))
        self.assertIsNone(tasks.fetch("legacy",owner_sub=SUB_A))


if __name__ == "__main__":
    unittest.main()
