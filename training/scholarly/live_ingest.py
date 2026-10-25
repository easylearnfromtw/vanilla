#!/usr/bin/env python3
"""Actual, bounded arXiv LICENSED PDF -> extracted text -> SQLite corpus.

Not a simulation: --execute calls official arXiv OAI-PMH and downloads PDFs
only AFTER an explicit CC0/CC-BY licence is verified from that exact record.
No GPU training/large harvest is claimed; offline tests mock HTTPS.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

MAX_PDF_BYTES = 12_000_000
MAX_PAGES = 100
MAX_ARTICLE_CHARS = 800_000
MAX_PILOT_PAPERS = 20
IDENTIFIER = re.compile(r"^\d{4}\.\d{4,5}$")
OAI = "https://oaipmh.arxiv.org/oai"
CC0 = {"creativecommons.org/publicdomain/zero/1.0",
       "creativecommons.org/licenses/publicdomain",
       "creativecommons.org/publicdomain/zero/1.0/legalcode"}
CCBY = {"creativecommons.org/licenses/by/4.0",
        "creativecommons.org/licenses/by/3.0",
        "creativecommons.org/licenses/by/2.5"}

def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def normalized_license(value: str) -> tuple[str, str] | None:
    """Exact recognized open grants only; default arXiv licence is rejected."""
    try:
        url = urllib.parse.urlsplit(value.strip().rstrip("/"))
    except ValueError:
        return None
    if url.scheme not in ("http", "https") or url.hostname != "creativecommons.org":
        return None
    key = url.hostname + url.path.lower().rstrip("/")
    if key in CC0:
        return "cc0", "https://" + key + "/"
    if key in CCBY:
        return "cc-by", "https://" + key + "/"
    return None

def secure_fetch(url: str, cap: int = MAX_PDF_BYTES) -> bytes:
    allowed_hosts = {"oaipmh.arxiv.org", "arxiv.org", "api.openalex.org"}
    u = urllib.parse.urlsplit(url)
    if (u.scheme != "https" or u.hostname not in allowed_hosts or u.username
        or u.password or u.port not in (None, 443)):
        raise ValueError("UNAPPROVED_SOURCE_URL")
    headers = {"Accept": "application/xml,application/pdf,application/json",
               "User-Agent": "VanillaAtuberScholarlyPilot/1.0 (single-paper licensed pilot)"}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=35) as reply:
        final = urllib.parse.urlsplit(reply.geturl())
        if final.scheme != "https" or final.hostname not in allowed_hosts:
            raise ValueError("UNTRUSTED_SOURCE_REDIRECT")
        raw = reply.read(cap + 1)
    if len(raw) > cap:
        raise ValueError("SOURCE_EXCEEDS_BYTES_LIMIT")
    return raw

def parse_oai_getrecord(raw: bytes, expected_id: str) -> dict:
    if len(raw) > 2_000_000 or b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise ValueError("OAI_XML_UNSAFE_OR_TOO_LARGE")
    root = ET.fromstring(raw)
    if root.find(".//{*}error") is not None:
        raise ValueError("OAI_PROVIDER_REPORTED_ERROR")
    nodes = root.findall(".//{*}metadata/*")
    if len(nodes) != 1:
        raise ValueError("OAI_METADATA_RECORD_MISSING")
    meta = nodes[0]
    def child(name):
        return next((x.text.strip() for x in meta if x.tag.rsplit("}", 1)[-1] == name
                     and x.text and x.text.strip()), "")
    ident = child("id")
    if ident != expected_id:
        raise ValueError("OAI_IDENTIFIER_MISMATCH")
    license_url = child("license")
    license_info = normalized_license(license_url)
    if not license_info:
        raise ValueError("FULLTEXT_LICENSE_NOT_APPROVED")
    title = child("title")
    if not title or len(title) > 600:
        raise ValueError("OAI_TITLE_INVALID")
    return {"arxiv_id": ident, "title": " ".join(title.split()),
            "license": license_info[0], "license_reference": license_info[1],
            "source_url": "https://arxiv.org/abs/" + ident,
            "fulltext_source_url": "https://arxiv.org/pdf/" + ident}

def extract_pdf(raw: bytes) -> tuple[str, int]:
    if not raw.startswith(b"%PDF-") or len(raw) < 1000:
        raise ValueError("NOT_A_REAL_PDF")
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PYPDF_REQUIRED") from exc
    reader = PdfReader(io.BytesIO(raw), strict=False)
    if reader.is_encrypted or not 1 <= len(reader.pages) <= MAX_PAGES:
        raise ValueError("PDF_ENCRYPTED_OR_PAGE_LIMIT")
    text = []
    count = 0
    for page in reader.pages:
        t = page.extract_text(extraction_mode="plain") or ""
        count += len(t)
        if count > MAX_ARTICLE_CHARS:
            raise ValueError("PDF_TEXT_TOO_LARGE")
        text.append(t)
    body = "\n\n".join(text).replace("\x00", "").strip()
    if len(body) < 1200:
        raise ValueError("PDF_NO_SUBSTANTIVE_EXTRACTABLE_TEXT")
    return body, len(reader.pages)

def chunks(body: str, size: int = 1850, overlap: int = 110):
    position = 0
    while position < len(body):
        unit = body[position:position + size].strip()
        if len(unit) >= 220:
            yield unit
        position += size - overlap

def create_db(path: Path) -> sqlite3.Connection:
    if path.exists():
        raise ValueError("REFUSE_OVERWRITE_APPROVED_CORPUS")
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.executescript("""
    PRAGMA foreign_keys=ON;
    CREATE TABLE books (
      id TEXT PRIMARY KEY,title TEXT NOT NULL,rights_basis TEXT NOT NULL,
      rights_reference TEXT NOT NULL,reviewer TEXT NOT NULL,content_sha256 TEXT NOT NULL,
      source_url TEXT NOT NULL,fulltext_source_url TEXT NOT NULL,license TEXT NOT NULL,
      citation_weight INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE chunks (
      id TEXT PRIMARY KEY,book_id TEXT NOT NULL,body TEXT NOT NULL,
      body_sha256 TEXT NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id));
    CREATE INDEX chunks_book_id ON chunks(book_id);
    """)
    return db

def ingest_one(db: sqlite3.Connection, item: dict, body: str) -> int:
    paper_id = item["arxiv_id"]
    text_sha = sha(body)
    rows = [(f"arxiv-{paper_id}-{index:05d}", paper_id, content, sha(content))
            for index, content in enumerate(chunks(body))]
    if len(rows) < 2:
        raise ValueError("ARTICLE_INSUFFICIENT_EXTRACTED_CHUNKS")
    with db:
        db.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?,?)",
           ("arxiv-"+paper_id, item["title"], "compatible-license",
            item["license_reference"], "official-arxiv-OAI-PMH-license-record",
            text_sha, item["source_url"], item["fulltext_source_url"], item["license"], 1))
        # Chunk foreign keys reference the full book id, not raw arXiv id.
        rows = [(cid, "arxiv-"+paper_id, text, digest) for cid, _, text, digest in rows]
        db.executemany("INSERT INTO chunks VALUES(?,?,?,?)", rows)
    return len(rows)

def select_ids(input_ids: list[str], ids_file: Path | None) -> list[str]:
    values = list(input_ids)
    if ids_file:
        values += [x.strip() for x in ids_file.read_text(encoding="utf-8").splitlines() if x.strip()]
    dedup = list(dict.fromkeys(values))
    if not dedup or len(dedup) > MAX_PILOT_PAPERS or any(not IDENTIFIER.fullmatch(x) for x in dedup):
        raise ValueError("PILOT_REQUIRES_1_TO_20_MODERN_ARXIV_IDS")
    return dedup

def execute(ids: list[str], output: Path, *, include_openalex: bool, min_delay: float,
            fetcher=secure_fetch) -> dict:
    target = output.with_suffix(".sqlite3")
    report_path = output.with_suffix(".report.json")
    if target.exists() or report_path.exists():
        raise ValueError("REFUSE_OVERWRITE_PILOT_OUTPUTS")
    db = create_db(target)
    details = []
    last_call: float | None = None
    def request(url: str, cap: int = MAX_PDF_BYTES) -> bytes:
        nonlocal last_call
        if last_call is not None:
            time.sleep(max(0., min_delay-(time.monotonic()-last_call)))
        try:
            return fetcher(url, cap)
        finally:
            last_call = time.monotonic()
    metadata_count = 0
    openalex_error = None
    if include_openalex:
        params = {"search": "machine learning", "per_page": 10,
                  "select": "id,doi,title,publication_year,open_access"}
        key = os.environ.get("OPENALEX_API_KEY", "").strip()
        if key: params["api_key"] = key
        url = "https://api.openalex.org/works?" + urllib.parse.urlencode(params)
        try:
            data = json.loads(request(url, 2_000_000))
            if not isinstance(data.get("results"), list):
                raise ValueError("OPENALEX_BAD_API_RESPONSE")
            metadata_count = len(data["results"])
        except Exception as exc:
            openalex_error = type(exc).__name__ + (": " + str(exc)[:90] if not key else "")
    try:
        for paper_id in ids:
            params = {"verb": "GetRecord", "metadataPrefix": "arXiv",
                      "identifier": "oai:arXiv.org:" + paper_id}
            try:
                record = parse_oai_getrecord(request(OAI+"?"+urllib.parse.urlencode(params),2_000_000),paper_id)
                pdf = request(record["fulltext_source_url"])
                body, pages = extract_pdf(pdf)
                passages = ingest_one(db, record, body)
                details.append({"arxiv_id":paper_id,"state":"licensed-fulltext-indexed",
                    "title":record["title"],"license":record["license"],
                    "license_reference":record["license_reference"],
                    "page_count":pages,"text_chars":len(body),"passages":passages,
                    "sha256":sha(body),"source_url":record["source_url"],"citation_weight":1})
            except (urllib.error.HTTPError, urllib.error.URLError, OSError, ValueError, RuntimeError) as exc:
                code = str(getattr(exc, "code", "") or type(exc).__name__)
                details.append({"arxiv_id":paper_id,"state":"not-indexed","reason":code[:70],
                                "fulltext_stored":False})
                # Fail closed: license rejection does not authorize a PDF request.
    finally:
        db.close()
    accepted = [x for x in details if x["state"]=="licensed-fulltext-indexed"]
    result={"status":"real-licensed-corpus-pilot-not-llm-trained",
            "generated_utc":datetime.now(timezone.utc).isoformat(),
            "arxiv_papers_attempted":len(ids),"arxiv_licensed_fulltexts_indexed":len(accepted),
            "arxiv_fulltext_passages":sum(x["passages"] for x in accepted),
            "openalex_metadata_records":metadata_count,"openalex_api_error":openalex_error,
            "papers":details,"gpu_available_checked":False,"llm_optimizer_steps":0,
            "model_checkpoint_created":False,
            "gpu_readiness":"requires separate approved CUDA runner and held-out corpus"}
    report_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return result

def main(argv=None):
    p=argparse.ArgumentParser(description="Bounded real CC BY/CC0 arXiv paper-to-Atuber-corpus pilot")
    p.add_argument("--arxiv-id",action="append",default=[])
    p.add_argument("--ids-file",type=Path)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--with-openalex",action="store_true")
    p.add_argument("--min-delay",type=float,default=3.1)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    ids=select_ids(a.arxiv_id,a.ids_file)
    if not 3.0 <= a.min_delay <= 60.0:
        p.error("require >=3 seconds between official arXiv requests")
    if not a.execute:
        print(json.dumps({"status":"dry-run","papers_planned":ids,"network_calls":0,
                          "fulltexts_indexed":0,"llm_optimizer_steps":0}))
        return 0
    result=execute(ids,a.output,include_openalex=a.with_openalex,min_delay=a.min_delay)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    # An API outage or refused licence is not a successfully indexed full text.
    return 0 if result["arxiv_licensed_fulltexts_indexed"]>=1 else 2

if __name__=="__main__":
    sys.exit(main())
