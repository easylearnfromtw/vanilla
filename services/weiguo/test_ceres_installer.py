"""Offline security and regression tests for Ceres's original installer."""
import base64
from contextlib import redirect_stdout
from io import StringIO
import os
from pathlib import Path
import tempfile
import unittest

from ceres_installer import (create_private_template, inspect_settings,
                             load_private_env, main, redacted_summary)


class CeresInstallerTests(unittest.TestCase):
    def setUp(self):
        self.chat = "123456789"
        self.sub = "123456789012345678901"
        self.env = {
            "CERES_ENABLED": "true",
            "CERES_OWNER_ONLY": "true",
            "CERES_TELEGRAM_BOT_TOKEN": "12345678:" + "a" * 36,
            "CERES_TELEGRAM_EXPECTED_USERNAME": "SignWell_bot",
            "CERES_TELEGRAM_WEBHOOK_URL":
                "https://weiguo-browser-production.up.railway.app/v1/ceres/telegram/webhook",
            "CERES_TELEGRAM_WEBHOOK_SECRET": "b" * 48,
            "CERES_TELEGRAM_CHAT_IDS": self.chat,
            "CERES_FAMILY_LINKS_JSON": '{"' + self.chat + '":"' + self.sub + '"}',
            "WEIGUO_FAMILY_ACL_JSON":
                '{"' + self.sub + '":{"member":"Test","role":"owner"}}',
            "WEIGUO_ADMIN_TOKEN": "c" * 48,
            "WEIGUO_SESSION_SECRET": "d" * 48,
            "WEIGUO_VAULT_KEY": base64.urlsafe_b64encode(b"q" * 32).decode(),
            "CERES_DB_PATH": "/data/ceres-events.sqlite3",
            "WEIGUO_PUBLIC_FAMILY_ONLY": "true",
        }

    def test_ready_configuration_is_redacted_not_network_proof(self):
        self.assertTrue(all(ok for _, ok, _ in inspect_settings(self.env)))
        report = redacted_summary(self.env)
        self.assertIn("9/9", report)
        self.assertIn("不代表", report)
        for value in (self.env["CERES_TELEGRAM_BOT_TOKEN"],
                      self.env["WEIGUO_VAULT_KEY"],
                      self.chat, self.sub,
                      self.env["CERES_TELEGRAM_WEBHOOK_URL"]):
            self.assertNotIn(value, report)

    def test_fail_closed_for_unauthorized_identity_and_bad_url(self):
        cases = [
            ("WEIGUO_FAMILY_ACL_JSON", '{"' + self.sub + '":{"role":"member"}}'),
            ("CERES_FAMILY_LINKS_JSON", '{"111111111":"' + self.sub + '"}'),
            ("CERES_OWNER_ONLY", "false"),
            ("CERES_TELEGRAM_WEBHOOK_URL", "http://127.0.0.1/v1/ceres/telegram/webhook"),
            ("CERES_TELEGRAM_WEBHOOK_URL", "https://evil.up.railway.app.attacker.org/v1/ceres/telegram/webhook"),
            ("CERES_TELEGRAM_BOT_TOKEN", "bad-token"),
            ("WEIGUO_SESSION_SECRET", self.env["WEIGUO_ADMIN_TOKEN"]),
            ("CERES_DB_PATH", "/tmp/ceres.sqlite"),
            ("WEIGUO_PUBLIC_FAMILY_ONLY", "false"),
        ]
        for key, value in cases:
            with self.subTest(key=key):
                changed = dict(self.env, **{key: value})
                self.assertFalse(all(ok for _, ok, _ in inspect_settings(changed)))

    def test_private_template_never_overwrites_or_activates_services(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ceres.env"
            create_private_template(path)
            settings = load_private_env(path)
            self.assertEqual(settings["CERES_ENABLED"], "false")
            self.assertEqual(settings["CERES_TELEGRAM_REGISTER_WEBHOOK"], "false")
            self.assertNotEqual(settings["WEIGUO_ADMIN_TOKEN"], settings["WEIGUO_SESSION_SECRET"])
            self.assertTrue(len(settings["WEIGUO_ADMIN_TOKEN"]) >= 32)
            if os.name == "posix":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            before = path.read_bytes()
            with self.assertRaises(FileExistsError):
                create_private_template(path)
            self.assertEqual(before, path.read_bytes())
            buf = StringIO()
            with redirect_stdout(buf):
                self.assertEqual(main(["doctor", "--env-file", str(path)]), 2)
            self.assertNotIn(settings["WEIGUO_ADMIN_TOKEN"], buf.getvalue())
            self.assertNotIn(settings["WEIGUO_VAULT_KEY"], buf.getvalue())

    def test_rejects_unsafe_permissions_and_symlinks(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "private.env"
            target.write_text("CERES_ENABLED=false\n", encoding="utf-8")
            if os.name == "posix":
                target.chmod(0o644)
                with self.assertRaises(ValueError):
                    load_private_env(target)
                target.chmod(0o600)
            linked = Path(directory) / "link.env"
            try:
                linked.symlink_to(target)
            except (NotImplementedError, OSError):
                return
            with self.assertRaises(ValueError):
                load_private_env(linked)

    def test_no_shell_execution_on_untrusted_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ceres.env"
            marker = Path(directory) / "should-not-exist"
            path.write_text("CERES_ENABLED=$(touch " + str(marker) + ")\n", encoding="utf-8")
            if os.name == "posix":
                path.chmod(0o600)
            loaded = load_private_env(path)
            self.assertTrue(loaded["CERES_ENABLED"].startswith("$("))
            self.assertFalse(marker.exists())

    def test_module_is_shipped_in_both_production_images(self):
        root = Path(__file__).resolve().parent
        for name in ("Dockerfile", "Dockerfile.pdfcraft"):
            with self.subTest(name=name):
                image = (root / name).read_text(encoding="utf-8")
                self.assertIn("ceres_installer.py", image)
                self.assertIn("import ceres_installer", image)


if __name__ == "__main__":
    unittest.main()
