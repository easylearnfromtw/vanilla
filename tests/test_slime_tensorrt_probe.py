import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "weiguo"))
from slime_tensorrt_probe import probe_nvidia

class ProbeTests(unittest.TestCase):
    def test_no_nvidia_smi_is_not_eligible(self):
        self.assertFalse(probe_nvidia(which=lambda _: None)["available"])

    def test_detected_gpu_is_not_mistaken_for_verified_engine(self):
        def run(*args, **kwargs):
            return SimpleNamespace(stdout="NVIDIA GeForce RTX 3050, 555.10, 4096\n")
        data = probe_nvidia(run=run, which=lambda _: "/usr/bin/nvidia-smi")
        self.assertEqual(data["free_vram_mib"], 4096)
        self.assertFalse(data["runtime_compatible"])
        self.assertFalse(data["model_compatible"])
        self.assertFalse(data["available"])

    def test_invalid_memory_fails_closed(self):
        def run(*args, **kwargs):
            return SimpleNamespace(stdout="GPU, 555.10, invalid\n")
        self.assertFalse(probe_nvidia(run=run, which=lambda _: "nvidia-smi")["available"])

if __name__ == "__main__":
    unittest.main()
