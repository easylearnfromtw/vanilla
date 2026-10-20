"""Quirinus PR aggregate risk gate: no raw finding data or false pass."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

BASE = Path(__file__).resolve().parents[2] / "deployment" / "quirinus"
sys.path.insert(0, str(BASE))
spec = importlib.util.spec_from_file_location("quirinus_regression_test", BASE / "regression_check.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def report(critical=0, high=0, truncated=False):
    value = {
        "tool": "Quirinus", "scanner": "VulnClaw CodeScan 0.4.1",
        "result": "completed", "filesScanned": 201,
        "severityCounts": {"Critical": critical, "High": high,
                           "Medium": 3, "Low": 2, "Info": 1},
        "highRisk": bool(critical or high), "truncated": truncated,
        "rawEvidenceIncluded": False, "fileLocationsIncluded": False,
        "jensenBacklogPublished": False,
        "findings": [{"file": "DONT-PUBLISH/internal.py",
                      "evidence": "PRIVATE-KEY-MATERIAL"}],
    }
    value["totalFindings"] = sum(value["severityCounts"].values())
    return value


class QuirinusRegressionTests(unittest.TestCase):
    def gate(self, base, proposed):
        return module.compare(module.normalize(base), module.normalize(proposed))

    def test_no_aggregate_increase(self):
        result = self.gate(report(high=2), report(high=2))
        self.assertFalse(result["blocked"])
        self.assertEqual(result["reason"], "stable")
        self.assertNotIn("DONT-PUBLISH", module.render(result))

    def test_higher_high_or_critical_requires_review(self):
        self.assertEqual(self.gate(report(high=2), report(high=3))["reason"], "elevated")
        self.assertTrue(self.gate(report(critical=0), report(critical=1))["blocked"])
        # Fixing Critical while increasing High still requires review.
        self.assertTrue(self.gate(report(critical=1), report(high=1))["blocked"])

    def test_truncated_preview_does_not_block_complete_aggregate(self):
        self.assertEqual(self.gate(report(), report(truncated=True))["reason"], "stable")
        self.assertEqual(self.gate(report(truncated=True), report())["reason"], "stable")
        self.assertTrue(self.gate(report(high=1, truncated=True),
                                  report(high=2, truncated=True))["blocked"])

    def test_sensitive_fields_cannot_change_output(self):
        p=report(high=3)
        before=module.normalize(p)
        p["findings"]=[{"file":"SECRET-PATH","evidence":"SECRET"}]
        p["extraText"]="SECRET"
        self.assertEqual(before,module.normalize(p))
        self.assertNotIn("SECRET", module.render(self.gate(report(high=2),p)))

    def test_invalid_summary_fails_closed(self):
        p=report()
        p["severityCounts"]["High"]=True
        with self.assertRaises(ValueError):
            module.normalize(p)
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/"bad.json").write_text('{"tool":"Quirinus","findings":"secret"}')
            with self.assertRaises(ValueError):
                module.read_report(str(root/"bad.json"))
            (root/"huge.json").write_text("X"*(16*1024+1))
            with self.assertRaises(ValueError):
                module.read_report(str(root/"huge.json"))

if __name__ == "__main__":
    unittest.main()
