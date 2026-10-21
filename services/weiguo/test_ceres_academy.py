"""Regression suite for Telegram Academy (no live Telegram requests)."""
from __future__ import annotations

import asyncio
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import ceres_store_bot as bot
from ceres_academy_content import KNOWLEDGE, LEVELS, render_lesson
from ceres_academy_curriculum import CHAPTERS, LESSONS, STAGES, TOPICS


class AcademyContentTests(unittest.TestCase):
    def test_complete_curriculum_has_real_teaching_material(self):
        self.assertEqual((len(TOPICS), len(CHAPTERS), len(LESSONS), len(KNOWLEDGE)), (6, 6, 324, 36))
        self.assertEqual(len(STAGES), 9)
        for index in range(len(LESSONS)):
            text = render_lesson(index, "0")
            self.assertGreater(len(text), 500, index)
            self.assertLessEqual(len(text), 3900, index)
            for section in ("【學習任務】", "【知識重點】", "【課後動手做】",
                            "【參考解答與評量】", "【自我檢核】", "【延伸資料／來源】"):
                self.assertIn(section, text, (index, section))
            self.assertIn("https://", text, index)
            self.assertNotIn("\ufffd", text, index)
            self.assertNotIn("鍙", text, index)
            self.assertNotIn("馃", text, index)
        for row in KNOWLEDGE:
            self.assertEqual(len(row["sources"]), 2)
            self.assertGreater(len(row["practice"]), 20)
            self.assertGreater(len(row["answer"]), 20)
            self.assertEqual(len({url for _, url in row["sources"]}), 2)

    def test_skill_levels_preserve_curriculum_identity(self):
        for level in LEVELS:
            text = render_lesson(0, level)
            self.assertIn("模型推論", text)
            self.assertIn(LEVELS[level], text)
        self.assertNotEqual(render_lesson(0, "0"), render_lesson(0, "3"))
        with self.assertRaises(ValueError):
            render_lesson(-1, "0")
        with self.assertRaises(ValueError):
            render_lesson(324, "0")

    def test_chapter_specific_instruction_not_a_generic_placeholder(self):
        texts = [render_lesson(i * 9 + 4, "2") for i in range(36)]
        self.assertEqual(len(set(texts)), 36)
        self.assertIn("API Key", texts[19])
        self.assertIn("Docker", texts[31])
        self.assertIn("JSON", texts[3])


class AcademyBotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"CERES_DB_PATH": self.tmp.name + "/academy.sqlite3"})
        self.env.start()
        self.sent = []

        async def fake_send(chat_id, text, keyboard=None):
            self.sent.append((chat_id, text, keyboard))
        self.sender_patch = patch.object(bot, "_send", fake_send)
        self.sender_patch.start()

    def tearDown(self):
        self.sender_patch.stop()
        self.env.stop()
        self.tmp.cleanup()

    def test_hub_and_academy_use_real_line_feeds_not_escaped_slashes(self):
        asyncio.run(bot._hub(101, "home"))
        self.assertIn("\n", self.sent[-1][1])
        self.assertNotIn("\\n", self.sent[-1][1])
        asyncio.run(bot._learn(101, "start"))
        self.assertIn("\n", self.sent[-1][1])
        self.assertNotIn("\\n", self.sent[-1][1])
        self.assertEqual(self.sent[-1][2]["inline_keyboard"][0][0]["callback_data"], "learn:level:0")

    def test_level_switch_keeps_mastered_and_does_not_jump_topic(self):
        asyncio.run(bot._learn(202, "level:3"))
        self.assertIn("模型推論", self.sent[-1][1])
        self.assertIn("進階", self.sent[-1][1])
        asyncio.run(bot._learn(202, "master"))
        self.assertIn("Token 與上下文", self.sent[-1][1])
        asyncio.run(bot._learn(202, "level:0"))
        self.assertIn("Token 與上下文", self.sent[-1][1])
        db, row = bot._learning_state(202)
        try:
            self.assertEqual(json.loads(row[2]), [0])
            self.assertEqual(row[0], "0")
        finally:
            db.close()

    def test_bad_progress_state_recovers(self):
        db, _ = bot._learning_state(303)
        try:
            db.execute("UPDATE store_learning SET lesson=?, mastered=? WHERE chat_id=?", (9999, "not-json", 303))
            db.commit()
        finally:
            db.close()
        asyncio.run(bot._learn(303, "recommend"))
        self.assertLessEqual(len(self.sent[-1][1]), 4096)

    def test_messages_with_telegram_length_limit(self):
        async def fake_tg(method, data):
            self.sent.append((method, data))
        with patch.object(bot, "_tg", fake_tg):
            with self.assertRaises(ValueError):
                asyncio.run(bot._send(1, "a" * 4097))
            asyncio.run(bot._send(1, "正常中文\n第二段"))
            self.assertEqual(self.sent[-1][1]["text"], "正常中文\n第二段")

    def test_callback_verified_private_chat_only(self):
        class FakeRequest:
            headers = {"content-type": "application/json"}
            def __init__(self, payload):
                self.payload = payload
            async def body(self):
                return json.dumps(self.payload).encode("utf-8")
        sent_methods = []

        async def fake_tg(method, data):
            sent_methods.append(method)
        with patch.object(bot, "_config", return_value=("token", "secret", "https://example.org")):
            with patch.object(bot, "_tg", fake_tg):
                event = {"update_id": 123456, "callback_query": {
                    "id": "abc", "from": {"id": 404, "is_bot": False},
                    "message": {"chat": {"id": 404, "type": "private"}},
                    "data": "learn:level:0"}}
                result = asyncio.run(bot.store_webhook(FakeRequest(event), "secret"))
                self.assertTrue(result["ok"])
                self.assertIn("answerCallbackQuery", sent_methods)
                self.assertIn("模型推論", self.sent[-1][1])
                event["update_id"] = 123457
                event["callback_query"]["from"]["id"] = 999  # different user
                result = asyncio.run(bot.store_webhook(FakeRequest(event), "secret"))
                self.assertTrue(result["ok"])
                self.assertEqual(len(self.sent), 1)


if __name__ == "__main__":
    unittest.main()
