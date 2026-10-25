"""No-network tests for manifest-hash-gated book content indexing."""
import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("licensed_content",ROOT/"training/atuber-books/licensed_content.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class LicensedTextSandbox(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.corpus=self.root/"books"
        self.corpus.mkdir()
        self.text=("通貨膨脹指整體物價水準持續上漲，不等同於某項商品一次性的價格變動。"
                   "風險管理需要考量損失的可能性及損失程度。\n")*16
        (self.corpus/"example.txt").write_text(self.text,encoding="utf-8")
        self.record={"id":"owner_written_001","title":"示範經濟教材","author":"作者甲",
                     "source_url":"https://example.org/owned-text",
                     "content_file":"example.txt",
                     "content_sha256":hashlib.sha256(self.text.encode()).hexdigest(),
                     "rights_basis":"owned","rights_reference":"owner original authored teaching note",
                     "reviewer":"Owner reviewer","rights_reviewed":True,
                     "training_permission":True}
        self.manifest=self.root/"manifest.json"
        self.save()

    def save(self):
        self.manifest.write_text(json.dumps([self.record],ensure_ascii=False),encoding="utf-8")

    def test_sourced_search_returns_book_excerpt_but_no_weight_claim(self):
        result=mod.build(self.corpus,self.manifest,self.root/"approved.sqlite3")
        self.assertEqual(result["book_count"],1)
        self.assertGreater(result["content_chunks"],0)
        self.assertEqual(result["llm_weight_updates"],0)
        found=mod.evidence(self.root/"approved.sqlite3","什麼是通貨膨脹")
        self.assertTrue(found["evidence"])
        self.assertIn("通貨膨脹",found["evidence"][0]["excerpt"])
        self.assertEqual(found["evidence"][0]["source_url"],"https://example.org/owned-text")
        unknown=mod.evidence(self.root/"approved.sqlite3","量子電腦")
        self.assertEqual(unknown["evidence"],[])
        with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
            mod.build(self.corpus,self.manifest,self.root/"approved.sqlite3")

    def test_rejects_unreviewed_wrong_hash_and_path_traversal(self):
        self.record["training_permission"]=False
        self.save()
        with self.assertRaisesRegex(ValueError,"RIGHTS_REVIEW"):
            mod.build(self.corpus,self.manifest,self.root/"no.sqlite3")
        self.record["training_permission"]=True
        self.record["content_sha256"]="0"*64
        self.save()
        with self.assertRaisesRegex(ValueError,"SHA256_MISMATCH"):
            mod.build(self.corpus,self.manifest,self.root/"no.sqlite3")
        self.record["content_sha256"]=hashlib.sha256(self.text.encode()).hexdigest()
        self.record["content_file"]="../manifest.json"
        self.save()
        with self.assertRaisesRegex(ValueError,"ONLY_LOCAL"):
            mod.build(self.corpus,self.manifest,self.root/"no.sqlite3")

    def test_dry_run_no_private_index(self):
        dest=self.root/"nonexistent.sqlite3"
        self.assertEqual(mod.main(["--root",str(self.corpus),"--manifest",str(self.manifest),
                                   "--index",str(dest)]),0)
        self.assertFalse(dest.exists())


if __name__=="__main__":
    unittest.main()
