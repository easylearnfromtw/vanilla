"""No network / no copyrighted corpus: audited bulk full-text processing tests."""
import hashlib
import importlib.util
import json
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

BASE=Path(__file__).resolve().parents[1]/"training/atuber-books"
sys.path.insert(0,str(BASE))
import bulk_fulltext_ingest as batch


def sha(data):
    return hashlib.sha256(data).hexdigest()


class BulkFulltexts(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dir=Path(self.temp.name)
        self.books=self.dir/"books"
        self.books.mkdir()
        self.manifest=self.dir/"approved.jsonl"
        self.db=self.dir/"full.sqlite3"
        self.body=("通貨膨脹是整體物價持續增加。財務與經濟書籍應分別列出資訊來源及限制。\n")*8
    def record(self,i,filename,raw,approved=True):
        return {
            "id":f"owned_book_{i:06d}",
            "title":f"自寫經濟教材第{i}冊",
            "author":"測試著作者",
            "source_url":"https://example.org/author-original",
            "content_file":filename,"content_sha256":sha(raw),
            "rights_basis":"owned",
            "rights_reference":"test author created original content and granted training use",
            "reviewer":"Test rights reviewer",
            "rights_reviewed":True,"training_permission":approved,
            "isbn":str(i),
        }
    def save(self,items):
        self.manifest.write_text("".join(json.dumps(x,ensure_ascii=False)+"\n" for x in items),encoding="utf-8")

    def test_large_manifest_over_old_1000_book_limit(self):
        data=self.body.encode("utf-8")
        (self.books/"shared.txt").write_bytes(data)
        # Different IDs in the fixture represent distinct owner-approved editions.
        rows=[self.record(i,"shared.txt",data) for i in range(1003)]
        self.save(rows)
        res=batch.import_all(self.books,self.manifest,self.db,20000)
        self.assertEqual(res["approved_fulltext_books_total"],1003)
        self.assertTrue(res["all_manifest_books_indexed"])
        with sqlite3.connect(self.db) as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM books").fetchone()[0],1003)
            self.assertGreater(c.execute("SELECT COUNT(*) FROM chunks").fetchone()[0],1003)
        again=batch.import_all(self.books,self.manifest,self.db,20000,True)
        self.assertEqual(again["books_skipped_existing"],1003)
        self.assertEqual(again["books_imported_this_run"],0)

    def test_reject_unlicensed_missing_hash_and_resume_when_fixed(self):
        data=self.body.encode("utf-8")
        (self.books/"one.txt").write_bytes(data)
        good=self.record(1,"one.txt",data)
        denied=self.record(2,"one.txt",data,False)
        wrong=self.record(3,"one.txt",data)
        wrong["content_sha256"]="0"*64
        self.save([good,denied,wrong])
        result=batch.import_all(self.books,self.manifest,self.db)
        self.assertEqual(result["approved_fulltext_books_total"],1)
        self.assertEqual(result["outstanding_manifest_errors"],2)
        self.assertEqual(result["books_failed_this_run"],2)
        with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
            batch.import_all(self.books,self.manifest,self.db)
        self.save([good,self.record(2,"one.txt",data),self.record(3,"one.txt",data)])
        updated=batch.import_all(self.books,self.manifest,self.db,resume=True)
        self.assertEqual(updated["approved_fulltext_books_total"],3)
        self.assertEqual(updated["outstanding_manifest_errors"],0)
        self.assertTrue(updated["all_manifest_books_indexed"])

    def test_epub_spine_text_extraction(self):
        epub=self.books/"written.epub"
        with zipfile.ZipFile(epub,"w") as zipout:
            zipout.writestr("META-INF/container.xml",
                '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>')
            zipout.writestr("OEBPS/book.opf",
                '<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest>'
                '<spine><itemref idref="b"/><itemref idref="a"/></spine></package>')
            zipout.writestr("OEBPS/a.xhtml","<html><body><p>FIRST SECTION "+"finance "*30+"</p></body></html>")
            zipout.writestr("OEBPS/b.xhtml","<html><body><h1>SECOND SECTION</h1><p>"+"economic theory "*25+"</p></body></html>")
        text=batch.read_book(epub)
        self.assertLess(text.index("SECOND SECTION"),text.index("FIRST SECTION"))
        item=self.record(1,"written.epub",epub.read_bytes())
        self.save([item])
        result=batch.import_all(self.books,self.manifest,self.db)
        self.assertEqual(result["approved_fulltext_books_total"],1)
        self.assertEqual(result["books_failed_this_run"],0)

    def test_pdf_requires_extractable_text_or_reports_reason(self):
        content=b"%PDF-1.4 sample does not contain an extractable text layer " * 5
        (self.books/"sample.pdf").write_bytes(content)
        self.save([self.record(9,"sample.pdf",content)])
        result=batch.import_all(self.books,self.manifest,self.db)
        self.assertEqual(result["approved_fulltext_books_total"],0)
        self.assertEqual(result["outstanding_manifest_errors"],1)
        self.assertEqual(result["llm_optimizer_steps"],0)

    def test_dry_run_never_scans_files_or_updates_weights(self):
        self.assertEqual(batch.main(["--root",str(self.books),"--manifest-jsonl",str(self.manifest),
                      "--index",str(self.db)]),0)
        self.assertFalse(self.db.exists())


if __name__=="__main__":
    unittest.main()
