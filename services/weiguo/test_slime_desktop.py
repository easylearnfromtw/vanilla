"""Offline smoke tests for Slime package onboarding and consent lifecycle."""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import slime_desktop as app


class SlimeDesktopOnboardingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home=patch.dict(os.environ,{"HOME":self.tmp.name,"SLIME_INSTALL_ROLE":"friend"})
        self.home.start();self.addCleanup(self.home.stop)
        self.assertFalse(app._settings_path().exists())

    def test_invite_parsing_does_not_use_link_host_for_backend(self):
        token="T"*43
        self.assertEqual(app._invite(token),token)
        self.assertEqual(app._invite("https://vanilla.example.net/#slime="+token),token)
        with self.assertRaises(ValueError):
            app._invite("https://vanilla.example.net/#token="+token)
        with self.assertRaises(ValueError):
            app._server("http://127.0.0.1:11434")
        with self.assertRaises(ValueError):
            app._server("https://models.example.net/a?b=c")
        self.assertEqual(app._server("https://models.example.net"),
                         "https://models.example.net")

    def test_explicit_consent_precedes_join_and_persists_only_after_valid_response(self):
        token="P"*45
        prompt=["", "友人電腦", "https://vanilla.example.net/#slime="+("x"*43), "n"]
        with patch("builtins.input",side_effect=prompt),patch.object(app,"_http") as send:
            self.assertIsNone(app.setup())
            send.assert_not_called()
        prompt=["", "友人電腦", "https://vanilla.example.net/#slime="+("x"*43), "y"]
        with patch("builtins.input",side_effect=prompt),patch.object(app,"_http",
            return_value={"token":token,"node_id":"a"*24}) as send:
            value=app.setup()
        self.assertEqual(value["role"],"friend")
        self.assertEqual(value["node_id"],"a"*24)
        self.assertEqual(value["server"],app.DEFAULT_SERVER)
        self.assertEqual(send.call_args.args[1],app.DEFAULT_SERVER+"/v1/slime/node/join")
        self.assertEqual(send.call_args.args[2]["role"],"friend")
        saved=app._load()
        self.assertEqual(saved["token"],token)
        if os.name!="nt":
            self.assertEqual(app._settings_path().stat().st_mode & 0o777,0o600)

    def test_short_code_is_primary_and_legacy_url_still_works(self):
        code="ABCD-EFGH-JKMP"
        self.assertEqual(app._invite(code.lower()),code)
        self.assertEqual(app._invite("abcd efgh jkmp"),code)
        self.assertEqual(app._invite("https://vanilla.example.net/#slime="+code),code)
        token="P"*45
        with patch("builtins.input",side_effect=["","My Desktop",code,"y"]),patch.object(
                app,"_http",return_value={"token":token,"node_id":"b"*24}) as request:
            node=app.setup()
        self.assertEqual(node["node_id"],"b"*24)
        self.assertEqual(request.call_args.args[1],app.DEFAULT_SERVER+"/v1/slime/node/pair")
        self.assertEqual(request.call_args.args[2]["code"],code)
        self.assertNotIn("invite",request.call_args.args[2])

    def test_reopening_does_not_issue_new_invite_join(self):
        settings={"role":"friend","server":app.DEFAULT_SERVER,
                  "label":"test","node_id":"a"*24,"token":"P"*40}
        app._save(settings)
        with patch.object(app,"_http") as send:
            self.assertEqual(app.setup(),settings)
            send.assert_not_called()

    def test_leave_fails_closed_if_backend_revoke_fails(self):
        settings={"role":"friend","server":app.DEFAULT_SERVER,
                  "label":"test","node_id":"a"*24,"token":"P"*40}
        app._save(settings)
        with patch("builtins.input",return_value="y"),patch.object(app,"_http",side_effect=OSError("offline")):
            app.leave(settings)
        self.assertTrue(app._settings_path().exists())
        with patch("builtins.input",return_value="y"),patch.object(app,"_http",return_value={"ok":True}):
            app.leave(settings)
        self.assertFalse(app._settings_path().exists())

    def test_gecko_managed_fleet_enrollment_without_telegram_code(self):
        secret="gck_"+("A"*48)
        credential={"node_id":"f"*24,"token":"Z"*48,"poolId":"9"*24,
                    "inference_enabled":False}
        env={"GECKO_ENROLLMENT_TOKEN":secret,
             "GECKO_DEVICE_CONSENT":"approved_by_operator",
             "GECKO_HOST_LABEL":"GPU-RACK-01",
             "SLIME_INSTALL_ROLE":"friend"}
        with patch.dict(os.environ,env),patch.object(app,"_http",return_value=credential) as request,patch(
             "slime_runner_agent._heartbeat",return_value={"ok":True}):
            item=app.setup_fleet()
        self.assertEqual(item["node_id"],credential["node_id"])
        self.assertTrue(item["gecko_fleet"])
        self.assertFalse(item["shutdown_opt_in"])
        self.assertEqual(request.call_args.args[1],app.DEFAULT_SERVER+"/v1/gecko/agent/enroll")
        self.assertEqual(request.call_args.args[2]["device_consent"],True)
        self.assertEqual(app._load()["token"],credential["token"])
        self.assertNotIn(secret,str(app._load()))

    def test_unapproved_headless_gecko_host_cannot_autoenroll(self):
        secret="gck_"+("A"*48)
        with patch.dict(os.environ,{"GECKO_ENROLLMENT_TOKEN":secret,
                  "GECKO_DEVICE_CONSENT":"","SLIME_INSTALL_ROLE":"friend"}),patch.object(
                  app.sys,"stdin") as stdin,patch.object(app,"_http") as request:
            stdin.isatty.return_value=False
            self.assertIsNone(app.setup_fleet())
            request.assert_not_called()

    def test_status_does_not_leak_token(self):
        settings={"role":"friend","server":app.DEFAULT_SERVER,
                  "label":"test","node_id":"a"*24,"token":"P"*40}
        with patch("slime_runner_agent._heartbeat",return_value={
            "ok":True,"owner_enabled":True,"inference_enabled":False}),patch("slime_runner_agent._models",return_value=[]):
            from io import StringIO
            with patch("sys.stdout",new_callable=StringIO) as out:
                app.status(settings)
                self.assertNotIn(settings["token"],out.getvalue())
                self.assertIn("未核准",out.getvalue())


if __name__=="__main__":
    unittest.main()
