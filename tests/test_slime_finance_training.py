"""SLIME finance bridge: synthetic contracts only, no real CUDA or external feeds."""
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "slime"))
import finance_training as f


class FinanceOwnerBridgeTests(unittest.TestCase):
    def fixture(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        repo = root / "vanilla"
        scripts = repo / "training" / "octuber-finance"
        scripts.mkdir(parents=True)
        for filename in ("train_tiers.py", "readiness.py", "release_gate.py"):
            (scripts / filename).write_text("# fixed contract fixture\n", encoding="utf-8")
        data = root / "private"
        approved = data / "approved"
        approved.mkdir(parents=True)
        (data / "prices").mkdir()
        (data / "price-rights.json").write_text('{"synthetic_fixture":true}', encoding="utf-8")
        receipt = {"state": "REVIEWED_SFT_NOT_TRAINED",
                   "date_boundaries": ["2021-12-31", "2024-12-31"]}
        for name in ("train", "eval", "test"):
            sample = [
                {"id": f"{name}_{n}", "user": f"{name} what happened at index {n}?",
                 "assistant": "Evidence is required before making a market claim.",
                 "source": "authored",
                 "domain": "research", "reviewed": True, "consent": True}
                for n in range(101)
            ]
            path = approved / (name + ".jsonl")
            path.write_text("".join(json.dumps(r) + "\n" for r in sample), encoding="utf-8")
            receipt[name + "_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            receipt[name] = len(sample)
        (approved / "approved-provenance.json").write_text(json.dumps(receipt), encoding="utf-8")
        return repo, data, root

    def test_only_five_supported_finance_model_tiers_and_60b_blocked(self):
        self.assertEqual(list(f.TIERS), ["0.6b", "4b", "14b", "30b", "32b"])
        with self.assertRaisesRegex(ValueError, "60B_MXFP4"):
            f.audit_finance("/not/a/path", "/not/a/path", "60b", "a"*40)
        self.assertEqual(f.MIN_TRAIN, 100)

    def test_preflight_validates_real_file_hashes_and_passes_no_training_flags(self):
        repo, data, _ = self.fixture()
        mocked = [
            {"expected_markets": 20, "market_count": 20, "complete_market_coverage": False},
            {"mode": "PLAN_ONLY", "training_executed": False,
             "models": {"0.6b": {"base": "Qwen/Qwen3-0.6B"}},
             "cuda": {"available": True, "vram_gib": 8, "device": "synthetic GPU"}}
        ]
        with patch.object(f, "_json_command", side_effect=mocked) as call, \
             patch.object(f.subprocess, "Popen") as spawn:
            report = f.audit_finance(repo, data, "0.6b", "a" * 40,
                                     python_exe=sys.executable)
            self.assertEqual(report["status"], "preflight-eligible-untrained")
            self.assertEqual(report["markets"], 20)
            self.assertEqual(report["approved_rows"]["test"], 101)
            self.assertFalse(report["weights_created"])
            self.assertFalse(report["strict_30y_coverage"])
            self.assertNotIn("--train", call.call_args_list[1].args[0])
            spawn.assert_not_called()

    def test_partial_coverage_and_inadequate_gpu_are_not_reported_trained(self):
        repo, data, _ = self.fixture()
        with patch.object(f, "_json_command", side_effect=[
            {"expected_markets": 20, "market_count": 20},
            {"mode": "PLAN_ONLY", "training_executed": False,
             "models": {"30b": {"base": "Qwen/Qwen3-30B-A3B-Instruct-2507"}},
             "cuda": {"available": True, "vram_gib": 8}}
        ]):
            report = f.audit_finance(repo, data, "30b", "b" * 40,
                                     python_exe=sys.executable)
            self.assertEqual(report["status"], "blocked-untrained")
            self.assertEqual(report["optimizer_steps_completed"], 0)

    def test_bad_rights_metadata_or_training_sample_blocks(self):
        repo, data, _ = self.fixture()
        rights = data / "price-rights.json"
        rights.unlink()
        with patch.object(f, "_json_command") as spawn:
            with self.assertRaisesRegex(ValueError, "REQUIRED_FILE"):
                f.audit_finance(repo, data, "0.6b", "c" * 40)
            spawn.assert_not_called()
        rights.write_text('{"test":1}')
        file = data / "approved" / "train.jsonl"
        lines = file.read_text(encoding="utf-8").splitlines()
        row = json.loads(lines[0])
        row["reviewed"] = False
        lines[0] = json.dumps(row)
        file.write_text("\n".join(lines) + "\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "UNREVIEWED"):
            f.audit_finance(repo, data, "0.6b", "c" * 40)

    def test_refuse_wrong_revision_and_train_eval_overlap(self):
        repo, data, _ = self.fixture()
        with self.assertRaisesRegex(ValueError, "IMMUTABLE"):
            f.audit_finance(repo, data, "4b", "latest")
        approved = data / "approved"
        row = json.loads((approved / "train.jsonl").read_text().splitlines()[0])
        lines = (approved / "eval.jsonl").read_text().splitlines()
        lines[0] = json.dumps({**row, "id": "eval_other"})
        (approved / "eval.jsonl").write_text("\n".join(lines) + "\n")
        with self.assertRaisesRegex(ValueError, "LEAKAGE|HASH_MISMATCH"):
            f.audit_finance(repo, data, "4b", "a" * 40)

    def test_friend_unconfirmed_and_missing_any_approval_never_launch(self):
        with patch.object(f, "audit_finance") as audit, \
             patch.object(f.subprocess, "Popen") as pop:
            for disabled in ("owner", "confirmed", "gpu_approved", "rights_approved",
                             "license_approved"):
                all_ok = dict(owner=True, confirmed=True, gpu_approved=True,
                              rights_approved=True, license_approved=True)
                all_ok[disabled] = False
                with self.assertRaises(PermissionError):
                    f.launch_finance("x", "y", "0.6b", "a" * 40, **all_ok)
            audit.assert_not_called()
            pop.assert_not_called()
        ui = (ROOT / "services/slime/finance_training_window.py").read_text("utf-8")
        self.assertIn('if not owner:', ui)
        self.assertIn('messagebox.askyesno', ui)
        self.assertIn('allow_download = tk.BooleanVar(value=False)', ui)

    def test_owner_only_explicitly_starts_fixed_local_python_no_shell_or_secrets(self):
        repo, data, root = self.fixture()
        mock_report = {"status": "preflight-eligible-untrained", "tier": "0.6b",
                       "base_model": "Qwen/Qwen3-0.6B",
                       "optimizer_steps_completed": 0, "weights_created": False}
        with patch.object(f, "audit_finance", return_value=mock_report), \
             patch.object(f.subprocess, "Popen", return_value=MagicMock(pid=5522)) as spawned, \
             patch.dict(os.environ, {"SLIME_NODE_TOKEN": "secret-1",
                                     "VANILLA_API_KEY": "secret-2",
                                     "HF_TOKEN": "secret-3"}, clear=False):
            result = f.launch_finance(
                repo, data, "0.6b", "d" * 40, owner=True, confirmed=True,
                gpu_approved=True, rights_approved=True, license_approved=True,
                output_root=root / "out", python_exe=sys.executable, steps=180
            )
        self.assertEqual(result["status"], "started-unverified")
        self.assertEqual(result["optimizer_steps_verified"], 0)
        self.assertFalse(result["released"])
        self.assertTrue(Path(result["log_path"]).exists())
        self.assertFalse(Path(result["output"]).exists())
        cmd = spawned.call_args.args[0]
        self.assertEqual(cmd[0], sys.executable)
        self.assertEqual(Path(cmd[1]).resolve(), (repo / "training/octuber-finance/train_tiers.py").resolve())
        self.assertIn("--train", cmd)
        self.assertNotIn("--allow-model-download", cmd)
        self.assertIn("--ack-data-rights", cmd)
        self.assertEqual(spawned.call_args.kwargs["stdin"], f.subprocess.DEVNULL)
        self.assertIs(spawned.call_args.kwargs["shell"], False)
        environment = spawned.call_args.kwargs["env"]
        for key in ("SLIME_NODE_TOKEN", "VANILLA_API_KEY", "HF_TOKEN"):
            self.assertNotIn(key, environment)

    def test_adapter_inspection_never_conflates_hashes_with_blind_release(self):
        repo, data, root = self.fixture()
        checkpoint = root / "checkpoint"
        checkpoint.mkdir()
        with patch.object(f, "_json_command", return_value={
            "verified_candidate_tiers": ["0.6b"],
            "production_release_authorized": False,
            "independent_financial_benchmark_passed": False,
            "artifacts": {"0.6b": {"steps": 180, "adapter_sha256": "a"*64}},
            "proof_limit": "Local receipts are not independent evidence"
        }) as called:
            status = f.inspect_finance_adapter(repo, data, "0.6b", checkpoint,
                                               python_exe=sys.executable)
            self.assertEqual(status["status"], "integrity-screen-only-not-released")
            self.assertFalse(status["production_released"])
            self.assertIn("--approved-dir", called.call_args.args[0])
        with self.assertRaisesRegex(ValueError, "UNSUPPORTED_CHECKPOINT"):
            f.inspect_finance_adapter(repo, data, "60b", checkpoint)
        with patch.object(f, "_json_command", return_value={
            "verified_candidate_tiers": ["0.6b"],
            "production_release_authorized": True,
            "independent_financial_benchmark_passed": False
        }):
            with self.assertRaisesRegex(ValueError, "RELEASE_GATE_REFUSED"):
                f.inspect_finance_adapter(repo, data, "0.6b", checkpoint,
                                          python_exe=sys.executable)

    def test_slime_sandbox_plan_registers_existing_finance_trainer_only_as_preview(self):
        import sandbox_center as s
        task = s.BY_ID["octuber-finance-plan"]
        self.assertEqual(task["mode"], "finance-qlora-plan-only")
        self.assertEqual(task["weight_scope"], "none")
        self.assertFalse(task["large"])
        repo, _, root = self.fixture()
        plan = s.compile_plan(repo, "octuber-finance-plan", python_exe=sys.executable,
                              output_root=root / "out")
        self.assertEqual(plan["argv"][-2:], ["--tier", "all"])
        self.assertFalse(plan["actual_execution_started"])
        self.assertEqual(plan["actual_qwen_llm_optimizer_steps"], 0)


if __name__ == "__main__":
    unittest.main()
