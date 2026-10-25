"""Rights, multi-doc train/holdout and real OAI metadata tests; never fake metrics."""
from __future__ import annotations
import hashlib
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"scholarly"))
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from harvest_licensed_batch import extract_candidates, harvest
from multidoc_cpu_lora import audited_books, split_documents, plan

XML='''<?xml version="1.0"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
<ListRecords>
<record><header><identifier>oai:arXiv.org:2601.00001</identifier></header>
 <metadata><arXiv xmlns="http://arxiv.org/OAI/arXiv/">
 <id>2601.00001</id><title>Genuine test article, license verified</title>
 <license>https://creativecommons.org/licenses/by/4.0/</license>
 </arXiv></metadata></record>
<record><metadata><arXiv xmlns="http://arxiv.org/OAI/arXiv/">
 <id>2601.00002</id><title>Restricted non-commercial title</title>
 <license>https://creativecommons.org/licenses/by-nc/4.0/</license>
 </arXiv></metadata></record>
<record><metadata><arXiv xmlns="http://arxiv.org/OAI/arXiv/">
 <id>2601.00003</id><title>Nonexclusive distribution title</title>
 <license>https://arxiv.org/licenses/nonexclusive-distrib/1.0/</license>
 </arXiv></metadata></record>
<resumptionToken>page-2</resumptionToken>
</ListRecords></OAI-PMH>'''.encode()

def create_corpus(path:Path,documents=4,wrong=False):
 with sqlite3.connect(path) as db:
  db.executescript("""
   CREATE TABLE books(id TEXT PRIMARY KEY,title TEXT,rights_basis TEXT,rights_reference TEXT,
    reviewer TEXT,content_sha256 TEXT,source_url TEXT,fulltext_source_url TEXT,license TEXT,
    citation_weight INTEGER);
   CREATE TABLE chunks(id TEXT PRIMARY KEY,book_id TEXT,body TEXT,body_sha256 TEXT);
  """)
  for doc in range(documents):
   ident=f"arxiv-2601.{doc:05d}"
   db.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?,?)",(
    ident,"Real Example Research Article","compatible-license",
    "https://creativecommons.org/licenses/by/4.0/",
    "official-arxiv-OAI-PMH-license-record","a"*64,
    f"https://arxiv.org/abs/2601.{doc:05d}",
    f"https://arxiv.org/pdf/2601.{doc:05d}",
    "cc-by" if not(wrong and doc==0) else "non-commercial",1))
   for i in range(6):
    raw=f"Legally licensed independent article {doc}, passage {i}: "+("research data and methodology. "*16)
    db.execute("INSERT INTO chunks VALUES(?,?,?,?)",(
     f"{ident}-{i:04d}",ident,raw,hashlib.sha256(raw.encode()).hexdigest()))
 return path

class LicensedMultiDocTests(unittest.TestCase):
 def test_oai_multipart_harvest_extracts_only_rights_allowlisted(self):
  rows,token=extract_candidates(XML)
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]["license"],"cc-by")
  self.assertEqual(token,"page-2")
  with self.assertRaises(ValueError):
   extract_candidates(b'<!DOCTYPE invalid>'+XML)
 def test_harvest_does_not_count_arxiv_default_license(self):
  requested=[]
  def fake(url,max_bytes):
   requested.append(url)
   return XML
  rows,report=harvest("2026-10-12","2026-10-20",10,1,3.1,fake)
  self.assertEqual(len(rows),1)
  self.assertEqual(report["oai_pages_retrieved"],1)
 def test_document_holdout_never_mixes_passages_from_same_paper(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=create_corpus(Path(tmp)/"papers.sqlite3",documents=5)
   paper_texts,info=audited_books(p)
   train,test=split_documents(paper_texts)
   self.assertTrue(train)
   self.assertTrue(test)
   self.assertFalse(set(train).intersection(test))
   result=plan(p,3)
   self.assertEqual(result["audited_papers"],5)
   self.assertEqual(result["llm_optimizer_steps"],0)
   self.assertTrue(result["heldout_is_entire_unseen_document"])
 def test_fails_closed_for_license_and_tampered_passages(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=create_corpus(Path(tmp)/"invalid.sqlite3",documents=3,wrong=True)
   with self.assertRaisesRegex(ValueError,"UNVERIFIED_PAPER_RIGHTS"):
    audited_books(p)
  with tempfile.TemporaryDirectory() as tmp:
   p=create_corpus(Path(tmp)/"modified.sqlite3",documents=3)
   with sqlite3.connect(p) as db:db.execute("UPDATE chunks SET body='tampered' WHERE id LIKE '%-0000'")
   with self.assertRaisesRegex(ValueError,"HASH_MISMATCH"):
    audited_books(p)
 def test_rejects_single_paper_and_too_few_papers(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=create_corpus(Path(tmp)/"one.sqlite3",documents=1)
   with self.assertRaisesRegex(ValueError,"INSUFFICIENT_REAL_AUTHORIZED"):
    audited_books(p)
if __name__=="__main__":unittest.main()
