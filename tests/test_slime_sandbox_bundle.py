"""Reproducible, public-source-only toolkit packaging regressions."""
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"deployment"/"slime"/"build-unified-toolkit.py"
spec=importlib.util.spec_from_file_location("slime_build_bundle",SCRIPT)
builder=importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class SlimeUnifiedSandboxPackageTests(unittest.TestCase):
 def test_real_latest_main_sandboxes_are_all_present_and_not_shadowed_by_old_feature(self):
  expected=(
   "scripts/train-penteract-10m.mjs",
   "training/octuber-gpu-sandbox/core_sandbox.py",
   "training/octuber-gpu-sandbox/sandbox.py",
   "training/atuber-books/content_weight_sandbox.py",
   "training/atuber-books/title_weight_sandbox.py",
   "training/atuber-books/fuzzy_relevance_train.py",
   "training/scholarly/live_ingest.py",
   "training/atuber/human_shopper_sim.py",
   "training/atuber/multisize_train.py",
  )
  for path in expected:
   self.assertTrue((ROOT/path).is_file(),path)
  files={k for k,_ in builder.collect(ROOT)}
  self.assertTrue(set(expected).issubset(files))
 def test_bundle_is_source_only_repeatable_and_has_checksum_manifest(self):
  with tempfile.TemporaryDirectory() as tmp:
   dest=Path(tmp)/"slime-toolkit.zip"
   result=builder.make(ROOT,dest)
   self.assertTrue(dest.is_file())
   self.assertGreaterEqual(result["registered_sandboxes"],17)
   self.assertGreater(result["source_files"],40)
   self.assertFalse(result["weights_or_private_data_included"])
   self.assertEqual(hashlib.sha256(dest.read_bytes()).hexdigest(),result["sha256"])
   with zipfile.ZipFile(dest) as package:
    names=package.namelist()
    self.assertEqual(len(names),len(set(names)))
    self.assertTrue(all(n.startswith(builder.PACKAGE+"/") for n in names))
    manifest=json.loads(package.read(builder.PACKAGE+"/sandbox-manifest.json"))
    self.assertEqual(manifest["source_files"],result["source_files"])
    self.assertEqual(manifest["registered_sandbox_count"],result["registered_sandboxes"])
    self.assertFalse(manifest["model_base_weights_included"])
    self.assertFalse(manifest["private_datasets_included"])
    self.assertTrue(all(".safetensors" not in n for n in names))
    self.assertTrue(all("/private/" not in n for n in names))
    for entry in manifest["files"]:
     raw=package.read(builder.PACKAGE+"/"+entry["path"])
     self.assertEqual(hashlib.sha256(raw).hexdigest(),entry["sha256"])
   with self.assertRaisesRegex(ValueError,"DO_NOT_OVERWRITE"):
    builder.make(ROOT,dest)
 def test_no_user_secrets_or_raw_fulltext_are_included(self):
  found=[p for p,_ in builder.collect(ROOT)]
  self.assertTrue(all("/data/" not in p for p in found))
  self.assertTrue(all(not p.endswith((".gguf",".db",".sqlite",".safetensors",".pdf",".docx"))
                      for p in found))
  self.assertTrue(all(".env" not in p for p in found))
 def test_missing_sources_fail_instead_of_publishing_partial_archive(self):
  with tempfile.TemporaryDirectory() as tmp:
   with self.assertRaises(ValueError):
    builder.make(Path(tmp),Path(tmp)/"partial.zip")

if __name__=="__main__":unittest.main()
