"""Offline tests for guarded WordCraft adapter, no actual Rust binary required."""
from __future__ import annotations

import asyncio
import os
import pathlib
import unittest
from unittest.mock import patch

import wordcraft_engine as wc


class WordCraftAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_by_default(self):
        with patch.dict(os.environ, {"WEIGUO_WORDCRAFT_ENABLED": "false"}):
            self.assertFalse(wc.available())
            with self.assertRaises(wc.WordCraftUnavailable):
                await wc.convert_markdown("標題", "內容", "docx")

    async def test_reject_invalid_format_or_content(self):
        for title, body, fmt in (("T", "hello", "exe"), ("", "hello", "pdf"),
                                  ("T", "", "pdf"), ("T", "x"*50001, "pdf"),
                                  ("T\x00", "hello", "docx")):
            with self.subTest(fmt=fmt,title=title):
                with self.assertRaises(ValueError):
                    await wc.convert_markdown(title, body, fmt)

    async def test_fixed_arguments_scrub_secrets_cleanup_after_success(self):
        calls = []
        class FakeProcess:
            async def wait(self): return 0
        async def fake_spawn(*args,**kwargs):
            calls.append((args,kwargs))
            pathlib.Path(args[3]).write_bytes(b"%PDF-1.7\nTest")
            return FakeProcess()
        with patch.dict(os.environ, {
            "WEIGUO_WORDCRAFT_ENABLED":"true",
            "WEIGUO_WORDCRAFT_EGRESS_ISOLATED":"true",
            "WEIGUO_WORDCRAFT_CLI":"/opt/bin/wordcraft-cli",
            "WEIGUO_ADMIN_TOKEN":"secret-admin", "WEIGUO_SESSION_SECRET":"secret-session"
        }), patch.object(wc,"available",return_value=True), patch(
            "wordcraft_engine.asyncio.create_subprocess_exec",side_effect=fake_spawn
        ):
            result=await wc.convert_markdown("Report","## Text","pdf")
        self.assertTrue(result.startswith(b"%PDF-"))
        self.assertEqual(len(calls),1)
        args,kwargs=calls[0]
        self.assertEqual(args[:2],("/opt/bin/wordcraft-cli","convert"))
        self.assertNotIn("WEIGUO_ADMIN_TOKEN",kwargs["env"])
        self.assertNotIn("WEIGUO_SESSION_SECRET",kwargs["env"])
        self.assertEqual(kwargs["stdin"],asyncio.subprocess.DEVNULL)
        self.assertFalse(pathlib.Path(args[2]).exists())

    async def test_bad_pdf_signature_fails_closed(self):
        class FakeProcess:
            async def wait(self):return 0
        async def fake_spawn(*args,**kwargs):
            pathlib.Path(args[3]).write_bytes(b"NOT_A_PDF")
            return FakeProcess()
        with patch.object(wc,"available",return_value=True), patch(
            "wordcraft_engine.asyncio.create_subprocess_exec",side_effect=fake_spawn
        ):
            with self.assertRaises(wc.WordCraftFailed):
                await wc.convert_markdown("Title","Body","pdf")


if __name__=="__main__":
    unittest.main()
