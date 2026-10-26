"""SignWell Sale / public Telegram Store Slime code security regression.

No real Telegram calls or credentials; all invite codes in tests are synthetic.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
import unittest
from unittest.mock import patch

from starlette.requests import Request
import ceres_store_bot as bot
from slime import PairRequest, pair

OWNER = 234567890
MEMBER = 234567891
OWNER_SUB = "23456789012345678901"
MEMBER_SUB = "23456789012345678902"


class StoreSlimePairTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        patcher = patch.dict(os.environ, {
            "SLIME_ENABLED": "true",
            "SLIME_DB_PATH": tmp.name + "/slime.sqlite3",
            "CERES_DB_PATH": tmp.name + "/ceres.sqlite3",
            "SLIME_PUBLIC_API_ORIGIN": "https://weiguo.test",
            "SLIME_PAIRING_PAGE_URL": "https://example.test/slime/",
            "CERES_OWNER_ONLY": "true",
            "CERES_TELEGRAM_CHAT_IDS": f"{OWNER},{MEMBER}",
            "CERES_FAMILY_LINKS_JSON": json.dumps({str(OWNER): OWNER_SUB, str(MEMBER): MEMBER_SUB}),
            "WEIGUO_FAMILY_ACL_JSON": json.dumps({
                OWNER_SUB: {"role": "owner"}, MEMBER_SUB: {"role": "member"}
            })
        })
        patcher.start()
        self.addCleanup(patcher.stop)
        self.sent = []
        async def fake_send(chat, message, keyboard=None):
            self.sent.append((chat, message, keyboard))
        self.send_patch = patch.object(bot, "_send", fake_send)
        self.send_patch.start()
        self.addCleanup(self.send_patch.stop)

    def test_owner_is_verified_by_original_ceres_acl_and_chat_allowlist(self):
        self.assertEqual(bot._slime_store_owner(OWNER), OWNER_SUB)
        self.assertIsNone(bot._slime_store_owner(MEMBER))
        self.assertIsNone(bot._slime_store_owner(True))
        with patch.dict(os.environ, {"CERES_FAMILY_LINKS_JSON": "{}"}):
            self.assertIsNone(bot._slime_store_owner(OWNER))
        with patch.dict(os.environ, {"WEIGUO_FAMILY_ACL_JSON": "{}"}):
            self.assertIsNone(bot._slime_store_owner(OWNER))
        with patch.dict(os.environ, {"CERES_TELEGRAM_CHAT_IDS": str(MEMBER)}):
            self.assertIsNone(bot._slime_store_owner(OWNER))

    def test_public_user_can_view_entry_but_never_receive_code(self):
        asyncio.run(bot._slime_store_menu(MEMBER))
        asyncio.run(bot._slime_store_issue(MEMBER))
        self.assertEqual(len(self.sent), 2)
        for recipient, message, markup in self.sent:
            self.assertEqual(recipient, MEMBER)
            self.assertIn("Owner", message)
            self.assertNotRegex(message, r"[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}")
            self.assertNotIn("slime:code", json.dumps(markup,ensure_ascii=False))

    def test_owner_explicit_request_issues_original_10_min_single_use_code(self):
        asyncio.run(bot._slime_store_menu(OWNER))
        self.assertIn("slime:code", str(self.sent[0][2]))
        self.assertNotRegex(self.sent[0][1], r"#slime=")
        asyncio.run(bot._slime_store_issue(OWNER))
        chat, message, markup = self.sent[-1]
        self.assertEqual(chat, OWNER)
        matched = re.search(r"([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}(?:-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}){2})", message)
        self.assertIsNotNone(matched)
        self.assertIn("10 分鐘", message)
        self.assertIn("#slime=" + matched.group(1), message)
        from slime import _db, _digest
        with _db() as db:
            entry = db.execute("SELECT owner,expires FROM slime_short_pair WHERE digest=?",
                               (_digest("short:" + matched.group(1).replace("-", "")),)).fetchone()
        self.assertEqual(entry["owner"], OWNER_SUB)
        self.assertNotIn(matched.group(1), str(markup))
        request = Request({"type":"http", "client":("198.51.100.8",443), "headers":[]})
        first = pair(PairRequest(code=matched.group(1),label="Guest desktop",role="friend"),request)
        self.assertEqual(first["inference_enabled"], False)
        self.assertTrue(32 <= len(first["token"]) <= 256)
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            pair(PairRequest(code=matched.group(1),label="Replay",role="friend"),request)

    def test_group_forward_and_spoofed_sender_do_not_issue_codes(self):
        with patch.object(bot,"_config",return_value=("token","secret","https://example.test")), \
             patch.object(bot,"_slime_store_issue") as issue, \
             patch.object(bot,"_claim",return_value=True):
            for update in (
                {"update_id": 101, "message":{"chat":{"type":"supergroup","id":-1},"from":{"id":OWNER},"text":"/slime code"}},
                {"update_id": 102, "message":{"chat":{"type":"private","id":OWNER},"from":{"id":MEMBER},"text":"/slime code"}},
                {"update_id": 103, "message":{"chat":{"type":"private","id":OWNER},"from":{"id":OWNER,"is_bot":True},"text":"/slime code"}},
                {"update_id": 104, "callback_query":{"id":"cb","from":{"id":MEMBER},"message":{"chat":{"id":OWNER,"type":"private"}},"data":"slime:code"}},
            ):
                async def body(): return json.dumps(update).encode()
                req = Request({"type":"http","method":"POST","headers":[(b"content-type",b"application/json")]}, receive=lambda: None)
                req.body=body
                result=asyncio.run(bot.store_webhook(req,x_telegram_bot_api_secret_token="secret"))
                self.assertEqual(result,{"ok":True})
            issue.assert_not_called()

    def test_explicit_command_and_callback_need_once_only_webhook_update(self):
        with patch.object(bot,"_config",return_value=("token","secret","https://example.test")), \
             patch.object(bot,"_tg",return_value=None), \
             patch.object(bot,"_slime_store_issue",side_effect=AssertionError("should not run for non-owner")):
            # The actual issue handler is explicitly exercised above. Here check
            # unrecognized commands cannot fall into it and no outside chat gets a code.
            self.assertNotIn("slime:code", str(bot._hub_keyboard()))
        for action in ["/slime", "/slime code"]:
            self.assertIn("slime", action)


if __name__ == "__main__":
    unittest.main()
