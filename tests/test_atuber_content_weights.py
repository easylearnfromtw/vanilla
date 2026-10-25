"""No-network verified toy content classifier optimizer tests."""
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
base=ROOT/"training/atuber-books"
import sys
sys.path.insert(0,str(base))
spec=importlib.util.spec_from_file_location("content_weight_sandbox",base/"content_weight_sandbox.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class ContentWeights(unittest.TestCase):
    def test_actual_changes_with_authorized_full_text_and_no_llm_false_claim(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            db=root/"private.sqlite3"
            with sqlite3.connect(db) as conn:
                conn.execute("CREATE TABLE books (id TEXT,title TEXT,rights_basis TEXT,rights_reference TEXT,reviewer TEXT)")
                conn.execute("CREATE TABLE chunks (id TEXT,book_id TEXT,body TEXT)")
                sources=[
                    ("economics","經濟學的生產與勞動分工能夠提升效率，經濟發展涉及市場交易和資本累積。"),
                    ("philosophy","哲學研究倫理與道德選擇，思辨人類的存在意義與政治判斷。"),
                ]
                for ident,text in sources:
                    conn.execute("INSERT INTO books VALUES(?,?,?,?,?)",
                        (ident,ident,"compatible-license","owner authored test source with documented rights","Test owner"))
                    for i in range(30):
                        conn.execute("INSERT INTO chunks VALUES(?,?,?)",
                                     (f"{ident}-{i:03}",ident,text+f"段落編號{i}。"))
            result=mod.fit(db,root/"sgd",steps=400)
            self.assertEqual(result["optimizer_steps_completed"],400)
            self.assertGreater(result["scalar_parameter_updates"],400)
            self.assertEqual(result["llm_optimizer_steps"],0)
            self.assertEqual(result["books_training_source_count"],2)
            self.assertTrue((root/"sgd/content_weights.json").is_file())
            self.assertGreater(result["distinct_holdout_chunks"],0)
            with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
                mod.fit(db,root/"sgd",steps=2)
            with self.assertRaisesRegex(ValueError,"CAP"):
                mod.fit(db,root/"new",steps=1000001)

if __name__=="__main__":
    unittest.main()
