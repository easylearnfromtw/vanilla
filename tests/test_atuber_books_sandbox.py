"""No-network regression tests for Atuber library sandbox."""
import csv
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"training"/"atuber-books"
def load(name):
    spec=importlib.util.spec_from_file_location(name,BASE/(name+".py"))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

sandbox=load("catalog_sandbox")
ask=load("ask_atuber")

class LibrarySandboxTest(unittest.TestCase):
    def fixture(self,root):
        p=root/"books.csv"
        with p.open("w",encoding="utf-8-sig",newline="") as f:
            writer=csv.DictWriter(f,fieldnames=["書名 (245$a$d)","編著者 (245$c)","ISBN","出版年 (008/07-10)","語文"])
            writer.writeheader()
            items=[
                ("總體經濟學","王甲","9781234567890","chi"),
                ("總體經濟學","王甲","9781234567890","chi"),
                ("金融市場與銀行","王乙","9781234567891","chi"),
                ("股票投資策略","王丙","9781234567892","chi"),
                ("心理學導論","王丁","9781234567893","chi"),
                ("哲學的問題","王戊","9781234567894","chi"),
                ("Chinese Historical Fiction Overview","Writer A","9781234567895","eng"),
                ("花園裡的風景","Writer B","9781234567896","chi"),
                ("日本旅行日記","Writer C","9781234567897","jpn"),
            ]
            writer.writerows({"書名 (245$a$d)":t,"編著者 (245$c)":a,"ISBN":i,
                              "出版年 (008/07-10)":"2025","語文":l}
                             for t,a,i,l in items)
        return p

    def test_dry_run_does_not_create_output(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); csvfile=self.fixture(root);out=root/"output"
            self.assertEqual(sandbox.main(["--csv",str(csvfile),"--output",str(out)]),0)
            self.assertFalse(out.exists())

    def test_110k_target_can_be_scaled_without_fake_books(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);csvfile=self.fixture(root);out=root/"catalog"
            report=sandbox.create_sandbox([csvfile],out,"nbinet",5,2)
            self.assertEqual(report["actual"]["indexed_unique"],7)
            self.assertTrue(report["targets_reached"])
            self.assertEqual(report["book_full_texts_read"],0)
            self.assertEqual(report["weight_updates"],0)
            self.assertEqual(report["training_approved_count"],0)
            self.assertEqual(report["actual"]["language_extension_counts"],{"zh":1,"en":1})
            with sqlite3.connect(out/"catalog.sqlite3") as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM books WHERE training_approved<>0").fetchone()[0],0)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM books WHERE access_level<>'metadata-only'").fetchone()[0],0)
            books=ask.catalog_lookup(out/"catalog.sqlite3","股票")
            self.assertEqual(len(books),1)
            self.assertEqual(books[0]["title"],"股票投資策略")
            self.assertEqual(ask.catalog_lookup(out/"catalog.sqlite3","%"),[])
            self.assertTrue((out/"metadata_holdout.jsonl").exists())
            with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
                sandbox.create_sandbox([csvfile],out,"nbinet",5,2)

    def test_language_and_endpoint_safety(self):
        self.assertEqual(sandbox.detect_language("jpn","日本旅行日記")[0],"unknown")
        self.assertEqual(sandbox.detect_language("eng","中文標題")[0],"en")
        self.assertEqual(sandbox.classify("普通小說",""),())
        self.assertEqual(ask.ollama_url("http://127.0.0.1:11434"),
                         "http://127.0.0.1:11434/api/chat")
        with self.assertRaises(ValueError):
            ask.ollama_url("http://example.org:11434")
        with self.assertRaises(ValueError):
            ask.ollama_url("https://example.org/?token=secret")
        with self.assertRaises(ValueError):
            ask.ask_ollama("x",[],"unapproved","http://127.0.0.1:11434")

if __name__=="__main__":
    unittest.main()
