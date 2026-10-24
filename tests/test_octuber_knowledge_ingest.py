"""No-network tests for Hermes pinned skills and Firecrawl real API ingestion."""
from __future__ import annotations
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training" / "octuber-knowledge"))
from ingest import (CATALOG, checked_https_url, firecrawl_scrape, firecrawl_search,
                    hermes_skill, make_evidence, save_records, sha, main as ingest_main)
from review import review


class TestHermesFirecrawlResearch(unittest.TestCase):
    def test_all_official_skill_paths_pinned_no_reconstructed_url(self):
        state=json.loads(CATALOG.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(state["skills"]), 200)
        self.assertEqual(len({s["id"] for s in state["skills"]}),len(state["skills"]))
        self.assertRegex(state["revision"],r"^[a-f0-9]{40}$")
        self.assertTrue(all(s["path"].startswith(("skills/","optional-skills/")) and
                            s["path"].endswith("/SKILL.md") and ".." not in s["path"] for s in state["skills"]))
        self.assertTrue(all(state["revision"] in s["github"] for s in state["skills"]))
        self.assertEqual(len([s for s in state["skills"] if not s["optional"]]),58)

    def test_host_permission_and_ssrf_validation(self):
        good="https://docs.firecrawl.dev/features/scrape"
        self.assertEqual(checked_https_url(good,["docs.firecrawl.dev"]),good)
        for url in ("http://docs.firecrawl.dev", "https://localhost/test",
                    "https://127.0.0.1", "https://169.254.169.254/",
                    "https://docs.firecrawl.dev.evil.org/x",
                    "https://user:pass@docs.firecrawl.dev",
                    "https://docs.firecrawl.dev:444/x",
                    "https://internal.local/page", "file:///etc/passwd"):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    checked_https_url(url,["docs.firecrawl.dev"])

    def test_provider_request_is_real_v2_scrape_not_fake_completion(self):
        seen=[]
        def fake_api(endpoint,*,bearer,payload):
            seen.append((endpoint,bearer,payload))
            return {"success":True,"data":{
                "markdown":"# Real extracted text\n"+("Actual independent verified source content. "*4),
                "metadata":{"title":"Article","sourceURL":"https://docs.firecrawl.dev/a"}}}
        with patch("ingest.fetch_json",side_effect=fake_api):
            doc=firecrawl_scrape("https://docs.firecrawl.dev/a",["docs.firecrawl.dev"],"fc-TESTKEY")
        self.assertEqual(doc["provider"],"firecrawl")
        self.assertEqual(seen[0][0],"https://api.firecrawl.dev/v2/scrape")
        self.assertEqual(seen[0][2]["formats"],["markdown"])
        self.assertEqual(seen[0][1],"fc-TESTKEY")
        self.assertFalse(doc["training_approved"])
        self.assertFalse(doc["reviewed"])
        self.assertEqual(sha(doc["content"]),doc["content_sha256"])
        self.assertNotIn("fc-TESTKEY",json.dumps(doc))

    def test_search_only_allows_approved_hosts_and_labels_snippet(self):
        def mock_api(*_args,**_kwargs):
            return {"success":True,"data":{"web":[
                {"url":"https://approved.example/page","title":"Good","description":"Meaningful search snippet about the requested topic with details."},
                {"url":"https://other.example/page","title":"Blocked","description":"Should not leak into evidence outputs whatsoever, never."}]}}
        with patch("ingest.fetch_json",side_effect=mock_api):
            rows=firecrawl_search("What was discovered",["approved.example"],"fc-token",2)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["provider"],"firecrawl-search")
        self.assertIn("snippets",rows[0]["origin_license_note"])

    def test_hermes_skill_fetch_only_pinned_path_and_does_not_execute(self):
        state=json.loads(CATALOG.read_text(encoding="utf-8"))
        chosen=state["skills"][0]
        text="---\nname: safe-skill\n---\n# SKILL.md\n"+"Only inert instructional evidence. "*6
        captured=[]
        def stub(request,timeout):
            captured.append(request.full_url)
            return io.BytesIO(text.encode("utf-8"))
        with patch("ingest.urllib.request.urlopen",side_effect=stub):
            item=hermes_skill(chosen["id"])
        self.assertEqual(len(captured),1)
        self.assertEqual(captured[0],"https://raw.githubusercontent.com/NousResearch/hermes-agent/"+state["revision"]+"/"+chosen["path"])
        self.assertEqual(item["title"],chosen["name"])
        self.assertFalse(item["training_approved"])

    def test_dry_run_never_calls_firecrawl_or_needs_api_key(self):
        with tempfile.TemporaryDirectory() as td:
            outfile=Path(td)/"evidence.jsonl"
            args=["script","--source","firecrawl-scrape","--url",
                  "https://docs.firecrawl.dev/features","--allow-domain","docs.firecrawl.dev",
                  "--output",str(outfile)]
            with patch.object(sys,"argv",args),patch.dict(os.environ,{},clear=True),patch("ingest.fetch_json") as f:
                self.assertEqual(ingest_main(),0)
                f.assert_not_called()
            self.assertFalse(outfile.exists())

    def test_human_rights_and_hash_review_needed_for_training(self):
        evidence=make_evidence(provider="firecrawl",source_url="https://permitted.example/a",
                               title="Test",content="External third party facts. "*10,
                               license_note="rights not yet reviewed")
        approval={
            "evidence_id": evidence["id"],"content_sha256":evidence["content_sha256"],
            "question":"你可以如何判斷某個來源是否真的得到驗證？",
            "answer":"必須核對原始出處及其相關證據，尚未查證的內容不能聲稱已確定。",
            "domain":"research","source":"authored","rights_basis":"permission",
            "rights_reference":"written human license approval 2026-10-25",
            "reviewer":"Authorized reviewer","reviewed":True,
            "consent":True,"training_approved":True,
        }
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); e=root/"e.jsonl"; a=root/"approvals.jsonl"; out=root/"final.jsonl"
            e.write_text(json.dumps(evidence,ensure_ascii=False)+"\n",encoding="utf-8")
            a.write_text(json.dumps(approval,ensure_ascii=False)+"\n",encoding="utf-8")
            report=review(e,a,out)
            self.assertEqual(report["rows"],1)
            row=json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(row["reviewed"],True)
            self.assertEqual(row["consent"],True)
            self.assertNotIn("content",row)
            self.assertEqual(len(json.loads(out.with_suffix(".provenance.json").read_text())["attestations"]),1)
            with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
                review(e,a,out)
            out.unlink();out.with_suffix(".provenance.json").unlink()
            approval["rights_basis"]="unknown"
            a.write_text(json.dumps(approval,ensure_ascii=False)+"\n",encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"RIGHTS_REQUIRED"):
                review(e,a,out)
            approval["rights_basis"]="permission"
            approval["content_sha256"]="f"*64
            a.write_text(json.dumps(approval,ensure_ascii=False)+"\n",encoding="utf-8")
            with self.assertRaisesRegex(ValueError,"EVIDENCE_HASH_MISMATCH"):
                review(e,a,out)


if __name__=="__main__":
    unittest.main()
