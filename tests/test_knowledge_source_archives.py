"""No-network tests: citation weights, OpenAlex mapping, true rights-reviewed QA."""
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
SOURCE=Path(__file__).resolve().parents[1]/"training/atuber-books"
sys.path.insert(0,str(SOURCE))
import xiahai_papers as papers
import consumer_knowledge as knowledge

class SourcePolicies(unittest.TestCase):
    def test_paper_metadata_never_automatically_becomes_training_approval(self):
        obj={"id":"https://openalex.org/W123456","display_name":"Financial decision evidence study",
             "publication_year":2024,"doi":"https://doi.org/10.5555/sample",
             "authorships":[{"author":{"display_name":"A Scholar"},
                             "institutions":[{"display_name":"Example University"}]}],
             "abstract_inverted_index":{"risk":[0]},
             "open_access":{"is_oa":True},
             "primary_location":{"source":{"display_name":"Journal of Examples"}}}
        result=papers.validate_research_record(obj)
        self.assertEqual(result["citation_weight"],1)
        self.assertFalse(result["training_approved"])
        self.assertEqual(result["institution_rank"],None)
        self.assertTrue(result["has_abstract_metadata"])
        self.assertEqual(papers.priority(100),5)
        self.assertEqual(papers.priority(300),4)
        self.assertEqual(papers.priority(500),3)
        self.assertEqual(papers.priority(700),2)
        self.assertEqual(papers.priority(701),1)
        self.assertEqual(papers.priority(None),1)
        self.assertEqual(papers.priority(1000,True),5)

    def test_paper_index_and_branded_source_without_fake_full_text(self):
        with tempfile.TemporaryDirectory() as d:
            index=Path(d)/"papers.sqlite"
            source={
              "id":"W124","title":"Consumer decision study","authors":["Author"],
              "institution_names":["University"],"year":2025,"doi_url":"https://doi.org/10.3/example",
              "source_url":"https://doi.org/10.3/example","publication_source":"Journal",
              "evidence_scope":"bibliographic-metadata-only","citation_weight":1,"training_approved":False,
            }
            report=papers.build_index([source],index)
            self.assertEqual(report["papers"],1)
            self.assertEqual(report["rights_approved_fulltext"],0)
            found=papers.search(index,"Consumer")
            self.assertEqual(len(found),1)
            self.assertFalse(found[0]["fulltext_approved"])
            cards=papers.markdown_cards(found)
            self.assertIn("xiahai-paperrefs-v1",cards)
            self.assertIn("霞海書院",json.dumps(found,ensure_ascii=False))
            with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
                papers.build_index([source],index)

    def example(self,i):
        return {"id":f"find_{i:05d}","source_type":"book","source_id":"owned_book",
         "source_title":"Owner authored economics primer",
         "source_url":"https://example.org/approved-book",
         "authors":["Owner Author"],"evidence_level":"reviewed-fulltext",
         "rights_basis":"owned","rights_reference":"Documented owner authored original learning content",
         "reviewer":"Evidence reviewer","rights_reviewed":True,
         "training_approved":True,"evidence_verified":True,
         "question":f"How should I assess the economic tradeoff number {i}?",
         "knowledge_claim":"Choices have opportunity costs.",
         "limits":"Consumer context and risk tolerance can differ.",
         "consumer_answer":"Compare costs, benefits and alternatives instead of treating one option as guaranteed.",
         "evidence_hash":hashlib.sha256(f"owned source {i}".encode()).hexdigest()}

    def test_refuse_unapproved_and_too_few_genuine_findings(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"approved.jsonl"
            dest=Path(d)/"output.jsonl"
            sample=self.example(1);sample["training_approved"]=False
            p.write_text(json.dumps(sample)+"\n")
            with self.assertRaisesRegex(ValueError,"NO_HUMAN_VERIFIED"):
                knowledge.produce(p,dest)
            p.write_text(json.dumps(self.example(1))+"\n")
            r=knowledge.produce(p,dest)
            self.assertEqual(r["state"],"not-ready-for-training")
            self.assertFalse(dest.exists())

    def test_100_reviewer_approved_fixtures_export_without_neural_claim(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"reviewed.jsonl"
            dest=Path(d)/"sft.jsonl"
            p.write_text("".join(json.dumps(self.example(i),ensure_ascii=False)+"\n" for i in range(110)))
            with self.assertRaisesRegex(ValueError,"PRIVATE_RIGHTS_CLEARED_EVIDENCE"):
                knowledge.produce(p,dest)
            evidence=Path(d)/"rights_reviewed_fixture.sqlite3"
            with sqlite3.connect(evidence) as c:
                c.execute("CREATE TABLE books(id TEXT PRIMARY KEY,source_url TEXT)")
                c.execute("CREATE TABLE chunks(book_id TEXT,body TEXT,body_sha256 TEXT)")
                c.execute("INSERT INTO books VALUES(?,?)",("owned_book","https://example.org/approved-book"))
                for i in range(110):
                    body=f"owned source {i}"
                    c.execute("INSERT INTO chunks VALUES(?,?,?)",
                        ("owned_book",body,hashlib.sha256(body.encode()).hexdigest()))
            report=knowledge.produce(p,dest,evidence_index=evidence)
            self.assertEqual(report["items"],110)
            self.assertEqual(report["language_model_updates"],0)
            rows=[json.loads(line) for line in dest.read_text().splitlines()]
            self.assertEqual(len(rows),110)
            self.assertTrue(all("柳岸書城" in row["assistant"] for row in rows))
            self.assertTrue(all("https://example.org/approved-book" in row["assistant"] for row in rows))
            with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
                knowledge.produce(p,dest,evidence_index=evidence)

if __name__=="__main__":
    unittest.main()
