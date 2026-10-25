"""100-work batch provenance validation; mocked data here, live CI is separate."""
import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"training"/"scholarly"))
from evidence_batch import build_records, parse_work

class Evidence100Tests(unittest.TestCase):
 def paper(self,n):
  return {"id":f"https://openalex.org/W{123456+n}", "title":f"Research Article {n}",
    "doi":f"https://doi.org/10.1234/ex{n}","type":"article",
    "publication_year":2026,"referenced_works_count":10,
    "primary_location":{"source":{"display_name":"Research Journal"}},
    "authorships":[{"author":{"id":"https://openalex.org/A10001","display_name":"Researcher One",
        "orcid":"https://orcid.org/0000-0000-0000-000X"}}]}
 def test_100_unique_article_ids(self):
  rows=build_records({"results":[self.paper(n) for n in range(100)]})
  self.assertEqual(len(rows),100)
  self.assertEqual(len({x["id"] for x in rows}),100)
  self.assertEqual(rows[0]["rating"]["max_score"],100)
  self.assertEqual(rows[0]["rating"]["verification"],"metadata-only")
  self.assertTrue(all(x["fulltext_read"] is False and x["llm_weight_updates"]==0 for x in rows))
 def test_100_required_not_99(self):
  with self.assertRaises(ValueError):
   build_records({"results":[self.paper(n) for n in range(99)]})
 def test_retractions_are_zero_and_not_recommended(self):
  x=self.paper(1);x["is_retracted"]=True
  r=parse_work(x)
  self.assertEqual(r["rating"]["level"],"R")
  self.assertEqual(r["rating"]["score"],0)
 def test_naming_does_not_claim_qs_ranking(self):
  r=parse_work(self.paper(12))
  self.assertEqual(r["citation_weight"],1)
  self.assertEqual(r["citation_weight_basis"],"rankings-not-supplied")
if __name__=="__main__":unittest.main()
