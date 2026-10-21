"""Regression tests for the Telegram-native Academy's 324 learning activities."""
from __future__ import annotations

import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from ceres_academy_curriculum import LESSONS, TOPICS, CHAPTERS
from ceres_academy_enriched import DETAILS, SOURCES, lesson_text, quiz_text
import ceres_store_bot as bot


class AcademyContentTests(unittest.TestCase):
    def test_324_lessons_are_substantive_and_sourced(self):
        self.assertEqual(len(LESSONS), 324)
        self.assertEqual(len(TOPICS), 6)
        self.assertEqual(len(DETAILS), len(SOURCES))
        self.assertEqual(len(DETAILS), 36)
        self.assertEqual(sum(map(len, CHAPTERS)), 36)
        for number in range(len(LESSONS)):
            lesson = lesson_text(number, "2")
            self.assertGreater(len(lesson), 370, number)
            self.assertLessEqual(len(lesson), 3800)
            self.assertIn("https://", lesson)
            self.assertIn("▍核心知識", lesson)
            self.assertIn("▍案例解析", lesson)
            self.assertIn("▍動手練習", lesson)
            self.assertIn("▍閱讀來源", lesson)
            self.assertNotIn(r"\n", lesson)
            self.assertNotIn("sk-proj-", lesson)
        self.assertGreaterEqual(len(set(url for _, url in SOURCES)), 24)

    def test_difficulty_changes_depth_without_changing_curriculum(self):
        self.assertIn("零基礎", lesson_text(0, "0"))
        self.assertIn("進階", lesson_text(0, "3"))
        self.assertIn(DETAILS[0][0], lesson_text(0, "0"))
        self.assertIn(DETAILS[0][0], lesson_text(0, "3"))
        self.assertIn("參考解答", quiz_text(0, reveal=True))
        self.assertNotIn("參考解答", quiz_text(0, reveal=False))
        self.assertNotIn(r"\n", quiz_text(0, reveal=True))

    def test_splitting_respects_telegram_limit_and_preserves_lines(self):
        content = "第一段\n" + ("x" * 4300) + "\n第三段"
        chunks = bot._message_chunks(content)
        self.assertTrue(all(0 < len(x) <= 3600 for x in chunks))
        self.assertEqual("".join(chunks).replace("\n", ""), content.replace("\n", ""))
        with self.assertRaises(ValueError):
            bot._message_chunks(" ")


class AcademyInteractionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"CERES_DB_PATH": str(Path(self.tmp.name) / "test.sqlite3")})
        self.env.start()
        self.send = AsyncMock()
        self.send_patcher = patch.object(bot, "_send", self.send)
        self.send_patcher.start()
        self.chat_id = 12001122

    def tearDown(self):
        self.send_patcher.stop()
        self.env.stop()
        self.tmp.cleanup()

    def state(self):
        db, row = bot._learning_state(self.chat_id)
        db.close()
        return row[0], row[1], json.loads(row[2])

    def learn(self, action):
        asyncio.run(bot._learn(self.chat_id, action))

    def test_buttons_and_persistent_progress(self):
        self.learn("level:0")
        self.assertEqual(self.state(), ("0", 0, []))
        self.learn("master")
        self.assertEqual(self.state(), ("0", 1, [0]))
        self.learn("level:3")
        level, step, mastered = self.state()
        self.assertEqual(level, "3")
        self.assertEqual(step, 1)
        self.assertEqual(mastered, [0])
        self.assertIn("進階", self.send.call_args.args[1])
        self.learn("prev")
        self.assertEqual(self.state()[1], 0)
        self.learn("next")
        self.assertEqual(self.state()[1], 1)
        self.learn("chapter:7")
        self.assertEqual(self.state()[1], 63)
        self.learn("catalog")
        self.assertEqual(self.state()[1], 63)
        self.learn("topic:1")
        self.assertEqual(self.state()[1], 63)
        self.learn("quiz")
        self.assertIn("先自行作答", self.send.call_args.args[1])
        self.learn("answer")
        self.assertIn("參考解答", self.send.call_args.args[1])
        self.assertEqual(self.state()[1], 63)

    def test_hub_displays_real_linebreaks(self):
        asyncio.run(bot._hub(self.chat_id, "home"))
        message = self.send.call_args.args[1]
        self.assertIn("\n", message)
        self.assertNotIn(r"\n", message)

    def test_corrupted_progress_does_not_crash(self):
        self.assertEqual(bot._safe_mastered("[1, 2, true, 1000, -1]"), {1, 2})
        self.assertEqual(bot._safe_mastered("{"), set())


if __name__ == "__main__":
    unittest.main()
