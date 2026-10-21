"""Offline security/contract tests. No live API calls, secrets or model output."""
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / path)
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


gate = load("hank_tracely_gate", "hank-tracely-gate.py")
notify = load("hank_ceres_notify", "hank-ceres-notify.py")
SHA = "f" * 40


class HankTracelyTests(unittest.TestCase):
    def test_urls_reject_secrets_and_internal_networks(self):
        for url in ("http://example.org", "https://user:pw@example.org",
                    "https://example.org?a=token", "https://example.org/#secret",
                    "https://example.org:8443", "https://127.0.0.1",
                    "https://localhost", "https://db.internal"):
            self.assertFalse(gate.https_url(url))
        self.assertTrue(gate.https_url("https://tracely.example.org"))
        self.assertTrue(gate.https_url("https://candidate.example.org/version", revision=True))

    def test_revision_requires_exact_sha_and_json(self):
        with patch.object(gate, "build_opener") as opener:
            response = MagicMock()
            response.status = 200
            response.headers = {"content-type": "application/json"}
            response.read.return_value = json.dumps({"sha": SHA}).encode()
            opener.return_value.open.return_value.__enter__.return_value = response
            self.assertTrue(gate.revision_matches("https://candidate.example.org/version", SHA))
            self.assertFalse(gate.revision_matches("https://candidate.example.org/version", "e" * 40))
        self.assertFalse(gate.revision_matches("http://localhost/version", SHA))

    def test_no_configuration_is_error_not_pass(self):
        with tempfile.TemporaryDirectory() as d, patch.object(gate, "OUT", Path(d) / "result.json"), patch.dict(os.environ, {}, clear=True):
            self.assertEqual(gate.main(), 2)
            self.assertEqual(json.loads((Path(d) / "result.json").read_text())["status"], "ERROR")

    def test_candidate_mismatch_cannot_launch_cli(self):
        env = {"TRACELY_API": "https://tracely.example.org", "TRACELY_KEY": "placeholder-secret",
               "HANK_TRACELY_AGENTS": "vanilla-ai",
               "HANK_TRACELY_REVISION_URL": "https://candidate.example.org/version",
               "HANK_EXPECTED_SHA": SHA}
        with tempfile.TemporaryDirectory() as d, patch.object(gate, "OUT", Path(d) / "result.json"), patch.dict(os.environ, env, clear=True), patch.object(gate, "revision_matches", return_value=False), patch.object(gate.subprocess, "run") as run:
            self.assertEqual(gate.main(), 2)
            run.assert_not_called()

    def test_cli_failure_is_propagated_privately(self):
        env = {"TRACELY_API": "https://tracely.example.org", "TRACELY_KEY": "placeholder-secret",
               "HANK_TRACELY_AGENTS": "vanilla-ai",
               "HANK_TRACELY_REVISION_URL": "https://candidate.example.org/version",
               "HANK_EXPECTED_SHA": SHA}
        for code in (0, 1, 2):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as d, patch.object(gate, "OUT", Path(d) / "result.json"), patch.dict(os.environ, env, clear=True), patch.object(gate, "revision_matches", return_value=True), patch.object(gate.subprocess, "run", return_value=MagicMock(returncode=code)) as run:
                self.assertEqual(gate.main(), code)
                self.assertIn("--no-github", run.call_args.args[0])
                self.assertEqual(run.call_args.kwargs["stdout"], gate.subprocess.DEVNULL)
                self.assertEqual(json.loads((Path(d) / "result.json").read_text())["status"], {0: "PASS", 1: "FAIL", 2: "ERROR"}[code])

    def test_owner_notification_never_echoes_inputs(self):
        msg = notify.message("easylearnfromtw/vanilla", "123456", ["Giskard", "Tracely", "SECRET"])
        self.assertIn("Giskard", msg)
        self.assertIn("Tracely", msg)
        self.assertNotIn("SECRET", msg)
        with self.assertRaises(ValueError):
            notify.message("org/repo\nINJECTION", "123456", [])

    def test_notify_without_secrets_skips(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(notify.main(), 0)


if __name__ == "__main__":
    unittest.main()
