"""No-network regression tests for the major-change gate policy."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("change_detector", ROOT / "scripts/giskard-change-detector.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class ChangeDetectorTests(unittest.TestCase):
    def test_minor_fix_does_not_trigger(self):
        report = module.classify([{"path": "src/detroit/diana.ts", "added": 5, "removed": 3, "new": False}])
        self.assertEqual(report["classification"], "minor")

    def test_large_ai_refactor_triggers(self):
        report = module.classify([{"path": "src/ai/model-orchestrator.ts", "added": 95, "removed": 92, "new": False}])
        self.assertTrue(report["runGiskard"])

    def test_new_agent_module_triggers(self):
        report = module.classify([{"path": "src/detroit/new-agent.ts", "added": 80, "removed": 0, "new": True}])
        self.assertIn("new-ai-module", report["reasons"])

    def test_many_ai_files_trigger(self):
        report = module.classify([
            {"path": f"src/ai/module{i}.ts", "added": 40, "removed": 0, "new": False}
            for i in range(3)
        ])
        self.assertIn("multi-module-ai-refactor", report["reasons"])

    def test_docs_and_tests_do_not_trigger(self):
        report = module.classify([
            {"path": "docs/ARCHITECTURE.md", "added": 800, "removed": 3, "new": False},
            {"path": "services/weiguo/test_ceres_gateway.py", "added": 220, "removed": 0, "new": True},
            {"path": "src/ai/model-theme.css", "added": 220, "removed": 0, "new": True},
        ])
        self.assertFalse(report["runGiskard"])

    def test_owner_can_request_minor_test(self):
        report = module.classify([{"path": "README.md", "added": 1, "removed": 0, "new": False}], force=True)
        self.assertTrue(report["runGiskard"])


if __name__ == "__main__":
    unittest.main()
