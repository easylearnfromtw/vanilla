"""Exact 100 real-source metadata -> actual model weights; no copyrighted bodies."""
import importlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
B=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(B/"training/atuber-books"))
import liuan_metadata_ranker_input as source
import fuzzy_relevance_train as train

class ActualTrainingMetadata(unittest.TestCase):
    def test_verified_historical_100_sources_and_no_fulltext_training(self):
        ts=B/"src/knowledge/liuan-historical-100.ts"
        rows,digest=source.read_records(ts)
        self.assertEqual(len(rows),100)
        self.assertEqual(len({r[0] for r in rows}),100)
        self.assertEqual(len(digest),64)
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/"facts.sqlite"
            result=source.create_index(ts,db)
            self.assertEqual(result["book_metadata_count"],100)
            self.assertEqual(result["real_book_fulltext_read"],0)
            self.assertEqual(result["neural_language_model_updates"],0)
            with sqlite3.connect(db) as conn:
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM books").fetchone()[0],100)
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM books WHERE source_scope='verified-historical-source'").fetchone()[0],100)
                self.assertNotIn("chunks",{
                  x[0] for x in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")})
            groups,count=train.dataset(db)
            self.assertEqual(count,100)
            self.assertTrue(all(len(v)>=30 for v in groups.values()))
            report=train.fit(db,Path(tmp)/"real-weights",steps=151)
            self.assertEqual(report["optimizer_steps_completed"],151)
            self.assertEqual(report["scalar_parameter_updates"],1057)
            self.assertEqual(report["full_book_llm_gradient_steps"],0)
            self.assertEqual(report["qwen_october_llm_weight_updates"],0)
            weights=json.loads((Path(tmp)/"real-weights/ranker.json").read_text())["weights"]
            self.assertEqual(len(weights),7)
            self.assertTrue(any(abs(v)>0.01 for v in weights))
            with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
                source.create_index(ts,db)
    def test_source_parser_refuses_99_fake_or_duplicate_books(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"books.ts"
            p.write_text("export const LIUAN_VERIFIED_HISTORICAL_BOOKS = [[\"123\",\"Real Title\",\"Real, Author\"]] as const;")
            with self.assertRaisesRegex(ValueError,"EXACTLY_100"):
                source.read_records(p)

if __name__=="__main__":unittest.main()
