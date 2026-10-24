"""Public Telegram Store Bot connectivity and newline safety, no live Telegram calls."""
from __future__ import annotations

import asyncio
import json
import os
import unittest
from unittest.mock import AsyncMock, patch

import ceres_store_bot as bot

TOKEN = "123456789:" + "a" * 35
SECRET = "x" * 48
URL = "https://weiguo-browser-production.up.railway.app/v1/ceres/store/telegram/webhook"


class PublicBotPresentationTests(unittest.TestCase):
    def test_static_hub_messages_use_real_newlines_and_correct_buttons(self):
        messages = []

        async def fake_tg(method, data):
            messages.append((method, data))

        with patch.object(bot, "_tg", fake_tg):
            asyncio.run(bot._hub(111, "home"))
            asyncio.run(bot._hub(111, "models"))
        self.assertEqual([method for method, _ in messages], ["sendMessage", "sendMessage"])
        for method, payload in messages:
            self.assertEqual(payload["chat_id"], 111)
            self.assertIn("\n━━━━━━━━━━━━\n\n", payload["text"])
            self.assertNotIn(r"\n", payload["text"])
            self.assertIn("inline_keyboard", payload["reply_markup"])
            # JSON escapes line breaks for transport, but decoding must restore real LF.
            self.assertEqual(json.loads(json.dumps(payload, ensure_ascii=False)), payload)
        self.assertIn("歡迎回到 Vanilla。", messages[0][1]["text"])
        self.assertEqual(messages[0][1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"], "hub:academy")
        self.assertEqual(messages[1][1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"], "hub:home")

    def test_hub_repairs_once_and_twice_escaped_line_breaks_only(self):
        self.assertEqual(bot._hub_display(r"VANILLA\n\n歡迎"), "VANILLA\n\n歡迎")
        self.assertEqual(bot._hub_display(r"VANILLA\\n\\n歡迎"), "VANILLA\n\n歡迎")
        self.assertEqual(bot._hub_display(r"VANILLA\r\n歡迎"), "VANILLA\n歡迎")
        self.assertEqual(bot._hub_display("VANILLA\n歡迎"), "VANILLA\n歡迎")
        # The transformer is not applied to lessons that discuss escaped strings.
        lesson = r'Python: print("a\nb")'
        self.assertIn(r"\n", lesson)
        self.assertIn(r"\n", bot._message_chunks(lesson)[0])

    def test_webhook_config_requires_https_exact_endpoint_and_allowlisted_host(self):
        with patch.dict(os.environ, {
            "CERES_STORE_BOT_TOKEN": TOKEN,
            "CERES_STORE_WEBHOOK_SECRET": SECRET,
            "CERES_STORE_WEBHOOK_URL": URL,
            "CERES_STORE_ALLOWED_HOSTS": " localhost, weiguo-browser-production.up.railway.app ",
        }):
            self.assertEqual(bot._config(), (TOKEN, SECRET, URL))
            os.environ["CERES_STORE_WEBHOOK_URL"] = "https://evil.example/v1/ceres/store/telegram/webhook"
            self.assertIsNone(bot._config())
            os.environ["CERES_STORE_WEBHOOK_URL"] = URL + "?token=anything"
            self.assertIsNone(bot._config())


class PublicBotRegistrationTests(unittest.TestCase):
    def test_opt_in_registration_is_disabled_without_explicit_flag(self):
        with patch.dict(os.environ, {"CERES_STORE_REGISTER_WEBHOOK": "false"}), \
                patch.object(bot.httpx, "AsyncClient", side_effect=AssertionError("No external call allowed")):
            self.assertFalse(asyncio.run(bot.register_store_webhook()))

    def test_registration_verifies_identity_and_webhook_without_exposing_token(self):
        calls = []

        class Response:
            def __init__(self, body):
                self.body = body
            def json(self):
                return self.body

        class Client:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
            async def __aenter__(self):
                selftest.assertFalse(self.kwargs["trust_env"])
                selftest.assertFalse(self.kwargs["follow_redirects"])
                return self
            async def __aexit__(self, *args):
                return False
            async def get(self, url):
                calls.append(("GET", url.split("/")[-1]))
                if url.endswith("/getMe"):
                    return Response({"ok": True, "result": {"username": "VanillaAPIStore_bot"}})
                if url.endswith("/getWebhookInfo"):
                    checks = sum(method == "GET" and endpoint == "getWebhookInfo" for method, endpoint in calls)
                    return Response({"ok": True, "result": {"url": "" if checks == 1 else URL}})
                raise AssertionError("Unexpected Telegram get endpoint")
            async def post(self, url, json):
                calls.append(("POST", url.split("/")[-1]))
                selftest.assertEqual(json["url"], URL)
                selftest.assertEqual(json["secret_token"], SECRET)
                selftest.assertEqual(json["allowed_updates"], ["message", "callback_query"])
                selftest.assertFalse(json["drop_pending_updates"])
                return Response({"ok": True, "result": True})

        selftest = self
        with patch.dict(os.environ, {
            "CERES_STORE_REGISTER_WEBHOOK": "true",
            "CERES_STORE_BOT_TOKEN": TOKEN,
            "CERES_STORE_WEBHOOK_SECRET": SECRET,
            "CERES_STORE_WEBHOOK_URL": URL,
        }), patch.object(bot.httpx, "AsyncClient", Client):
            self.assertTrue(asyncio.run(bot.register_store_webhook()))
        self.assertEqual(calls, [
            ("GET", "getMe"),
            ("GET", "getWebhookInfo"),
            ("POST", "setWebhook"),
            ("GET", "getWebhookInfo"),
        ])

    def test_wrong_bot_identity_is_rejected_without_setting_webhook(self):
        sent = []

        class Response:
            def json(self):
                return {"ok": True, "result": {"username": "SignWell_bot"}}

        class Client:
            def __init__(self, **kwargs): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *args): return False
            async def get(self, url): return Response()
            async def post(self, url, json):
                sent.append(json)
                raise AssertionError("Wrong bot should not register a webhook")

        with patch.dict(os.environ, {
            "CERES_STORE_REGISTER_WEBHOOK": "true",
            "CERES_STORE_BOT_TOKEN": TOKEN,
            "CERES_STORE_WEBHOOK_SECRET": SECRET,
            "CERES_STORE_WEBHOOK_URL": URL,
        }), patch.object(bot.httpx, "AsyncClient", Client):
            self.assertFalse(asyncio.run(bot.register_store_webhook()))
        self.assertEqual(sent, [])


if __name__ == "__main__":
    unittest.main()
