"""Fail-closed security tests for GitHub autonomous alert data minimization."""
import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[2] / "deployment" / "quirinus" / "autonomous_alert.py"
spec = importlib.util.spec_from_file_location("quirinus_autonomous_test", MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def safe_report():
    return {
        "tool": "Quirinus", "scanner": "VulnClaw CodeScan 0.4.1",
        "result": "completed", "filesScanned": 201, "totalFindings": 6,
        "severityCounts": {"Critical": 0, "High": 2, "Medium": 3, "Low": 1, "Info": 0},
        "highRisk": True, "truncated": False,
        "rawEvidenceIncluded": False, "fileLocationsIncluded": False,
        "jensenBacklogPublished": False,
        "findings": [{"file": "SECRET/private/file.py", "evidence": "SECRET-VALUE"}],
    }


class AutonomousReviewTests(unittest.TestCase):
    def test_output_has_only_allowlisted_counters(self):
        value = mod.normalize(safe_report())
        self.assertTrue(value["alert"])
        self.assertEqual(value["severityCounts"]["High"], 2)
        self.assertEqual(value["filesScanned"], 201)
        self.assertNotIn("SECRET/private/file.py", repr(value))
        self.assertNotIn("SECRET-VALUE", repr(value))
        self.assertNotIn("findings", value)
        self.assertEqual(mod.normalize(safe_report())["fingerprint"], value["fingerprint"])

    def test_no_alert_low_only_but_partial_scan_alerts(self):
        report = safe_report()
        report["severityCounts"] = {
            "Critical": 0, "High": 0, "Medium": 3, "Low": 1, "Info": 2
        }
        report["highRisk"] = False
        self.assertFalse(mod.normalize(report)["alert"])
        report["truncated"] = True
        self.assertTrue(mod.normalize(report)["alert"])

    def test_untrusted_strings_do_not_change_public_output(self):
        before = mod.normalize(safe_report())
        report = dict(safe_report(), note="KEY-NEVER-SEND", findings=[{"path": "SECRET"}])
        self.assertEqual(mod.normalize(report), before)
        self.assertNotIn("KEY-NEVER-SEND", repr(mod.normalize(report)))

    def test_reject_malformed_or_sensitive_summary(self):
        variations = [
            {"totalFindings": 5},
            {"filesScanned": True},
            {"severityCounts": {"High": 2}},
            {"severityCounts": {"Critical": 0, "High": True, "Medium": 3, "Low": 1, "Info": 0}},
            {"rawEvidenceIncluded": True},
            {"fileLocationsIncluded": True},
            {"jensenBacklogPublished": True},
            {"highRisk": False},
            {"truncated": 1},
            {"result": "partial"},
        ]
        for change in variations:
            with self.subTest(change=change):
                with self.assertRaises(ValueError):
                    mod.normalize(dict(safe_report(), **change))


if __name__ == "__main__":
    unittest.main()
