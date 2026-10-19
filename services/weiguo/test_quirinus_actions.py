"""Validate Quirinus Actions public report minimization without installing VulnClaw."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path

# Stub the private scan dependencies; only aggregate rendering is under test.
fake_qa = types.ModuleType("quirinus_adapter")
async def _never_run():
    raise RuntimeError("no network or code scan in unit tests")
fake_qa.quirinus_scan = _never_run
fake_dispatch = types.ModuleType("detroit_quirinus_dispatcher")
fake_dispatch.build_review_handoff = lambda scan: None
sys.modules.setdefault("quirinus_adapter", fake_qa)
sys.modules.setdefault("detroit_quirinus_dispatcher", fake_dispatch)

module_path = Path(__file__).resolve().parents[2] / "deployment" / "quirinus" / "actions_entrypoint.py"
spec = importlib.util.spec_from_file_location("quirinus_actions_entrypoint_test", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicReportTests(unittest.TestCase):
    def test_public_output_never_contains_findings_or_evidence(self):
        report = {
            "cream": {
                "severityCounts": {"Critical": 1, "High": 0, "Medium": 0,
                                   "Low": 0, "Info": 0},
                "filesScanned": 2,
                "totalFindings": 1,
                "highRisk": True, "truncated": False,
            },
            "jensenHandoff": {"tasks": [{"file": "services/private.py",
                                         "evidence": "SECRET-DO-NOT-LOG"}]},
        }
        safe = module.public_summary(report)
        serialized = module.render_summary(safe) + str(safe)
        self.assertNotIn("services/private.py", serialized)
        self.assertNotIn("SECRET-DO-NOT-LOG", serialized)
        self.assertNotIn("tasks", safe)
        self.assertTrue(safe["highRisk"])

    def test_reject_malformed_severity_data(self):
        report = {"cream": {"severityCounts": {"Critical": -1},
                            "filesScanned": 3, "totalFindings": 4,
                            "highRisk": True, "truncated": False}}
        with self.assertRaises(ValueError):
            module.public_summary(report)


if __name__ == "__main__":
    unittest.main()
