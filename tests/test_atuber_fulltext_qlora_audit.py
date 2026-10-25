"""Offline checks for exact-edition coverage and authorized book-level LLM audit."""
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]/"training/atuber-books"
sys.path.insert(0,str(BASE))
import approved_fulltext_qlora as full_lm
import fulltext_coverage as coverage


class RightsCoverage(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.catalog=self.root/"public.sqlite3"
        self.private=self.root/"private.sqlite3"
        with sqlite3.connect(self.catalog) as db:
            db.execute("CREATE TABLE books (id TEXT,title TEXT,author TEXT,isbn TEXT,source_url TEXT,source_scope TEXT)")
            db.executemany("INSERT INTO books VALUES(?,?,?,?,?,?)",[
              ("meta:a","書籍甲","甲作者","9781234567890","https://data.gov.tw/dataset/7502","catalogue-dataset"),
              ("meta:b","書籍乙","乙作者","9781234567891","https://data.gov.tw/dataset/7502","catalogue-dataset"),
              ("full:x","Excluded source","Writer","", "https://example.org/x", "verified-book-edition"),
            ])
        with sqlite3.connect(self.private) as db:
            db.execute("""CREATE TABLE books
              (id TEXT,title TEXT,rights_basis TEXT,rights_reference TEXT,reviewer TEXT,
               content_sha256 TEXT)""")
            db.execute("""CREATE TABLE chunks
              (id TEXT,book_id TEXT,body TEXT,body_sha256 TEXT)""")
            db.execute("""CREATE TABLE ingest_files
              (book_id TEXT,isbn TEXT)""")
            for i in range(25):
                uid=f"righted_{i:03d}"
                db.execute("INSERT INTO books VALUES(?,?,?,?,?,?)",
                    (uid,f"Owned Book {i}","owned","real local author's training permission","Rights Reviewer","a"*64))
                for j in range(10):
                    body=f"Body {i} approved token paragraph {j} repeated."
                    db.execute("INSERT INTO chunks VALUES(?,?,?,?)",
                               (f"chunk_{i}_{j}",uid,body,
                                hashlib.sha256(body.encode()).hexdigest()))
            db.execute("INSERT INTO ingest_files VALUES(?,?)",("righted_001","9781234567890"))

    def test_catalog_coverage_not_falsely_counted_by_title(self):
        res=coverage.coverage(self.catalog,self.private,self.root/"pending.jsonl")
        self.assertEqual(res["catalogue_records"],2)
        self.assertEqual(res["catalogue_isbn_match_candidates"],1)
        self.assertEqual(res["catalogue_records_without_verified_matching_isbn"],1)
        items=[json.loads(x) for x in (self.root/"pending.jsonl").read_text().splitlines()]
        self.assertTrue(all(x["training_permission"] is False for x in items))
        with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
            coverage.coverage(self.catalog,self.private,self.root/"pending.jsonl")

    def test_real_neural_training_audit_counts_books_and_chunks_no_cuda_needed(self):
        report=full_lm.audit(self.private,20)
        self.assertEqual(report["approved_fulltext_books"],25)
        self.assertGreater(report["train_passages"],100)
        self.assertGreaterEqual(report["heldout_passages"],5)
        self.assertEqual(report["llm_optimizer_steps_completed"],0)
        self.assertFalse(report["model_weight_artifacts_created"])
        with self.assertRaisesRegex(ValueError,"NOT_ENOUGH_RIGHTS"):
            full_lm.audit(self.private,26)

    def test_bad_chunk_hash_blocks_training(self):
        with sqlite3.connect(self.private) as db:
            db.execute("UPDATE chunks SET body_sha256=? WHERE id='chunk_0_0'",("0"*64,))
        with self.assertRaisesRegex(ValueError,"PROVENANCE_HASH_INVALID"):
            full_lm.audit(self.private,20)

if __name__=="__main__":
    unittest.main()
