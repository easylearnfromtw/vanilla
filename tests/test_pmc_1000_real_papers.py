"""No fake paper training: scholarly article body, CC grants, OAI/XML and SHA."""
import hashlib
import io
import json
import sqlite3
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"training/scholarly"))
import pmc_1000_fulltexts as pmc
import pmc_fulltext_ranker as ranker

TITLE="Longitudinal Analysis of Responsible Decisions in Clinical Care"
PARA="Evidence collected from repeated observations of clinical decisions shows important associations and potential confounding variables that require careful review."

def fake_article(license_url,pmcid="PMC12001234",with_body=True):
 paragraphs="".join("<p>"+PARA+" "+str(j)+"</p>" for j in range(100))
 return (f'<article xmlns:xlink="http://www.w3.org/1999/xlink"><front><article-meta>'
  f'<article-id pub-id-type="pmc">{pmcid}</article-id>'
  f'<article-id pub-id-type="doi">10.5555/sample.{pmcid}</article-id>'
  f'<title-group><article-title>{TITLE}</article-title></title-group>'
  f'<contrib-group><contrib contrib-type="author"><name><surname>Researcher</surname>'
  f'<given-names>Example</given-names></name></contrib></contrib-group>'
  f'<pub-date><year>2025</year></pub-date>'
  f'<permissions><license xlink:href="{license_url}"><license-p>Open license</license-p>'
  f'</license></permissions></article-meta></front>'
  +(f'<body><sec><title>Methods and Results</title>{paragraphs}</sec></body>' if with_body else '')
  +"</article>")

def fake_batch(*articles):
 records="".join(f'<record><header><identifier>oai:pubmedcentral.nih.gov:12001234</identifier></header>'
                  f'<metadata>{part}</metadata></record>' for part in articles)
 return (f'<?xml version="1.0"?><OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">'
         f'<ListRecords>{records}<resumptionToken>next-token</resumptionToken></ListRecords>'
         f'</OAI-PMH>').encode()

class PaperCorpusTests(unittest.TestCase):
 def test_cc_by_and_cc0_exact_license_only(self):
  for license_url in ("https://creativecommons.org/licenses/by/4.0/",
                      "http://creativecommons.org/licenses/by/4.0/",
                      "https://creativecommons.org/publicdomain/zero/1.0/"):
   xml=ET.fromstring(fake_article(license_url))
   result=pmc.paper_data(xml)
   self.assertIsNotNone(result)
   self.assertGreater(result["body_characters"],4800)
   self.assertGreater(result["body_paragraphs"],50)
   self.assertEqual(result["authors"],["Example Researcher"])
   self.assertEqual(result["doi"],"10.5555/sample.PMC12001234")
   self.assertEqual(result["source_url"],"https://pmc.ncbi.nlm.nih.gov/articles/PMC12001234/")
  for denied in ("https://creativecommons.org/licenses/by-nc/4.0/",
                 "https://creativecommons.org/licenses/by-nd/4.0/",
                 "https://creativecommons.org/licenses/by-sa/4.0/",
                 "https://creativecommons.org/licenses/by/4.0/fake",
                 "https://example.com/cc-by/4.0/"):
   self.assertIsNone(pmc.paper_data(ET.fromstring(fake_article(denied))))

 def test_reject_abstract_and_unsafe_xml(self):
  snippet=ET.fromstring(fake_article("https://creativecommons.org/licenses/by/4.0/",with_body=False))
  self.assertIsNone(pmc.paper_data(snippet))
  with self.assertRaisesRegex(ValueError,"DTD"):
   pmc.parse_batch(b'<!DOCTYPE foo><foo/>')
  with self.assertRaisesRegex(ValueError,"UNEXPECTED"):
   pmc.parse_batch(b'<hello/>')

 def test_oai_parse_body_sources_and_search(self):
  articles=[fake_article("https://creativecommons.org/licenses/by/4.0/")]
  data,resume,total=pmc.parse_batch(fake_batch(*articles))
  self.assertEqual(total,1)
  self.assertEqual(resume,"next-token")
  self.assertEqual(len(data),1)
  with tempfile.TemporaryDirectory() as d:
   target=Path(d)/"body.sqlite3"
   db=pmc.create_db(target)
   count=pmc.save_article(db,data[0])
   self.assertGreaterEqual(count,4)
   self.assertEqual(pmc.save_article(db,data[0]),0)
   stored=db.execute("SELECT text,text_sha256 FROM chunks LIMIT 1").fetchone()
   self.assertEqual(hashlib.sha256(stored[0].encode()).hexdigest(),stored[1])
   db.close()
   found=pmc.search(target,"clinical evidence decisions")
   self.assertGreater(len(found),0)
   self.assertEqual(found[0]["license"],"cc-by-4.0")
   self.assertEqual(found[0]["brand"],"霞海書院")
   with self.assertRaisesRegex(ValueError,"1000"):
    ranker.dataset(target)

 def test_gradient_features_use_actual_paragraphs(self):
  query="clinical decisions repeated observations"
  positive=ranker.vec(query,PARA)
  negative=ranker.vec(query,"An unrelated discussion of geology and stellar navigation.")
  self.assertGreater(positive[1],negative[1])
  self.assertEqual(len(positive),7)
  self.assertEqual(pmc.TARGET,1000)

if __name__=="__main__":unittest.main()
