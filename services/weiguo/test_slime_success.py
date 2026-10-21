"""Slime success-page regression tests: no false success and no credential leaks."""
from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import slime_desktop
import slime_success


class SlimeSuccessPageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.profile = {
            "role": "friend",
            "label": "Friends <Desk> & laptop",
            "node_id": "c"*24,
            "server": "https://private.example.invalid",
            "token": "NOT_A_PUBLIC_TOKEN_"+"S"*50,
        }

    def test_page_displays_pairing_receipt_not_approval_or_live_heartbeat(self):
        rendered = slime_success.render_success(self.profile, "2026-10-21 17:02")
        self.assertIn("節點配對成功！", rendered)
        self.assertIn("Friends &lt;Desk&gt; &amp; laptop", rendered)
        self.assertNotIn("Friends <Desk>", rendered)
        self.assertIn("c"*24, rendered)
        self.assertIn("2026-10-21 17:02", rendered)
        self.assertIn("模型推論需要裝置持有人同意及管理員另外核准",rendered)
        self.assertIn("並非即時線上狀態",rendered)
        self.assertNotIn(self.profile["token"], rendered)
        self.assertNotIn("private.example.invalid",rendered)
        self.assertNotIn("download",rendered.lower())

    def test_invalid_node_data_cannot_create_success_receipt(self):
        for bad in ("../../foo", "<script>x</script>", "a"*23, "F"*24):
            with self.assertRaises(ValueError):
                slime_success.render_success({**self.profile, "node_id": bad})
        with self.assertRaises(ValueError):
            slime_success.render_success({**self.profile, "role":"root"})

    def test_browser_receipt_is_local_and_never_puts_token_in_url(self):
        with patch.object(slime_success.Path,"home",return_value=Path(self.tmp.name)),\
             patch.object(slime_success.webbrowser,"open_new_tab",return_value=True) as launch:
            self.assertTrue(slime_success.open_success(self.profile))
        page = Path(self.tmp.name)/".vanilla"/"slime"/"success-friend.html"
        self.assertTrue(page.is_file())
        text = page.read_text("utf8")
        self.assertNotIn(self.profile["token"], text)
        self.assertNotIn("private.example.invalid", text)
        self.assertTrue(launch.call_args.args[0].startswith("file:"))
        self.assertNotIn("token",launch.call_args.args[0].lower())
        if os.name != "nt":
            self.assertEqual(page.stat().st_mode & 0o777,0o600)

    def test_only_first_successful_setup_triggers_browser_page(self):
        with patch.object(slime_desktop,"_load",return_value=None),\
             patch.object(slime_desktop,"setup",return_value=self.profile),\
             patch.object(slime_success,"open_success",return_value=True) as open_page,\
             patch.object(slime_desktop,"open_reward_claim",return_value=True),\
             patch.object(slime_desktop,"run_model") as runner,\
             patch.object(slime_desktop.sys,"argv",["Slime-Friend.exe"]):
            self.assertEqual(slime_desktop.main(),0)
        open_page.assert_called_once_with(self.profile)
        runner.assert_called_once()
        with patch.object(slime_desktop,"_load",return_value=self.profile),\
             patch.object(slime_desktop,"setup") as setup,\
             patch.object(slime_success,"open_success") as open_page,\
             patch.object(slime_desktop,"run_model"),\
             patch.object(slime_desktop.sys,"argv",["Slime-Friend.exe"]):
            self.assertEqual(slime_desktop.main(),0)
        setup.assert_not_called()
        open_page.assert_not_called()

    def test_browser_failure_does_not_undo_registered_device(self):
        with patch.object(slime_desktop,"_load",return_value=None),\
             patch.object(slime_desktop,"setup",return_value=self.profile),\
             patch.object(slime_success,"open_success",side_effect=OSError("no browser")),\
             patch.object(slime_desktop,"open_reward_claim",return_value=True),\
             patch.object(slime_desktop,"run_model") as runner,\
             patch.object(slime_desktop.sys,"argv",["Slime-Friend.exe"]):
            self.assertEqual(slime_desktop.main(),0)
        runner.assert_called_once()


if __name__=="__main__":
    unittest.main()
