"""CPU LoRA preparation tests: real index shapes, rights safeguards and hashes."""
from __future__ import annotations
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
sys.path.insert(0,str(ROOT/"training"/"scholarly"))
from cpu_lora_pilot import audit_corpus,split_passages,train

class CpuLoraValidation(unittest.TestCase):
 def corpus(self,root:Path,license="cc0",count=12):
  path=root/"approved.sqlite3"
  with sqlite3.connect(path) as db:
   db.executescript("""
   CREATE TABLE books (id TEXT PRIMARY KEY,rights_basis TEXT,rights_reference TEXT,
    reviewer TEXT,content_sha256 TEXT,source_url TEXT,fulltext_source_url TEXT,license TEXT);
   CREATE TABLE chunks (id TEXT PRIMARY KEY,book_id TEXT,body TEXT,body_sha256 TEXT);
   """)
   db.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?)",(
    "arxiv-1410.6579","compatible-license",
    "https://creativecommons.org/publicdomain/zero/1.0/",
    "official-arxiv-OAI-PMH-license-record",
    "f"*64,"https://arxiv.org/abs/1410.6579",
    "https://arxiv.org/pdf/1410.6579",license))
   for n in range(count):
    body=f"Verified text fragment {n}: "+("science experiment metadata and journal evidence. "*8)
    db.execute("INSERT INTO chunks VALUES(?,?,?,?)",(
     f"arxiv-1410.6579-{n:05d}","arxiv-1410.6579",body,
     hashlib.sha256(body.encode()).hexdigest()))
  return path
 def test_provenance_audit_and_train_split(self):
  with tempfile.TemporaryDirectory() as tmp:
   passages,info=audit_corpus(self.corpus(Path(tmp)))
   self.assertEqual(len(passages),12)
   self.assertEqual(info["license"],"cc0")
   trainset,testset=split_passages(passages)
   self.assertEqual(len(trainset)+len(testset),12)
   self.assertFalse(set(trainset).intersection(testset))
 def test_unlicensed_paper_rejected_without_model_download(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=self.corpus(Path(tmp),license="arxiv-default")
   with self.assertRaisesRegex(ValueError,"LICENSE_OR_ORIGIN"):
    audit_corpus(p)
 def test_tampered_passage_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=self.corpus(Path(tmp))
   with sqlite3.connect(p) as db:
    db.execute("UPDATE chunks SET body='tamper' WHERE id LIKE '%00000'")
   with self.assertRaisesRegex(ValueError,"HASH_INVALID"):
    audit_corpus(p)
 def test_preexisting_adapter_or_excessive_resource_budget_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);p=self.corpus(root)
   with self.assertRaisesRegex(ValueError,"CPU_RESOURCE_BUDGET_EXCEEDED"):
    train(p,root/"output",500000,64)
   (root/"output").mkdir()
   with self.assertRaisesRegex(ValueError,"NEVER_OVERWRITE"):
    train(p,root/"output",2,64)

if __name__=="__main__":
 unittest.main()
