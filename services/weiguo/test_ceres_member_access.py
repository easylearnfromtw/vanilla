"""Security regressions for public Vanilla + Gmail-gated Ceres member chats."""
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from ceres_admin_policy import grant, set_enforce, check_identity
from ceres_member_access import issue_code, redeem_code, linked_members, member_chat, reserve_member_tokens
from ceres_gateway import _allowed_chat_ids
from ceres_admin_bot import owner_subject
from ceres_server_agent import verified_subject

OWNER_CHAT = 123456789
MEMBER_CHAT = 987654321
OWNER_SUB = "123456789012345678901"
MEMBER_SUB = "987654321098765432109"


class MemberAccessTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        env = patch.dict(os.environ, {
            "CERES_DB_PATH": tmp.name + "/db.sqlite3",
            "CERES_MEMBER_CHAT_ENABLED": "true",
            "CERES_ENABLED": "true",
            "CERES_OWNER_ONLY": "true",
            "SLIME_ENABLED": "true",
            "CERES_TELEGRAM_CHAT_IDS": str(OWNER_CHAT),
            "CERES_FAMILY_LINKS_JSON": '{"' + str(OWNER_CHAT) + '":"' + OWNER_SUB + '"}',
            "WEIGUO_FAMILY_ACL_JSON": '{"' + OWNER_SUB + '":{"role":"owner"}}',
            "CERES_MEMBER_DAILY_TOKEN_LIMIT": "2000",
            "WEIGUO_GMAIL_ACL_ENFORCE": "false",
        })
        env.start()
        self.addCleanup(env.stop)
        grant("member@gmail.com", "member", ["chat","gemini"], OWNER_CHAT)
        check_identity(MEMBER_SUB, "member@gmail.com", scope="chat", bind=True) if False else None

    def _bind_google(self):
        from ceres_admin_policy import _session, _setup
        with _session() as db:
            _setup(db)
            db.execute("UPDATE ceres_admin_accounts SET google_sub=? WHERE email=?",
                       (MEMBER_SUB, "member@gmail.com"))
            db.commit()

    def test_private_chat_pairing_and_revoke(self):
        self._bind_google()
        code = issue_code(MEMBER_SUB)
        self.assertFalse(redeem_code(MEMBER_CHAT, code + "invalid"))
        self.assertTrue(redeem_code(MEMBER_CHAT, code))
        self.assertFalse(redeem_code(MEMBER_CHAT, code))
        self.assertEqual(member_chat(MEMBER_SUB), MEMBER_CHAT)
        self.assertEqual(linked_members()[MEMBER_CHAT], MEMBER_SUB)
        self.assertIn(OWNER_CHAT, _allowed_chat_ids())
        self.assertIn(MEMBER_CHAT, _allowed_chat_ids())
        self.assertEqual(verified_subject(MEMBER_CHAT), MEMBER_SUB)
        self.assertIsNone(owner_subject(MEMBER_CHAT))
        from ceres_admin_policy import revoke
        revoke("member@gmail.com", OWNER_CHAT)
        self.assertNotIn(MEMBER_CHAT, _allowed_chat_ids())
        self.assertIsNone(verified_subject(MEMBER_CHAT))

    def test_disabled_feature_has_no_member_access(self):
        self._bind_google()
        with patch.dict(os.environ, {"CERES_MEMBER_CHAT_ENABLED": "false"}):
            with self.assertRaises(HTTPException):
                issue_code(MEMBER_SUB)
            self.assertEqual(_allowed_chat_ids(), {OWNER_CHAT})

    def test_token_budget_bounds_members(self):
        self._bind_google()
        self.assertTrue(reserve_member_tokens(MEMBER_SUB, "hello", output=1000))
        self.assertFalse(reserve_member_tokens(MEMBER_SUB, "hello", output=1000))
        self.assertFalse(reserve_member_tokens(MEMBER_SUB, "x"*1601))


if __name__ == "__main__":
    unittest.main()
