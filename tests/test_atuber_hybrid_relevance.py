"""No-network proofs: all raw catalogue rows, rights-only full text,
fuzzy synonyms, cover provenance, one-million-step ranker bounded capability."""
from __future__ import annotations
import csv
import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/"training/atuber-books"
sys.path.insert(0,str(ROOT))
import hybrid_library as h
import fuzzy_relevance_train as t

class HybridLibraryTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.csv=self.root/"nbinet.csv"
        with self.csv.open("w",encoding="utf-8-sig",newline="") as fp:
            writer=csv.DictWriter(fp,fieldnames=["書名 (245$a$b)","編著者 (245$c)","ISBN (020$a$c)","出版年 (008/07-10)"])
            writer.writeheader()
            for i in range(140):
                title= "股票投資策略第"+str(i)+"冊" if i%2 else "經濟政策與市場第"+str(i)+"冊"
                writer.writerow({"書名 (245$a$b)":title,
                        "編著者 (245$c)":"甲作者" if i%2 else "乙作者",
                        "ISBN (020$a$c)":"978"+str(1234000000+i),
                        "出版年 (008/07-10)":"2026"})
        self.content=self.root/"content.sqlite3"
        with sqlite3.connect(self.content) as con:
            con.execute("""CREATE TABLE books
                 (id TEXT,title TEXT,author TEXT,source_url TEXT,rights_basis TEXT)""")
            con.execute("""CREATE TABLE chunks
                 (id TEXT,book_id TEXT,position INTEGER,body TEXT,body_sha256 TEXT)""")
            for ident,title,author,body in [
                ("smith","Wealth of Nations","Adam Smith",
                 "The division of labour enhances productivity, specialization and exchange. "),
                ("philosophy","A Philosophical Treatise","Author B",
                 "Political philosophy examines virtue, ethics, and moral decisions. ")
            ]:
                con.execute("INSERT INTO books VALUES(?,?,?,?,?)",
                            (ident,title,author,"https://www.gutenberg.org/ebooks/3300",
                             "compatible-license"))
                import hashlib
                for j in range(12):
                    paragraph=(body*10)+" SECTION "+str(j)
                    con.execute("INSERT INTO chunks VALUES(?,?,?,?,?)",
                        (f"{ident}-chunk-{j}",ident,j*800,paragraph,
                         hashlib.sha256(paragraph.encode()).hexdigest()))
        self.db=self.root/"hybrid.sqlite3"
        self.report=h.create_index([], [self.content],self.db,[self.csv])

    def test_all_supplied_books_are_indexed_with_separate_rights(self):
        self.assertEqual(self.report["catalogue_only_records"],140)
        self.assertEqual(self.report["rights_cleared_fulltext_books"],2)
        self.assertEqual(self.report["fulltext_passages"],24)
        self.assertFalse(self.report["all_catalogue_books_have_fulltext"])
        self.assertEqual(self.report["covers_downloaded"],0)
        with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
            h.create_index([], [self.content],self.db,[self.csv])

    def test_book_images_and_grounded_citations(self):
        result=h.search(self.db,"股票投資策略第1冊",5)
        self.assertGreater(len(result["items"]),0)
        item=result["items"][0]
        self.assertEqual(item["availability"],"metadata-only")
        self.assertEqual(item["citation_scope"],"catalogue-dataset-reference")
        self.assertTrue(item["cover"]["image_url"].startswith("https://covers.openlibrary.org/b/isbn/"))
        self.assertIn("atuber-bookrefs-v1",h.markdown_cards(result))
        self.assertEqual(h.cover_reference("../../xyz"),None)
        self.assertEqual(h.cover_reference("foo"),None)

    def test_lexical_fulltext_synonyms_and_no_false_content(self):
        division=h.search(self.db,"division of labor",5)
        self.assertTrue(any(x["evidence"] and "division" in x["evidence"]["excerpt"].lower()
                            for x in division["items"]))
        self.assertTrue(any(x["citation_scope"]=="original-text-passage" for x in division["items"]))
        self.assertTrue(all(x["availability"]=="metadata-only" for x in
                            h.search(self.db,"股票投資策略第7冊")["items"]))
        missing=h.search(self.db,"zzzxqjnonexistentgibberish")
        self.assertEqual(missing["items"],[])

    def test_ranker_actual_weight_updates_and_unseen_book_holdout(self):
        output=self.root/"ranker"
        report=t.fit(self.db,output,steps=300)
        self.assertEqual(report["optimizer_steps_completed"],300)
        self.assertEqual(report["scalar_parameter_updates"],2100)
        self.assertGreater(report["holdout_pairs"],0)
        self.assertEqual(report["qwen_october_llm_weight_updates"],0)
        results=h.search(self.db,"經濟政策",limit=3,ranker_file=output/"ranker.json")
        self.assertTrue(results["items"])
        with self.assertRaisesRegex(ValueError,"RANKER_STEP_CAP"):
            t.fit(self.db,self.root/"excess",steps=1000001)

if __name__=="__main__":
    unittest.main()
