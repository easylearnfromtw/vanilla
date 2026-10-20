"""No-network tests for Telegram -> persistent-model -> Telegram Ceres."""
import asyncio
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from app import app
from auth import FamilyIdentity, family_reader
from ceres_gateway import _session
from ceres_server_agent import process_one, ready, verified_subject
from ceres_server_model import ModelSettings, model_settings, generate_reply, ModelUnavailable
from ceres_server_tools import calculate, choose_tool, ToolDenied

SUB = "123456789012345678901"
CHAT = 123456789
SECRET = "S" * 48
MODEL = ModelSettings("openai", "https://example-provider.com/v1", "a-model", "k" * 36)


class TestCeresServerAgent(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        env = patch.dict(os.environ, {
            "CERES_DB_PATH": temp.name + "/messages.db",
            "CERES_ENABLED": "true",
            "CERES_OUTBOUND_ENABLED": "true",
            "CERES_LOCAL_BRIDGE_ENABLED": "true",
            "CERES_SERVER_AGENT_ENABLED": "true",
            "CERES_TELEGRAM_WEBHOOK_SECRET": SECRET,
            "CERES_TELEGRAM_CHAT_IDS": str(CHAT),
            "CERES_TELEGRAM_BOT_TOKEN": "12345678:" + "b"*40,
            "CERES_FAMILY_LINKS_JSON": '{"'+str(CHAT)+'":"'+SUB+'"}',
            "WEIGUO_FAMILY_ACL_JSON": '{"'+SUB+'":{"member":"test","role":"owner"}}',
        })
        env.start()
        self.addCleanup(env.stop)
        app.dependency_overrides[family_reader] = lambda: FamilyIdentity(
            SUB, "test", "owner", "user@example.com")
        self.addCleanup(app.dependency_overrides.pop, family_reader, None)

    def call(self, method, path, **kwargs):
        async def request():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                         base_url="https://test.example") as client:
                return await client.request(method, path, **kwargs)
        return asyncio.run(request())

    def webhook(self, update, content="你好"):
        return self.call("POST", "/v1/ceres/telegram/webhook",
                         headers={"X-Telegram-Bot-Api-Secret-Token": SECRET},
                         json={"update_id": update, "message": {
                             "chat": {"type": "private", "id": CHAT},
                             "from": {"id": CHAT, "is_bot": False},
                             "text": content}})

    def test_config_fail_closed(self):
        self.assertFalse(ready())
        with patch.dict(os.environ, {
            "CERES_SERVER_MODEL_PROVIDER": "openai",
            "CERES_SERVER_MODEL_BASE_URL": "https://api.provider.example/v1",
            "CERES_SERVER_MODEL_NAME": "example-model",
            "CERES_SERVER_MODEL_API_KEY": "x"*36
        }):
            self.assertTrue(ready())
            self.assertIsNotNone(model_settings())
            with patch.dict(os.environ, {"CERES_SERVER_MODEL_BASE_URL": "http://127.0.0.1:11434"}):
                self.assertIsNone(model_settings())
            with patch.dict(os.environ, {"CERES_SERVER_MODEL_BASE_URL": "https://localhost/v1"}):
                self.assertIsNone(model_settings())
            with patch.dict(os.environ, {"CERES_SERVER_MODEL_API_KEY": ""}):
                self.assertIsNone(model_settings())

    def test_queue_worker_generation_and_context(self):
        self.assertTrue(self.webhook(100).json()["accepted"])
        self.assertEqual(verified_subject(CHAT), SUB)
        with patch("ceres_server_agent.model_settings", return_value=MODEL),              patch("ceres_server_agent.generate_reply", new_callable=AsyncMock,
                   side_effect=["你好，我是 Ceres。", "記得，你剛才向我問好。"]) as generator,              patch("ceres_server_agent.deliver", new_callable=AsyncMock,
                   return_value=True) as send:
            self.assertEqual(self.call("POST","/v1/family/ceres/bridge/claim").status_code,503)
            self.assertTrue(asyncio.run(process_one()))
            self.assertFalse(asyncio.run(process_one()))
            self.assertEqual(send.await_count,1)
            status=self.call("GET","/v1/family/ceres/agent/status")
            self.assertEqual(status.status_code,200)
            self.assertTrue(status.json()["serverReady"])
            self.assertEqual(status.json()["latestState"],"completed")
            self.assertTrue(self.webhook(101,"剛剛我說什麼？").json()["accepted"])
            self.assertTrue(asyncio.run(process_one()))
            self.assertEqual(send.await_count,2)
            self.assertEqual(generator.await_count,2)
            second=generator.await_args_list[1]
            self.assertEqual(second.args[2][-1][1],"你好，我是 Ceres。")
            with _session() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM ceres_outbox").fetchone()[0],2)

    def test_model_unavailable_never_auto_resends(self):
        self.assertTrue(self.webhook(102).json()["accepted"])
        with patch("ceres_server_agent.model_settings",return_value=MODEL),              patch("ceres_server_agent.generate_reply",new_callable=AsyncMock,
                   side_effect=ModelUnavailable("provider-status")) as gen,              patch("ceres_server_agent.deliver",new_callable=AsyncMock) as sent:
            self.assertTrue(asyncio.run(process_one()))
            self.assertFalse(asyncio.run(process_one()))
            gen.assert_awaited_once()
            sent.assert_not_awaited()
            self.assertEqual(self.call("GET","/v1/family/ceres/agent/status").json()["latestState"],
                             "model_unavailable")

    def test_unverified_delivery_no_repeat(self):
        self.assertTrue(self.webhook(103).json()["accepted"])
        with patch("ceres_server_agent.model_settings",return_value=MODEL),              patch("ceres_server_agent.generate_reply",new_callable=AsyncMock,
                   return_value="回答"),              patch("ceres_server_agent.deliver",new_callable=AsyncMock,
                   return_value=False) as sent:
            self.assertTrue(asyncio.run(process_one()))
            self.assertFalse(asyncio.run(process_one()))
            sent.assert_awaited_once()
            self.assertEqual(self.call("GET","/v1/family/ceres/agent/status").json()["latestState"],
                             "delivery_unknown")

    def test_revocation_checks_before_model(self):
        self.assertTrue(self.webhook(104).json()["accepted"])
        with patch.dict(os.environ, {"WEIGUO_FAMILY_ACL_JSON": "{}"}),              patch("ceres_server_agent.model_settings",return_value=MODEL),              patch("ceres_server_agent.generate_reply",new_callable=AsyncMock) as gen:
            self.assertTrue(asyncio.run(process_one()))
            gen.assert_not_awaited()

    def test_diana_cream_are_real_and_safe(self):
        self.assertEqual(calculate("(2+3)*4"),20)
        with self.assertRaises(ToolDenied):calculate("__import__('os').system('pwd')")
        with self.assertRaises(ToolDenied):calculate("2 ** 200")
        answer=asyncio.run(choose_tool("/calc 2*(3+4)"))
        self.assertIn("14",answer[0])
        self.assertEqual(answer[1],"cream")
        answer=asyncio.run(choose_tool("/cream 2,4,6"))
        self.assertIn("平均 4",answer[0])
        denied=asyncio.run(choose_tool("幫我直接部署 GitHub 程式"))
        self.assertIn("授權",denied[0])
        self.assertEqual(denied[1],"diana")

    def test_session_rejected_without_link(self):
        app.dependency_overrides[family_reader] = lambda: FamilyIdentity(
            "999999999999999999999", "other", "owner","other@example.com")
        self.assertEqual(self.call("GET","/v1/family/ceres/agent/status").status_code,403)


if __name__ == "__main__":
    unittest.main()
