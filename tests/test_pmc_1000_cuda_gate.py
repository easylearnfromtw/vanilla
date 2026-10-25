"""1000 paper QLoRA must refuse nonexistent, mismatched or self-declared corpora."""
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"training/scholarly"))
import pmc_prepare_cuda as cuda

def fixture(path,num=1000):
 conn=sqlite3.connect(path)
 conn.executescript("""
  CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,authors_json TEXT,source_url TEXT,
    license TEXT,license_url TEXT,text_hash TEXT);
  CREATE TABLE chunks(id TEXT PRIMARY KEY,paper_id TEXT,position INTEGER,
    text TEXT,text_sha256 TEXT);
 """)
 with conn:
  for i in range(num):
   ident=f"PMC{12000000+i}"
   p=f"Real published text fixture {i}"
   sha=hashlib.sha256(p.encode()).hexdigest()
   conn.execute("INSERT INTO papers VALUES(?,?,?,?,?,?,?)",(
      ident,"Historical Article "+str(i),json.dumps(["Research Author"]),
      "https://pmc.ncbi.nlm.nih.gov/articles/"+ident+"/",
      "cc-by-4.0","https://creativecommons.org/licenses/by/4.0/",sha))
   for k in range(5):
    segment=p+f" body passage {k}"
    conn.execute("INSERT INTO chunks VALUES(?,?,?,?,?)",(f"{ident}_{k}",ident,k,segment,hashlib.sha256(segment.encode()).hexdigest()))
 conn.close()

class ReviewedFulltextGpu(unittest.TestCase):
 def claim(self,source,**mod):
  obj={"reviewer":"Human Scholarly Reviewer",
       "reviewed_at":"2026-10-25",
       "source_database_sha256":cuda.digest_file(source),
       "approved_papers":1000,
       "rights_basis":"compatible-license",
       "rights_reference":"Article-specific CC BY/CC0 license and required source attribution examined",
       "edition_and_attribution_reviewed":True,
       "training_allowed_for_this_exact_corpus":True}
  obj.update(mod)
  return obj
 def test_requires_full_1000_rights_and_real_passages(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   source=root/"original.sqlite3"
   manifest=root/"review.json"
   out=root/"approved.sqlite3"
   fixture(source,num=1000)
   no=cuda.digest_file(source)
   data=self.claim(source)
   manifest.write_text(json.dumps(data))
   value=cuda.build(source,manifest,out)
   self.assertEqual(value["articles"],1000)
   self.assertEqual(value["source_body_chunks"],5000)
   self.assertEqual(value["qwen_optimizer_steps_completed"],0)
   with sqlite3.connect(out) as conn:
    self.assertEqual(conn.execute("SELECT COUNT(*) FROM books").fetchone()[0],1000)
    self.assertEqual(conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0],5000)
    self.assertEqual(conn.execute("SELECT COUNT(*) FROM books WHERE rights_basis='compatible-license'").fetchone()[0],1000)
   with self.assertRaisesRegex(ValueError,"DO_NOT_OVERWRITE"):
    cuda.build(source,manifest,out)
 def test_mismatched_file_sha_and_fake_unreviewed_claim_are_denied(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   source=root/"f.sqlite3"
   source.write_bytes(b"not a licensed data index")
   manifest=root/"review.json"
   claim=self.claim(source,source_database_sha256="0"*64)
   manifest.write_text(json.dumps(claim))
   with self.assertRaisesRegex(ValueError,"CORPUS_SHA256"):
    cuda.build(source,manifest,root/"output.sqlite3")
   manifest.write_text(json.dumps(self.claim(source,reviewer="automated check")))
   with self.assertRaisesRegex(ValueError,"HUMAN_REVIEWER"):
    cuda.build(source,manifest,root/"output.sqlite3")
   manifest.write_text(json.dumps(self.claim(source,training_allowed_for_this_exact_corpus=False)))
   with self.assertRaisesRegex(ValueError,"TRAINING_NOT_APPROVED"):
    cuda.build(source,manifest,root/"output.sqlite3")

if __name__=="__main__":unittest.main()
