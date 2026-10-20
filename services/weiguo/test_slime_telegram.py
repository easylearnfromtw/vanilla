"""Slime owner-only chat operations: no LLM needed, no network, no raw secrets in DB."""
import os
import re
import tempfile
import unittest
from unittest.mock import patch

from ceres_gateway import _allowed_chat_ids
from slime import JoinRequest, join, Heartbeat, Caps, heartbeat
from slime_telegram import handle_slime, _owner_subject

OWNER_CHAT = 123456789
OTHER_CHAT = 223456789
OWNER_SUB = "123456789012345678901"
OTHER_SUB = "223456789012345678901"


class SlimeTelegramTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        env = patch.dict(os.environ, {
            "SLIME_DB_PATH": tmp.name + "/slime.sqlite3",
            "SLIME_ENABLED": "true",
            "SLIME_PUBLIC_API_ORIGIN": "https://example-slime.test",
            "CERES_OWNER_ONLY": "true",
            "CERES_TELEGRAM_CHAT_IDS": f"{OWNER_CHAT},{OTHER_CHAT}",
            "CERES_FAMILY_LINKS_JSON": '{"123456789":"' + OWNER_SUB +
                '","223456789":"' + OTHER_SUB + '"}',
            "WEIGUO_FAMILY_ACL_JSON": '{"' + OWNER_SUB +
                '":{"role":"owner"},"' + OTHER_SUB + '":{"role":"member"}}',
        })
        env.start()
        self.addCleanup(env.stop)

    def test_only_owner_telegram_is_allowed(self):
        self.assertEqual(_allowed_chat_ids(), {OWNER_CHAT})
        self.assertTrue(_owner_subject(OWNER_CHAT, OWNER_SUB))
        self.assertFalse(_owner_subject(OTHER_CHAT, OTHER_SUB))
        self.assertIn("只有", handle_slime(OTHER_CHAT, OTHER_SUB, "目前有哪些電腦"))
        with patch.dict(os.environ, {"CERES_FAMILY_LINKS_JSON": "{}"}):
            self.assertEqual(_allowed_chat_ids(), set())
            self.assertIn("只有", handle_slime(OWNER_CHAT, OWNER_SUB, "目前有哪些電腦"))

    def test_chat_invite_node_pause_resume_revoke(self):
        message = handle_slime(OWNER_CHAT, OWNER_SUB, "建立朋友邀請碼")
        self.assertIn("10 分鐘", message)
        found = re.search(r"#slime=([A-Za-z0-9_-]+)", message)
        self.assertIsNotNone(found)
        joined = join(JoinRequest(invite=found.group(1), label="test-GPU", role="friend"))
        token, node = joined["token"], joined["node_id"]
        heartbeat(Heartbeat(capabilities=Caps(cpu=8, ram_gb=16, gpu="GPU", os="Linux")),
                  authorization="Bearer " + token)
        status = handle_slime(OWNER_CHAT, OWNER_SUB, "目前有哪些電腦")
        self.assertIn("test-GPU", status)
        self.assertNotIn(token, status)
        pause = handle_slime(OWNER_CHAT, OWNER_SUB, "停用 " + node)
        code = re.search(r"確認 ([a-f0-9]{8})", pause).group(1)
        self.assertIn("不正確", handle_slime(OWNER_CHAT, OWNER_SUB, "確認 deadbeef"))
        self.assertIn("已暫停", handle_slime(OWNER_CHAT, OWNER_SUB, "確認 " + code))
        self.assertIn("已暫停", handle_slime(OWNER_CHAT, OWNER_SUB, "目前有哪些電腦"))
        resume = handle_slime(OWNER_CHAT, OWNER_SUB, "恢復 " + node)
        code = re.search(r"確認 ([a-f0-9]{8})", resume).group(1)
        self.assertIn("已恢復", handle_slime(OWNER_CHAT, OWNER_SUB, "確認 " + code))
        revoke = handle_slime(OWNER_CHAT, OWNER_SUB, "移除 " + node)
        code = re.search(r"確認 ([a-f0-9]{8})", revoke).group(1)
        self.assertIn("已撤銷", handle_slime(OWNER_CHAT, OWNER_SUB, "確認 " + code))
        self.assertIn("沒有已配對", handle_slime(OWNER_CHAT, OWNER_SUB, "目前有哪些電腦"))

    def test_plain_conversation_not_privileged(self):
        self.assertIsNone(handle_slime(OWNER_CHAT, OWNER_SUB, "今天想聊聊醫學"))
        self.assertIn("沒有變更", handle_slime(OWNER_CHAT, OWNER_SUB, "取消"))
        self.assertIn("無法唯一識別", handle_slime(OWNER_CHAT, OWNER_SUB, "移除 不存在的節點"))
        with patch.dict(os.environ, {"SLIME_ENABLED": "false"}):
            self.assertIn("尚未啟用", handle_slime(OWNER_CHAT, OWNER_SUB, "目前有哪些電腦"))


if __name__ == "__main__":
    unittest.main()
