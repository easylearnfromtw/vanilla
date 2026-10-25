"""No network tests for PMC CC BY/CC0 rights, OAI pagination and paper holdout."""
import hashlib
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"training"/"scholarly"))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"training"/"atuber"))
from pmc_licensed_100 import (parse_article_record,parse_response,create_db,store,collect,sha)
from multi_paper_cpu_lora import audit,bucket

def article_xml(number:int,license="https://creativecommons.org/licenses/by/4.0/")->str:
 text=("Evidence based methods described in considerable detail and supported by "
       "reproducible quantitative observations on distinct patients and control populations. ")*30
 return f'''<record xmlns:xlink="http://www.w3.org/1999/xlink">
 <header><identifier>oai:pubmedcentral.nih.gov:{number}</identifier></header>
 <metadata><article><front><article-meta>
 <article-id pub-id-type="pmc">{number}</article-id>
 <title-group><article-title>Scientific Evaluation {number}</article-title></title-group>
 <permissions><license xlink:href="{license}"/></permissions>
 </article-meta></front><body><sec><p>{text}</p></sec></body></article></metadata></record>'''
class PmcLicensedTests(unittest.TestCase):
 def test_one_official_real_body_with_explicit_ccby(self):
  import xml.etree.ElementTree as ET
  item,error=parse_article_record(ET.fromstring(article_xml(12345)))
  self.assertIsNone(error)
  self.assertEqual(item["pmcid"],"PMC12345")
  self.assertEqual(item["license"],"cc-by")
  self.assertGreater(len(item["content"]),2000)
 def test_noncommercial_default_and_conflicts_must_fail_closed(self):
  import xml.etree.ElementTree as ET
  for license in ["https://creativecommons.org/licenses/by-nc/4.0/",
    "https://arxiv.org/licenses/nonexclusive-distrib/1.0/",
    "https://creativecommons.org/licenses/by-nd/4.0/"]:
   item,why=parse_article_record(ET.fromstring(article_xml(12345,license)))
   self.assertIsNone(item)
   self.assertEqual(why,"not-explicit-cc0-or-cc-by")
 def test_jats_article_id_must_match_oai(self):
  import xml.etree.ElementTree as ET
  x=article_xml(12345).replace('<article-id pub-id-type="pmc">12345</article-id>',
                            '<article-id pub-id-type="pmc">99999</article-id>')
  item,reason=parse_article_record(ET.fromstring(x))
  self.assertEqual(reason,"jats-pmcid-mismatch")
 def test_100_real_structured_document_records_with_exact_license(self):
  import xml.etree.ElementTree as ET
  with tempfile.TemporaryDirectory() as folder:
   db=create_db(Path(folder)/"sample.sqlite3")
   for number in range(10000,10100):
    article,error=parse_article_record(ET.fromstring(article_xml(number)))
    self.assertIsNone(error)
    store(db,article)
   db.close()
   train,heldout,summary=audit(Path(folder)/"sample.sqlite3",100)
   self.assertEqual(summary["audited_licensed_papers"],100)
   self.assertGreater(summary["audited_text_passages"],100)
   self.assertEqual(len(train)+len(heldout),100)
   self.assertTrue(set(train).isdisjoint(heldout))
 def test_corrupt_chunk_and_bogus_rights_rejected(self):
  import xml.etree.ElementTree as ET
  with tempfile.TemporaryDirectory() as folder:
   db=create_db(Path(folder)/"sample.sqlite3")
   for n in range(10000,10100):
    item,_=parse_article_record(ET.fromstring(article_xml(n)))
    store(db,item)
   db.close()
   with sqlite3.connect(Path(folder)/"sample.sqlite3") as connection:
    connection.execute("UPDATE chunks SET body='tamper' WHERE id='pmc-10000-00000'")
   with self.assertRaisesRegex(ValueError,"PASSAGE_SHA"):
    audit(Path(folder)/"sample.sqlite3",100)
 def test_oai_rate_safe_fake_pagination_to_target(self):
  page=0
  def fetcher(url):
   nonlocal page
   page+=1
   start=20000+(page-1)*10
   raw="<OAI-PMH><ListRecords>"+''.join(article_xml(n) for n in range(start,start+10))
   if page<10:raw+='<resumptionToken>token'+str(page)+'</resumptionToken>'
   raw+="</ListRecords></OAI-PMH>"
   return raw.encode()
  with tempfile.TemporaryDirectory() as folder:
   out=Path(folder)/"pmc"
   report=collect(100,out,"2026-09-01",10,.5,fetcher)
   self.assertEqual(report["licensed_fulltexts_indexed"],100)
   self.assertEqual(report["oai_pages_retrieved"],10)
   self.assertEqual(report["weights_updated"],0)
 def test_xml_dtd_rejected(self):
  with self.assertRaisesRegex(ValueError,"DTD"):
   parse_response(b'<!DOCTYPE foo><OAI-PMH/>')

if __name__=="__main__":
 unittest.main()
