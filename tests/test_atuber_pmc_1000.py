"""Offline scale validation: 1000 synthetic JATS fixtures; NOT real-paper claims."""
from __future__ import annotations
import tempfile
import unittest
import sys
from pathlib import Path
from xml.etree import ElementTree
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"scholarly"))
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from pmc_licensed_100 import collect,parse_article_record,create_db,store
from multi_paper_cpu_lora import audit,bucket

def article_xml(i:int,license:str="https://creativecommons.org/licenses/by/4.0/")->str:
    paragraph=("Independently sourced and approved scientific sample article text, "
               "for unit test purposes only. Methods, outcomes and reproducibility. ")*30
    return (
        f'<record xmlns:xlink="http://www.w3.org/1999/xlink">'
        f'<header><identifier>oai:pubmedcentral.nih.gov:{i}</identifier></header>'
        f'<metadata><article><front><article-meta>'
        f'<article-id pub-id-type="pmcid">PMC{i}</article-id>'
        f'<title-group><article-title>Authorized fixture article {i}</article-title></title-group>'
        f'<permissions><license xlink:href="{license}"/></permissions>'
        f'</article-meta></front><body><sec><p>{paragraph}</p></sec></body>'
        f'</article></metadata></record>'
    )

class Licensed1000TrainingTests(unittest.TestCase):
 def test_1000_unique_document_licences_and_holdouts(self):
  with tempfile.TemporaryDirectory() as folder:
   db_path=Path(folder)/"example.sqlite3"
   db=create_db(db_path)
   try:
    for n in range(20000,21000):
     item,why=parse_article_record(ElementTree.fromstring(article_xml(n)))
     self.assertIsNone(why)
     store(db,item)
   finally:db.close()
   train,test,report=audit(db_path,1000)
   self.assertEqual(report["audited_licensed_papers"],1000)
   self.assertEqual(len(train)+len(test),1000)
   self.assertGreaterEqual(len(test),2)
   self.assertFalse(set(train)&set(test))
   self.assertEqual(report["whole_paper_holdout"],True)
   self.assertEqual(report["citation_weight_influenced_training"],False)
 def test_collect_really_needs_all_1000(self):
  with tempfile.TemporaryDirectory() as folder:
   count=0
   def mock_oai(url):
    nonlocal count
    count+=1
    records="".join(article_xml(n) for n in range(30000+(count-1)*100,
                                                   30100+(count-1)*100))
    more=(f"<resumptionToken>page-{count}</resumptionToken>" if count<10 else "")
    return ("<OAI-PMH><ListRecords>"+records+more+"</ListRecords></OAI-PMH>").encode()
   report=collect(1000,Path(folder)/"1000",
                  "2026-09-01",10,.5,mock_oai)
   self.assertEqual(report["licensed_fulltexts_indexed"],1000)
   self.assertEqual(report["distinct_pmcids"],1000)
   self.assertEqual(report["stop_reason"],"target-reached")
   self.assertEqual(report["oai_pages_retrieved"],10)
   self.assertEqual(report["weights_updated"],0)
 def test_fail_closed_even_at_1000_scale(self):
  item,reason=parse_article_record(ElementTree.fromstring(
    article_xml(123456,"https://creativecommons.org/licenses/by-nc/4.0/")))
  self.assertIsNone(item)
  self.assertEqual(reason,"not-explicit-cc0-or-cc-by")
 def test_bounds_hold(self):
  with tempfile.TemporaryDirectory() as folder:
   with self.assertRaisesRegex(ValueError,"TARGET_MUST_BE"):
    collect(1001,Path(folder)/"bad","2026-09-01",1,.5,lambda u:b"")
if __name__=="__main__": unittest.main()
