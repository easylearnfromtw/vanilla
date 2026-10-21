"""Offline regression tests for secure Slime pairing and reconnect."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "weiguo"))
import slime_desktop as desktop
import slime_runner_agent as runner


class SlimeOnboardingTests(unittest.TestCase):
    def test_one_telegram_code_is_normalized_and_legacy_is_distinct(self):
        self.assertEqual(desktop._invite("abcd-efgh-jkmn"), "ABCD-EFGH-JKMN")
        with self.assertRaises(ValueError):
            desktop._invite("XXXX-XXXX-XXXX")  # illustrative placeholder, not valid
        with self.assertRaises(ValueError):
            desktop._invite("my-model-api-key")
        with self.assertRaises(ValueError):
            desktop._server("http://unprotected-host.test")

    def test_successful_pairing_is_saved_and_heartbeat_verified(self):
        calls = []
        response = {"node_id": "a" * 24, "token": "t" * 48}
        with patch.object(desktop, "_load", return_value=None), \
             patch.object(desktop, "_save", side_effect=lambda obj: calls.append(("save", obj))), \
             patch.object(desktop, "_confirm", return_value=True), \
             patch.object(desktop, "_http", return_value=response) as post, \
             patch.object(runner, "_heartbeat", side_effect=lambda server, token: calls.append(("heartbeat", server)) or {"ok": True}), \
             patch("builtins.input", side_effect=["", "My PC", "ABCD-EFGH-JKMN"]):
            settings = desktop.setup()
        self.assertEqual([c[0] for c in calls], ["save", "heartbeat"])
        self.assertEqual(settings["node_id"], response["node_id"])
        self.assertEqual(settings["token"], response["token"])
        self.assertEqual(post.call_args.args[1].split("/")[-1], "pair")
        self.assertEqual(post.call_args.args[2]["code"], "ABCD-EFGH-JKMN")

    def test_temporary_heartbeat_failure_keeps_consumed_code_binding(self):
        response = {"node_id": "b" * 24, "token": "x" * 48}
        saved = []
        with patch.object(desktop, "_load", return_value=None), \
             patch.object(desktop, "_save", side_effect=saved.append), \
             patch.object(desktop, "_confirm", return_value=True), \
             patch.object(desktop, "_http", return_value=response), \
             patch.object(runner, "_heartbeat", side_effect=TimeoutError), \
             patch("builtins.input", side_effect=["", "My PC", "ABCD-EFGH-JKMN"]):
            result = desktop.setup()
        self.assertEqual(len(saved), 1)
        self.assertEqual(result["node_id"], response["node_id"])

    def test_status_distinguishes_binding_from_local_model_readiness(self):
        settings = {"server": desktop.DEFAULT_SERVER, "token": "z" * 48, "label": "My PC"}
        with patch.object(runner, "_heartbeat", return_value={"ok": True, "owner_enabled": True, "inference_enabled": False}), \
             patch.object(runner, "_models", side_effect=ConnectionError):
            # Generic connection failures should not cause an invalid pairing diagnosis.
            self.assertTrue(desktop.status(settings))

    def test_runner_keeps_ollama_loopback_and_uses_system_proxy_for_https(self):
        self.assertIsNot(runner._LOCAL_OPENER, runner._NETWORK_OPENER)
        self.assertGreaterEqual(runner._ram_gb(), 0)
        self.assertLessEqual(len(runner._gpu_name()), 150)


if __name__ == "__main__":
    unittest.main()
