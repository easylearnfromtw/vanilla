"""Regression tests for the opt-in Moli/Chromium hybrid router.

No network, Moli binary, Google credentials or running browser is needed.
"""
from __future__ import annotations

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch

import moli_engine


CONFIG = {
    "WEIGUO_BROWSER_ENGINE": "auto",
    "WEIGUO_MOLI_EGRESS_ISOLATED": "true",
    "WEIGUO_ALLOW_JAVASCRIPT": "true",
}


class MoliEligibilityTests(unittest.TestCase):
    def test_chromium_default_remains_unmodified(self):
        with patch.dict(os.environ, {
            "WEIGUO_BROWSER_ENGINE": "chromium",
            "WEIGUO_MOLI_EGRESS_ISOLATED": "true",
            "WEIGUO_ALLOW_JAVASCRIPT": "true",
        }):
            self.assertFalse(moli_engine.moli_eligible([{"action": "extract"}]))

    def test_egress_and_js_must_be_explicit_opt_ins(self):
        for changes in (
            {"WEIGUO_MOLI_EGRESS_ISOLATED": "false"},
            {"WEIGUO_ALLOW_JAVASCRIPT": "false"},
            {"WEIGUO_BROWSER_ENGINE": "untrusted"},
        ):
            with self.subTest(changes=changes), patch.dict(os.environ, {**CONFIG, **changes}):
                self.assertFalse(moli_engine.moli_eligible([{"action": "extract"}]))

    def test_only_one_read_only_extract_is_routed(self):
        with patch.dict(os.environ, CONFIG):
            self.assertTrue(moli_engine.moli_eligible([{"action": "extract"}]))
            for steps in (
                [{"action": "navigate", "url": "https://example.org"}, {"action": "extract"}],
                [{"action": "scroll", "pixels": 500}, {"action": "extract"}],
                [{"action": "click", "selector": "button"}],
                [{"action": "fill", "selector": "#email", "text": "private"}],
                [{"action": "extract"}, {"action": "extract"}],
            ):
                with self.subTest(steps=steps):
                    self.assertFalse(moli_engine.moli_eligible(steps))
            self.assertFalse(moli_engine.moli_eligible(
                [{"action": "extract"}], approved_interactions=True
            ))


class MoliExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_preserves_existing_event_contract(self):
        with patch.dict(os.environ, CONFIG), \
             patch("moli_engine.shutil.which", return_value="/usr/local/bin/moli"), \
             patch("moli_engine._read_moli", new_callable=AsyncMock, return_value="# Test\nContent") as run:
            result = await moli_engine.maybe_moli_extract(
                "https://example.org/info", [{"action": "extract"}]
            )
        self.assertEqual(result["engine"], "moli")
        self.assertEqual(result["events"][0]["text"], "# Test\nContent")
        self.assertEqual(result["events"][0]["source"], "https://example.org/info")
        run.assert_awaited_once_with("/usr/local/bin/moli", "https://example.org/info")

    async def test_missing_binary_and_runtime_errors_fall_back(self):
        with patch.dict(os.environ, CONFIG), patch("moli_engine.shutil.which", return_value=None):
            self.assertIsNone(await moli_engine.maybe_moli_extract(
                "https://example.org", [{"action": "extract"}]
            ))
        with patch.dict(os.environ, CONFIG), \
             patch("moli_engine.shutil.which", return_value="/usr/bin/moli"), \
             patch("moli_engine._read_moli", new_callable=AsyncMock, side_effect=RuntimeError("browser failed")):
            self.assertIsNone(await moli_engine.maybe_moli_extract(
                "https://example.org", [{"action": "extract"}]
            ))

    async def test_never_spawns_for_ineligible_requests(self):
        with patch.dict(os.environ, {**CONFIG, "WEIGUO_MOLI_EGRESS_ISOLATED": "false"}), \
             patch("moli_engine.shutil.which") as lookup:
            self.assertIsNone(await moli_engine.maybe_moli_extract(
                "https://example.org", [{"action": "extract"}]
            ))
            lookup.assert_not_called()

    async def test_fixed_cli_arguments_and_secret_free_environment(self):
        class Stdout:
            def __init__(self):
                self.items = [b"# harmless\n", b""]

            async def read(self, _size):
                return self.items.pop(0)

        class Process:
            def __init__(self):
                self.stdout = Stdout()
                self.returncode = None

            async def wait(self):
                self.returncode = 0
                return 0

            def kill(self):
                self.returncode = -9

        fake = Process()
        with patch.dict(os.environ, {"WEIGUO_ADMIN_TOKEN": "do-not-leak", "WEIGUO_SESSION_SECRET": "also-private"}), \
             patch("moli_engine.asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=fake) as spawn:
            result = await moli_engine._read_moli("/usr/bin/moli", "https://example.org/")
        self.assertEqual(result, "# harmless")
        args = spawn.await_args.args
        self.assertEqual(args, ("/usr/bin/moli", "fetch", "--dump", "markdown",
                                "--wait-until", "done", "https://example.org/"))
        env = spawn.await_args.kwargs["env"]
        self.assertNotIn("WEIGUO_ADMIN_TOKEN", env)
        self.assertNotIn("WEIGUO_SESSION_SECRET", env)
        self.assertEqual(spawn.await_args.kwargs["cwd"], "/tmp")

    async def test_oversized_output_terminates_process(self):
        class TooMuch:
            def __init__(self):
                self.stdout = self
                self.returncode = None
                self.killed = False
            async def read(self, _size):
                return b"x" * (moli_engine.OUTPUT_LIMIT + 1)
            async def wait(self):
                self.returncode = -9
                return -9
            def kill(self):
                self.killed = True

        fake = TooMuch()
        with patch("moli_engine.asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=fake):
            with self.assertRaises(RuntimeError):
                await moli_engine._read_moli("/usr/bin/moli", "https://example.org/")
        self.assertTrue(fake.killed)


if __name__ == "__main__":
    unittest.main()
