"""Multi-size Qwen3 QLoRA policy tests. CPU only, no model downloads."""
import ast
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ATUBER=ROOT/"training"/"atuber"
sys.path.insert(0,str(ATUBER))
from multisize_registry import MODELS,get_spec
from multisize_train import preflight,train_model

def reviewed_record(i):
    return {
        "id":f"TEST_FAMILY_{i:03d}",
        "user":f"這是訓練驗證用的虛構問題 {i}，不能當成實際市價。",
        "assistant":"只有看到真實工具回條才能報告已完成，否則請說明缺少哪些依據。",
        "domain":"pricing",
        "source":"authored","reviewed":True,"consent":True,
    }

class MultiSizeRegistryTests(unittest.TestCase):
    def test_seven_official_qwen3_models_with_exact_model_size_selection(self):
        self.assertEqual([x.key for x in MODELS],
                         ["0.6b","1.7b","4b","8b","14b","30b","32b"])
        self.assertEqual(len({x.base for x in MODELS}),len(MODELS))
        self.assertEqual(len({x.ollama for x in MODELS}),len(MODELS))
        self.assertEqual(get_spec("30b").architecture,"moe")
        self.assertEqual(get_spec("32b").architecture,"dense")
        self.assertEqual(get_spec("30b").lora_targets,
                         ("q_proj","k_proj","v_proj","o_proj"))
        self.assertGreater(get_spec("32b").min_vram_gib,get_spec("14b").min_vram_gib)
        with self.assertRaisesRegex(ValueError,"UNSUPPORTED"):
            get_spec("60b")
        with self.assertRaisesRegex(ValueError,"UNSUPPORTED"):
            get_spec("../untrusted")
    def test_approved_schema_is_checked_before_hardware_and_all_models_use_same_data_contract(self):
        with tempfile.TemporaryDirectory() as t:
            file=Path(t)/"fixture_only_reviewed.jsonl"
            file.write_text("".join(json.dumps(reviewed_record(i),ensure_ascii=False)+"\n" for i in range(150)),
                            encoding="utf8")
            for spec in MODELS:
                result=preflight(model_size=spec.key,dataset=file,steps=24,max_length=256)
                self.assertEqual(result["base_model"],spec.base)
                self.assertFalse(result["adapter_trained"])
                self.assertFalse(result["weights_created"])
                self.assertEqual(result["reviewed_rows"],150)
                self.assertGreaterEqual(result["heldout_rows"],5)
                self.assertEqual(result["steps_planned"],24)
            with self.assertRaisesRegex(ValueError,"PIN_BASE_REVISION"):
                preflight(model_size="4b",dataset=file,steps=24,max_length=256,base_revision="main")
            with self.assertRaisesRegex(ValueError,"UNSUPPORTED_STEPS"):
                preflight(model_size="4b",dataset=file,steps=0,max_length=256)
    def test_generated_dialogue_is_rejected_without_approval(self):
        from price_tool_sft_candidates import generate
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)/"unreviewed.jsonl"
            path.write_text("".join(json.dumps(x,ensure_ascii=False)+"\n" for x in generate()),encoding="utf8")
            for key in ("0.6b","4b","8b","30b"):
                with self.assertRaisesRegex(ValueError,"TRAINING_APPROVAL_REQUIRED"):
                    preflight(model_size=key,dataset=path,steps=24,max_length=256)
    def test_real_gpu_training_is_not_silently_replaced_with_mock_weights(self):
        code=(ATUBER/"multisize_train.py").read_text(encoding="utf8")
        ast.parse(code)
        self.assertIn("torch.cuda.is_available()",code)
        self.assertIn("actual_optimizer_steps",code)
        self.assertIn("adapter_model.safetensors",code)
        self.assertIn("REFUSE_TO_OVERWRITE_TRAINED_WEIGHTS",code)
        self.assertIn("local_files_only=not allow_download",code)
        manifest=json.loads((ROOT/"models"/"atuber"/"manifest.json").read_text())
        self.assertEqual(manifest["release_state"],"bootstrap-only")
        self.assertIsNone(manifest["standalone_weights"])

if __name__=="__main__":
    unittest.main()
