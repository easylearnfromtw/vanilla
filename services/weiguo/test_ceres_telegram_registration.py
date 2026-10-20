"""No-network unit tests for startup-only Telegram webhook registration."""
import asyncio
import os
import unittest
from unittest.mock import patch

import ceres_telegram_registration as registration

CHAT = "123456789"
SUB = "123456789012345678901"
TOKEN = "12345678:" + "a" * 36
URL = "https://weiguo-browser-production.up.railway.app/v1/ceres/telegram/webhook"
SECRET = "s" * 40


class Response:
    status_code = 200
    def __init__(self, result):
        self.result = result
    def json(self):
        return {"ok": True, "result": self.result}


class Client:
    calls = []
    foreign_url = ""
    bot_name = "SignWell_bot"
    current_url = ""
    def __init__(self, **kwargs):
        assert kwargs["follow_redirects"] is False and kwargs["trust_env"] is False
    async def __aenter__(self):
        return self
    async def __aexit__(self, *_):
        return None
    async def get(self, url):
        self.calls.append(("GET", url))
        if url.endswith("getMe"):
            return Response({"username": self.bot_name})
        if url.endswith("getWebhookInfo"):
            return Response({"url": self.foreign_url or self.current_url})
        raise AssertionError("Unexpected Telegram method")
    async def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        assert url.endswith("/setWebhook")
        assert kwargs["json"]["secret_token"] == SECRET
        assert kwargs["json"]["drop_pending_updates"] is False
        assert kwargs["json"]["allowed_updates"] == ["message", "callback_query"]
        type(self).current_url = kwargs["json"]["url"]
        return Response(True)


class RegistrationTests(unittest.TestCase):
    def setUp(self):
        Client.calls, Client.foreign_url, Client.bot_name, Client.current_url = [], "", "SignWell_bot", ""
        env = patch.dict(os.environ, {
            "CERES_ENABLED": "true",
            "CERES_TELEGRAM_REGISTER_WEBHOOK": "true",
            "CERES_TELEGRAM_BOT_TOKEN": TOKEN,
            "CERES_TELEGRAM_EXPECTED_USERNAME": "SignWell_bot",
            "CERES_TELEGRAM_WEBHOOK_URL": URL,
            "CERES_TELEGRAM_WEBHOOK_SECRET": SECRET,
            "CERES_TELEGRAM_CHAT_IDS": CHAT,
            "CERES_FAMILY_LINKS_JSON": '{"'+CHAT+'":"'+SUB+'"}',
            "WEIGUO_FAMILY_ACL_JSON": '{"'+SUB+'":{"member":"test","role":"owner"}}',
        })
        env.start()
        self.addCleanup(env.stop)

    def run_registration(self):
        with patch.object(registration.httpx, "AsyncClient", Client):
            return asyncio.run(registration.register_telegram_webhook())

    def test_opt_in_and_disabled(self):
        with patch.dict(os.environ, {"CERES_TELEGRAM_REGISTER_WEBHOOK": "false"}):
            self.assertFalse(self.run_registration())
        with patch.dict(os.environ, {"CERES_ENABLED": "false"}):
            self.assertFalse(self.run_registration())
        self.assertFalse(Client.calls)

    def test_verified_registration_preserves_pending_updates(self):
        self.assertTrue(self.run_registration())
        self.assertEqual([x[0] for x in Client.calls], ["GET", "GET", "POST", "GET"])
        self.assertEqual(Client.current_url, URL)

    def test_foreign_webhook_never_overwritten(self):
        Client.foreign_url = "https://other.example.com/webhook"
        self.assertFalse(self.run_registration())
        self.assertEqual([x[0] for x in Client.calls], ["GET", "GET"])

    def test_wrong_bot_aborts(self):
        Client.bot_name = "not_this_bot"
        self.assertFalse(self.run_registration())
        self.assertEqual([x[0] for x in Client.calls], ["GET"])

    def test_identity_link_and_https_url_must_be_valid(self):
        for settings in [
            {"CERES_FAMILY_LINKS_JSON": '{"'+CHAT+'":"8765432101234567890"}'},
            {"CERES_FAMILY_LINKS_JSON": '{"bad":"'+SUB+'"}'},
            {"CERES_TELEGRAM_WEBHOOK_URL": "http://127.0.0.1/v1/ceres/telegram/webhook"},
            {"CERES_TELEGRAM_BOT_TOKEN": "not-a-token"},
        ]:
            with self.subTest(settings=settings), patch.dict(os.environ, settings):
                Client.calls = []
                self.assertFalse(self.run_registration())
                self.assertFalse(Client.calls)


if __name__ == "__main__":
    unittest.main()
