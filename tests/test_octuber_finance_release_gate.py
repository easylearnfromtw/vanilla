"""Synthetic OCTUBER finance release gate tests: no GPU, no genuine model weights."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "training" / "octuber-finance" / "release_gate.py"
spec = importlib.util.spec_from_file_location("octuber_finance_gate", SCRIPT)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class FinanceReleaseGate(unittest.TestCase):
    def fixture(self, root):
        approved = root / "reviewed"
        approved.mkdir()
        hashes = {}
        for part in ("train", "eval", "test"):
            path = approved / f"{part}.jsonl"
            path.write_text(f'{{"id":"synthetic_{part}","source":"authored"}}\n')
            hashes[part] = gate.sha256(path)
        (approved / "approved-provenance.json").write_text(json.dumps({
            "state": "REVIEWED_SFT_NOT_TRAINED",
            **{part + "_sha256": hashes[part] for part in hashes},
        }) + "\n")
        artifact = root / "adapter-06b"
        weights = artifact / "adapter" / "adapter_model.safetensors"
        weights.parent.mkdir(parents=True)
        weights.write_bytes(b"NOT_REAL_WEIGHTS" * 150)
        receipt = {
            "status": "ADAPTER_TRAINED_NOT_RELEASED",
            "tier": "0.6b", "base_model": gate.TIERS["0.6b"],
            "base_revision": "a" * 40,
            "timestamp_utc": "2026-10-25T07:00:00+00:00",
            "gpu": {"available": True, "device": "SYNTHETIC-NO-REAL-CUDA"},
            "data_provenance": {
                "train_sha256": hashes["train"], "eval_sha256": hashes["eval"],
                "provenance_sha256": gate.sha256(approved / "approved-provenance.json"),
            },
            "adapter_sha256": gate.sha256(weights),
            "completed_gradient_steps": 20,
            "approved_rows": 150, "chronological_eval_rows": 120,
            "train_loss": 1.2, "eval_loss": 1.1,
            "independent_backtest_passed": False, "released": False,
        }
        (artifact / "training-provenance.json").write_text(json.dumps(receipt))
        return approved, artifact, hashes

    def test_hash_lineage_does_not_authorize_release(self):
        with tempfile.TemporaryDirectory() as td:
            approved, artifact, _ = self.fixture(Path(td))
            result = gate.validate(approved, {"0.6b": artifact})
            self.assertFalse(result["production_release_authorized"])
            self.assertFalse(result["independent_financial_benchmark_passed"])
            self.assertFalse(result["all_five_artifacts_present"])
            self.assertEqual(len(result["missing_tiers"]), 4)
            self.assertEqual(result["sixty_b"], "NO_VERIFIED_60B_TRAINER")

    def test_tampered_weights_or_data_blocked(self):
        with tempfile.TemporaryDirectory() as td:
            approved, artifact, _ = self.fixture(Path(td))
            (artifact / "adapter" / "adapter_model.safetensors").write_bytes(b"changed" * 500)
            with self.assertRaisesRegex(ValueError, "FINANCE_WEIGHTS_TAMPERED"):
                gate.validate(approved, {"0.6b": artifact})
        with tempfile.TemporaryDirectory() as td:
            approved, artifact, _ = self.fixture(Path(td))
            (approved / "train.jsonl").write_text("different")
            with self.assertRaisesRegex(ValueError, "DATASET_CHANGED_AFTER_APPROVAL"):
                gate.validate(approved, {"0.6b": artifact})

    def test_unimplemented_sixty_b_cannot_be_masqueraded(self):
        with tempfile.TemporaryDirectory() as td:
            approved, artifact, _ = self.fixture(Path(td))
            with self.assertRaisesRegex(ValueError, "UNSUPPORTED_TIER"):
                gate.validate(approved, {"60b": artifact})


if __name__ == "__main__":
    unittest.main()
