"""No-network tests for exact title answers and genuinely updated tiny classifier weights."""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("title_sandbox",ROOT/"training/atuber-books/title_weight_sandbox.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class TitleWeights(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.db=self.root/"catalog.sqlite3"
        with sqlite3.connect(self.db) as con:
            con.execute("CREATE TABLE books (title TEXT, topic TEXT, split TEXT, id TEXT, author TEXT, source_url TEXT, publication_year TEXT, language TEXT)")
            for k,topic in enumerate(mod.LABELS):
                stems={"economics":"經濟政策","finance":"金融銀行","stocks":"股票證券",
                       "psychology":"心理研究","philosophy":"哲學倫理"}
                for i in range(40):
                    split=["train-index","train-index","train-index","validation","holdout"][i%5]
                    title=f"{stems[topic]} 第{i}冊"
                    con.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?)",
                      (title,topic,split,f"book_{k:02d}_{i:03d}","作者甲",
                       "https://data.gov.tw/dataset/7502","2025","zh"))

    def test_runs_real_optimizer_and_saves_weights(self):
        report=mod.fit(self.db,self.root/"weights",steps=250)
        self.assertEqual(report["optimizer_steps_completed"],250)
        self.assertGreater(report["scalar_parameter_updates"],1000)
        self.assertEqual(report["neural_llm_weight_updates"],0)
        self.assertEqual(report["full_text_books_read"],0)
        saved=json.loads((self.root/"weights/weights.json").read_text())
        self.assertTrue(any(abs(w)>0.0 for row in saved["weights"] for w in row))
        self.assertEqual(report["holdout_baseline"]["sample_count"],40)
        self.assertEqual(report["holdout_final"]["sample_count"],40)
        self.assertNotEqual(report["weight_file_sha256"],"")

    def test_titles_are_sourced_and_holdout_only(self):
        report=mod.catalogue_title_drill(self.db,self.root/"questions.jsonl",10)
        self.assertEqual(report["questions"],10)
        lines=[json.loads(line) for line in (self.root/"questions.jsonl").read_text().splitlines()]
        self.assertTrue(all(item["split"]=="holdout" and item["book_content_known"] is False for item in lines))
        self.assertTrue(all(item["expected_answer"]=="作者甲" for item in lines))
        with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
            mod.catalogue_title_drill(self.db,self.root/"questions.jsonl",10)

    def test_dry_run_no_weights(self):
        self.assertEqual(mod.main(["--database",str(self.db),"--output",str(self.root/"none"),
                                   "--steps","1000000"]),0)
        self.assertFalse((self.root/"none").exists())
        with self.assertRaisesRegex(ValueError,"ONE_MILLION"):
            mod.fit(self.db,self.root/"x",steps=1000001)


if __name__=="__main__":
    unittest.main()
