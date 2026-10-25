"""No network: 100 real-source screening, source traceability and non-training gate."""
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"training/atuber-books"))
import liuan_100_real_books as lib


class OneHundredBookCorpus(unittest.TestCase):
    def example(self,i,author="Dickens, Charles"):
        # Fixture is artificial: never uploaded or treated as 100 true historical books.
        body=("Book %04d actual-content fixture text with normal English sentences about "
              "economic tradeoffs and historical decisions. "%i)*430
        return {"id":10000+i,"title":"Economics and Society, volume "+str(i),
                "author":author,"language":"en","text":body}
    def test_screening_enforces_author_and_rights_candidate(self):
        book=lib.book_row(self.example(3))
        self.assertIsNotNone(book)
        self.assertEqual(book["author_death_year"],1870)
        self.assertFalse(book["training_permission"])
        self.assertEqual(book["rights_status"],"jurisdiction-and-edition-review-required")
        for author in ["Unknown, Person","Various","Wells, Unknown"]:
            self.assertIsNone(lib.book_row(self.example(7,author)))
        self.assertIsNone(lib.book_row({**self.example(8),"text":"too short"}))
        self.assertIsNone(lib.book_row({**self.example(8),"language":"zh"}))
        self.assertIsNone(lib.book_row({**self.example(8),"title":"A Modern Translation"}))
        self.assertIsNone(lib.book_row({**self.example(9),"title":"Index of the Project Gutenberg Works of Adam Smith"}))

    def test_100_unique_real_length_rows_become_100_hash_verified_index_books(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)
            authors=[f"{first.title() if first!='l' else 'L.'}, {surname.title()}" for (surname,first),year in lib.AUTHOR.items() if year<=1950]
            # Build author fixture from actual whitelist keys; titles/text distinct.
            authors=[surname.title()+", "+first.title() for (surname,first),year in lib.AUTHOR.items() if year<=1950]
            self.assertGreaterEqual(len(authors),25)
            dataset=[self.example(i,authors[i%len(authors)]) for i in range(150)]
            filtered=[x for x in dataset if lib.book_row(x)]
            result=lib.stable_select(filtered)
            self.assertEqual(len(result),100)
            db=path/"books.sqlite3"
            catalog=path/"books.json"
            report=path/"report.json"
            measured=lib.index_real_books(result,db,catalog,report,[{"shard":"offline-fixture"}],0)
            self.assertEqual(measured["real_books_indexed"],100)
            self.assertGreater(measured["actual_fulltext_chunks"],1000)
            self.assertEqual(measured["fully_rights_approved_for_neural_training"],0)
            self.assertEqual(measured["qwen_optimizer_steps"],0)
            assert all("body" not in entry for entry in json.loads(catalog.read_text()))
            with sqlite3.connect(db) as conn:
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM books").fetchone()[0],100)
                self.assertGreater(conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0],1000)
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM books WHERE rights_basis='rights-review-required'").fetchone()[0],100)
                row=conn.execute("SELECT body,body_sha256 FROM chunks LIMIT 1").fetchone()
                self.assertEqual(hashlib.sha256(row[0].encode()).hexdigest(),row[1])
                self.assertTrue(conn.execute("SELECT chunk_id FROM content_fts WHERE content_fts MATCH 'economic' LIMIT 1").fetchone())
            with self.assertRaisesRegex(ValueError,"NO_OVERWRITE"):
                lib.index_real_books(result,db,catalog,report,[],0)

if __name__=="__main__":
    unittest.main()
