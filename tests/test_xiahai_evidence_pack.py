"""The 1000-evidence pack cannot be synthesized from metadata or invented quotes.

Unit corpus fixtures are synthetic and used ONLY to exercise the exporter.
Production workflow additionally audits ALL 1000 real PMC paper bodies/artifacts.
"""
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"training/scholarly"))
from publish_xiahai_evidence import export,verify,sha

def fixture(path:Path,count=1000):
 conn=sqlite3.connect(path)
 conn.executescript("""CREATE TABLE papers(id TEXT PRIMARY KEY,title TEXT,authors_json TEXT,
    year INTEGER,doi TEXT,source_url TEXT,license TEXT,license_url TEXT,
    text_hash TEXT,body_characters INTEGER);
    CREATE TABLE chunks(id TEXT PRIMARY KEY,paper_id TEXT,position INTEGER,
    text TEXT,text_sha256 TEXT);
 """)
 with conn:
  for i in range(count):
   ident=f"PMC{12000000+i}"
   title=f"Artificial Test Fixture Research Paper {i}"
   source=f"https://pmc.ncbi.nlm.nih.gov/articles/{ident}/"
   conn.execute("INSERT INTO papers VALUES(?,?,?,?,?,?,?,?,?,?)",
     (ident,title,json.dumps(["Research Test Author"]),2025,f"10.5555/test.{i}",source,
      "cc-by-4.0","https://creativecommons.org/licenses/by/4.0/","a"*64,17000))
   for j in range(11):
    body=(f"Example independent evidence about trial recruitment, comparator, uncertainty and observed trends {i} {j}. ")*4
    cid="paper_"+hashlib.sha256(f"{ident}:{j*120}".encode()).hexdigest()[:26]
    conn.execute("INSERT INTO chunks VALUES(?,?,?,?,?)",(cid,ident,j*120,body,sha(body)))
 conn.close()

class EvidencePack(unittest.TestCase):
 def test_real_text_source_identity_and_exact_quote_backing(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   source=root/"test-fixture.sqlite3"
   target=root/"output"
   fixture(source)
   report=export(source,target)
   self.assertEqual(report["real_papers"],1000)
   self.assertEqual(report["shard_count"],10)
   audit=verify(source,target)
   self.assertEqual(audit["verified_real_papers"],1000)
   self.assertEqual(audit["verified_quote_count"],3000)
   manifest=json.loads((target/"manifest.json").read_text())
   self.assertEqual(manifest["paper_count"],1000)
   self.assertEqual(manifest["real_fulltext_chunks_checked"],11000)
   self.assertLessEqual(manifest["total_public_excerpt_characters"],780000)
   self.assertEqual(len(list(target.glob("shard-*.json"))),10)
   with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
    export(source,target)
   sample=target/"shard-00.json"
   record=json.loads(sample.read_text())
   record["papers"][0]["evidence"][0]["excerpt"]="fabricated evidence"
   sample.write_text(json.dumps(record))
   with self.assertRaisesRegex(ValueError,"EXCERPT_NOT_EXACT"):
    verify(source,target)
 def test_refuse_999_articles_and_missing_rights(self):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp)
   source=root/"too-few.sqlite3"
   fixture(source,999)
   with self.assertRaisesRegex(ValueError,"EXACTLY_1000"):
    export(source,root/"out")

if __name__=="__main__":unittest.main()
