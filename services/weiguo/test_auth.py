"""Regression tests for server-verified Google identity and family task isolation.

Never trust client-submitted member names, roles, email addresses or Drive tokens.
"""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from auth import google_login, verify_family_token, _decode, _encode, SESSION_SECONDS
import tasks


class FamilyAuthenticationTests(unittest.TestCase):
    SUB_A = "123456789012345678901"
    SUB_B = "987654321098765432109"

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        config = {
            "WEIGUO_TASK_DB": str(Path(self.temp.name) / "tasks.sqlite3"),
            "WEIGUO_GOOGLE_CLIENT_ID": "test-client.apps.googleusercontent.com",
            "WEIGUO_SESSION_SECRET": "distinct-high-entropy-family-session-secret-at-least-32",
            "WEIGUO_ADMIN_TOKEN": "different-admin-secret-not-the-session-signing-key",
            "WEIGUO_FAMILY_ACL_JSON": json.dumps({
                self.SUB_A: {"member": "Member A", "role": "member"},
                self.SUB_B: {"member": "Member B", "role": "viewer"},
            }),
        }
        env = patch.dict(os.environ, config)
        env.start()
        self.addCleanup(env.stop)

    def claims(self, sub=None):
        return {"sub": sub or self.SUB_A, "email": "a@example.com",
                "email_verified": True, "iss": "https://accounts.google.com"}

    def login(self, claims=None):
        with patch("auth.id_token.verify_oauth2_token",
                   return_value=claims if claims is not None else self.claims()) as verifier:
            token, who = google_login("x" * 160)
            verifier.assert_called_once()
            self.assertEqual(verifier.call_args.kwargs["audience"],
                             os.environ["WEIGUO_GOOGLE_CLIENT_ID"])
            return token, who

    def test_valid_identity_bound_to_google_sub_and_backend_acl(self):
        token, who = self.login()
        self.assertEqual(who.member, "Member A")
        self.assertEqual(who.role, "member")
        self.assertEqual(verify_family_token(token).sub, self.SUB_A)
        self.assertNotIn(os.environ["WEIGUO_ADMIN_TOKEN"], token)

    def test_wrong_subject_and_unverified_email_rejected(self):
        cases = [
            self.claims("111111111111111111111"),
            {**self.claims(), "email_verified": False},
            {**self.claims(), "iss": "https://not-google.example"},
            {**self.claims(), "sub": "invalid-user-controlled-id"},
        ]
        for claim in cases:
            with self.subTest(claim=claim), patch("auth.id_token.verify_oauth2_token",
                                                 return_value=claim):
                with self.assertRaises(HTTPException) as exc:
                    google_login("x" * 160)
                self.assertIn(exc.exception.status_code, (401, 403))

    def test_google_signature_failure_rejected_and_token_not_logged(self):
        with patch("auth.id_token.verify_oauth2_token", side_effect=ValueError("invalid token")):
            with self.assertRaises(HTTPException) as exc:
                google_login("x" * 160)
        self.assertEqual(exc.exception.status_code, 401)
        self.assertNotIn("invalid token", str(exc.exception.detail))

    def test_tamper_and_expiry_rejected(self):
        token, _ = self.login()
        encoded, mac = token.split(".")
        for value in ("", "garbage", encoded + ".wrong", encoded + "." + mac[:-1] + "A"):
            if value == token:
                continue
            with self.subTest(value=value[:15]), self.assertRaises(HTTPException):
                verify_family_token(value)
        with patch("auth.time.time", return_value=20_000_000):
            short, _ = self.login()
        with patch("auth.time.time", return_value=20_000_000 + SESSION_SECONDS + 1):
            with self.assertRaises(HTTPException) as exc:
                verify_family_token(short)
        self.assertEqual(exc.exception.status_code, 401)

    def test_acl_revocation_and_role_downgrade_take_effect_immediately(self):
        token, _ = self.login()
        env = json.loads(os.environ["WEIGUO_FAMILY_ACL_JSON"])
        env[self.SUB_A]["role"] = "viewer"
        os.environ["WEIGUO_FAMILY_ACL_JSON"] = json.dumps(env)
        self.assertEqual(verify_family_token(token).role, "viewer")
        del env[self.SUB_A]
        os.environ["WEIGUO_FAMILY_ACL_JSON"] = json.dumps(env)
        with self.assertRaises(HTTPException) as exc:
            verify_family_token(token)
        self.assertEqual(exc.exception.status_code, 403)

    def test_missing_or_shared_session_secret_fails_closed(self):
        for secret in ("short", os.environ["WEIGUO_ADMIN_TOKEN"]):
            with self.subTest(secret=secret[:5]), patch.dict(os.environ, {"WEIGUO_SESSION_SECRET": secret}):
                with self.assertRaises(HTTPException) as exc:
                    self.login()
                self.assertEqual(exc.exception.status_code, 503)

    def test_task_owner_and_rate_limit(self):
        tasks.initialize()
        item = tasks.start("https://example.org/", [{"action": "extract"}],
                           owner_sub=self.SUB_A, limit_per_minute=2)
        self.assertIsNotNone(tasks.fetch(item["id"], owner_sub=self.SUB_A))
        self.assertIsNone(tasks.fetch(item["id"], owner_sub=self.SUB_B))
        tasks.start("https://example.org/", [{"action": "extract"}],
                    owner_sub=self.SUB_A, limit_per_minute=2)
        with self.assertRaises(ValueError):
            tasks.start("https://example.org/", [{"action": "extract"}],
                        owner_sub=self.SUB_A, limit_per_minute=2)
        # Independent family member's rate limit is unaffected.
        tasks.start("https://example.org/", [{"action": "extract"}],
                    owner_sub=self.SUB_B, limit_per_minute=2)


if __name__ == "__main__":
    unittest.main()
