"""Offline arXiv official-license ingestion tests; never make external calls."""
from __future__ import annotations
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"training"/"scholarly"))
from live_ingest import (parse_oai_getrecord,normalized_license,create_db,ingest_one,
                         execute,sha,select_ids,MAX_PILOT_PAPERS)

def oai_xml(license_url="https://creativecommons.org/publicdomain/zero/1.0/",
            paper_id="1410.6579"):
    return (f'<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">'
            f'<GetRecord><record><metadata>'
            f'<arXiv xmlns="http://arxiv.org/OAI/arXiv/">'
            f'<id>{paper_id}</id><title>Official example test title</title>'
            f'<license>{license_url}</license></arXiv>'
            f'</metadata></record></GetRecord></OAI-PMH>').encode()

class ArxivRightsIngestTests(unittest.TestCase):
    def test_accept_only_explicit_free_licenses(self):
        self.assertEqual(normalized_license("http://creativecommons.org/licenses/by/4.0/")[0],"cc-by")
        self.assertEqual(normalized_license("https://creativecommons.org/publicdomain/zero/1.0/")[0],"cc0")
        for url in ["https://arxiv.org/licenses/nonexclusive-distrib/1.0/",
                    "https://creativecommons.org/licenses/by-nc/4.0/",
                    "https://creativecommons.org/licenses/by-nd/4.0/",
                    "https://creativecommons.org/licenses/by-sa/4.0/",
                    "https://evil.com/licenses/by/4.0/"]:
            self.assertIsNone(normalized_license(url),url)
    def test_exact_source_and_identity_protection(self):
        row=parse_oai_getrecord(oai_xml(),"1410.6579")
        self.assertEqual(row["arxiv_id"],"1410.6579")
        self.assertEqual(row["license"],"cc0")
        self.assertEqual(row["fulltext_source_url"],"https://arxiv.org/pdf/1410.6579")
        with self.assertRaises(ValueError):
            parse_oai_getrecord(oai_xml(),"1410.99999")
        with self.assertRaises(ValueError):
            parse_oai_getrecord(b'<!DOCTYPE test [<!ENTITY x "abc">]>'+oai_xml(),"1410.6579")
    def test_sqlite_fulltext_provenance_and_low_priority_retention(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"approved.sqlite3"
            db=create_db(path)
            text=("This is legitimately licensed article text with facts and methods. "*80).strip()
            info=parse_oai_getrecord(oai_xml(),"1410.6579")
            rows=ingest_one(db,info,text)
            self.assertGreater(rows,2)
            book=db.execute("SELECT citation_weight,rights_reference,content_sha256 FROM books").fetchone()
            self.assertEqual(book[0],1)
            self.assertIn("creativecommons.org",book[1])
            self.assertEqual(book[2],sha(text))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM chunks").fetchone()[0],rows)
            db.close()
    def test_real_execution_path_can_be_exercised_only_with_mocks(self):
        pdf=b"%PDF-1.4"+b"generated" * 500
        requests=[]
        def fake(url,cap):
            requests.append(url)
            return oai_xml() if "oaipmh.arxiv.org" in url else pdf
        with tempfile.TemporaryDirectory() as tmp,patch("live_ingest.extract_pdf",
                return_value=("Approved article text: "+"investigation data and methods "*180,6)):
            report=execute(["1410.6579"],Path(tmp)/"pilot",include_openalex=False,min_delay=3.0,fetcher=fake)
            self.assertEqual(report["arxiv_licensed_fulltexts_indexed"],1)
            self.assertEqual(report["llm_optimizer_steps"],0)
            self.assertEqual(len(requests),2)
            self.assertTrue(Path(tmp,"pilot.sqlite3").exists())
    def test_unlicensed_article_never_fetches_pdf(self):
        calls=[]
        def fake(url,cap):
            calls.append(url)
            return oai_xml("https://arxiv.org/licenses/nonexclusive-distrib/1.0/")
        with tempfile.TemporaryDirectory() as tmp:
            report=execute(["1410.6579"],Path(tmp)/"pilot",include_openalex=False,min_delay=3.0,fetcher=fake)
            self.assertEqual(report["arxiv_licensed_fulltexts_indexed"],0)
            self.assertEqual(len(calls),1)
            self.assertEqual(report["papers"][0]["state"],"not-indexed")
    def test_pilot_id_limits(self):
        self.assertEqual(select_ids(["1410.6579","1410.6579"],None),["1410.6579"])
        with self.assertRaises(ValueError):
            select_ids([f"2601.{i:05d}" for i in range(MAX_PILOT_PAPERS+1)],None)
if __name__=="__main__":unittest.main()
