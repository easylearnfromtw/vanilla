"""Headless SLIME post-download onboarding contracts (no actual GUI/network/GPU)."""
import io
import os
import sys
import threading
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"services"/"weiguo"))
import slime_desktop as desktop
import slime_runner_agent as runner
import slime_welcome as welcome


class FirstRunExperienceTests(unittest.TestCase):
    def test_pairing_is_explicit_privacy_off_and_secret_not_in_display_strings(self):
        timeline=[]
        response={"node_id":"a"*24,"token":"private-token-"+"x"*40}
        with patch.object(desktop,"_role",return_value="friend"), \
             patch.object(desktop,"_save",side_effect=lambda obj:timeline.append(("save",obj))), \
             patch.object(desktop,"_http",return_value=response) as http, \
             patch.object(runner,"_heartbeat",side_effect=lambda a,b:timeline.append(("heartbeat",a)) or {"ok":True}):
            result,verified=desktop.pair_with_consent(
                server=desktop.DEFAULT_SERVER,label="  Workstation  ",
                secret="abcd-efgh-jkmn",role="friend",consent=True)
        self.assertTrue(verified)
        self.assertEqual([x[0] for x in timeline],["save","heartbeat"])
        self.assertEqual(result["label"],"Workstation")
        self.assertEqual(result["role"],"friend")
        self.assertFalse(result["geo_opt_in"])
        self.assertFalse(result["shutdown_opt_in"])
        payload=http.call_args.args[2]
        self.assertEqual(payload["code"],"ABCD-EFGH-JKMN")
        self.assertEqual(payload["public_ip"],"")
        self.assertNotIn(result["token"],str(welcome.explain_failure(ValueError(result["token"]))))

    def test_no_consent_and_role_mismatch_do_not_contact_network(self):
        with patch.object(desktop,"_role",return_value="owner"), \
             patch.object(desktop,"_http") as http, \
             patch.object(desktop,"_save") as save:
            value=desktop.pair_with_consent(server=desktop.DEFAULT_SERVER,
                label="Owner PC",secret="ABCD-EFGH-JKMN",role="owner",consent=False)
            self.assertEqual(value,(None,False))
            with self.assertRaises(PermissionError):
                desktop.pair_with_consent(server=desktop.DEFAULT_SERVER,
                    label="Friend",secret="ABCD-EFGH-JKMN",role="friend",consent=True)
            with self.assertRaises(ValueError):
                desktop.pair_with_consent(server="http://untrusted.example",
                    label="Owner",secret="ABCD-EFGH-JKMN",role="owner",consent=True)
            http.assert_not_called()
            save.assert_not_called()

    def test_one_time_code_never_reused_after_heartbeat_outage(self):
        with patch.object(desktop,"_role",return_value="owner"), \
             patch.object(desktop,"_http",return_value={"node_id":"b"*24,"token":"x"*48}), \
             patch.object(desktop,"_save") as saved, \
             patch.object(runner,"_heartbeat",side_effect=TimeoutError("network")):
            state,ok=desktop.pair_with_consent(
                server=desktop.DEFAULT_SERVER,label="Mac",secret="ABCD-EFGH-JKMN",
                role="owner",consent=True)
        self.assertFalse(ok)
        self.assertEqual(state["node_id"],"b"*24)
        saved.assert_called_once()
        self.assertIn("首次心跳", "首次心跳尚未驗證")

    def test_actionable_errors_are_sanitized(self):
        for code,text in [(401,"配對碼"),(403,"配對碼"),(404,"後端"),(429,"請求"),(503,"暫時")]:
            err=HTTPError("https://example.test/"+("secret-123"),code,"hidden-personal-data",{},None)
            display=welcome.explain_failure(err)
            self.assertIn(text,display)
            self.assertNotIn("secret-123",display)
            self.assertNotIn("hidden-personal-data",display)
        self.assertIn("HTTPS",welcome.explain_failure(URLError("secret url")))
        self.assertNotIn("my-token",welcome.explain_failure(ValueError("my-token")))
        self.assertIn("Owner",welcome.explain_failure(PermissionError("secret")))

    def test_frozen_first_open_routes_to_desktop_not_cli_or_pairing(self):
        fake=types.ModuleType("slime_welcome")
        fake.run_dashboard=MagicMock(return_value=0)
        with patch.dict(sys.modules,{"slime_welcome":fake}), \
             patch.object(sys,"argv",["Slime-Friend.exe"]), \
             patch.object(sys,"frozen",True,create=True), \
             patch.object(desktop,"_load",side_effect=AssertionError("CLI should not run")):
            self.assertEqual(desktop.main(),0)
        fake.run_dashboard.assert_called_once_with()

    def test_runner_exits_when_local_stop_is_set_without_heartbeat(self):
        stop=threading.Event()
        stop.set()
        with patch.object(runner,"_heartbeat") as heartbeat, \
             patch.object(runner,"_http") as http:
            runner.run(server=desktop.DEFAULT_SERVER,token="a"*48,stop_event=stop)
            heartbeat.assert_not_called()
            http.assert_not_called()

    def test_runner_stop_interrupts_sleep_without_polling_work(self):
        class StopAfterFirstWait:
            fired=False
            def is_set(self):
                return self.fired
            def wait(self,timeout):
                self.fired=True
                return True
        stop=StopAfterFirstWait()
        with patch.object(runner,"_heartbeat",return_value={
            "ok":True,"owner_enabled":True,"inference_enabled":False
        }) as heartbeat, patch.object(runner,"_http") as http:
            runner.run(server=desktop.DEFAULT_SERVER,token="x"*48,stop_event=stop,
                       allow_power_off=False)
        heartbeat.assert_called_once()
        http.assert_not_called()

    def test_stop_during_https_poll_drops_new_inference_job(self):
        stop=threading.Event()
        def poll(*args, **kwargs):
            stop.set()
            return {"job":{"id":"untrusted-task","request":{"model":"qwen3:0.6b"}}}
        with patch.dict(os.environ,{"GECKO_FLEET_NODE":"false"}), \
             patch.object(runner,"_heartbeat",return_value={
                "ok":True,"owner_enabled":True,"inference_enabled":True
             }), \
             patch.object(runner,"_models",return_value=["qwen3:0.6b"]), \
             patch.object(runner,"_register"), \
             patch.object(runner,"_http",side_effect=poll), \
             patch.object(runner,"_execute") as inference:
            runner.run(server=desktop.DEFAULT_SERVER,token="z"*48,
                       stop_event=stop,allow_power_off=False)
        inference.assert_not_called()

    def test_pending_power_command_cancels_on_stop(self):
        stop=MagicMock()
        stop.wait.return_value=True
        with patch.dict(os.environ,{"SLIME_ALLOW_POWER_OFF":"1"}), \
             patch.object(runner,"_http",return_value={"command":"shutdown"}), \
             patch.object(runner.subprocess,"run") as shell:
            runner._handle_power(desktop.DEFAULT_SERVER,"x"*48,stop_event=stop)
            shell.assert_not_called()
        stop.wait.assert_called_once_with(60)

    def test_cross_platform_installers_ship_dashboard_and_original_cli(self):
        flow=(ROOT/".github/workflows/slime-release.yml").read_text("utf-8")
        for fragment in ["--hidden-import slime_welcome","slime_welcome.py",
                         "Slime-Owner-macos.zip","Slime-Friend-linux.tar.gz",
                         "test_slime_first_run_gui.py"]:
            self.assertIn(fragment,flow)
        for script in ("Slime-Owner.command","Slime-Friend.command","launch-owner.sh",
                       "launch-friend.sh"):
            contents=(ROOT/"deployment"/"slime"/script).read_text("utf-8")
            self.assertIn("if [ \"$#\" -eq 0 ]; then set -- --dashboard; fi",contents)
            self.assertIn('"$@"',contents)
        src=(ROOT/"services"/"weiguo"/"slime_desktop.py").read_text("utf-8")
        self.assertIn('"--dashboard" in flags',src)
        self.assertIn('"--tools" in flags',src)
        self.assertIn('"--leave" in flags',src)
        self.assertIn('"--reward" in flags',src)
        gui=(ROOT/"services"/"weiguo"/"slime_welcome.py").read_text("utf-8")
        for text in ("配對碼","開始共享","停止共享","退出並撤銷配對","檢查網路與 Ollama",
                     "allow_power_off=","stop_event","run_owner_tools(self.root)"):
            self.assertIn(text,gui)
        self.assertNotIn("subprocess.Popen",gui)
        self.assertNotIn("shell=True",gui)


if __name__=="__main__":
    unittest.main()
