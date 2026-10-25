#!/usr/bin/env python3
"""Private, resumable *actual full text* importer for up to 25,000 approved books.

Never infer permission from a library listing, ISBN, OCR, public URL, or file
ownership alone. Inputs are owner-supplied local TXT/EPUB/PDF + a signed-off
rights manifest (JSONL). No network requests or repository uploads.
The DB schema is compatible with hybrid_library.py and licensed_content.py.
RAG indexing is NOT Qwen/October parameter training.
"""
from __future__ import annotations
import argparse
import hashlib
import html
import json
import os
import re
import sqlite3
import stat
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit
from xml.etree import ElementTree

from licensed_content import chunks

MAX_BOOKS=25_000
MAX_BOOK_BYTES=50_000_000
MAX_EPUB_UNPACKED=120_000_000
MAX_PDF_PAGES=2_500
MAX_CHARS=15_000_000
MAX_LINE=32_768
MAX_MANIFEST_BYTES=120_000_000
REQUIRED={
    "id","title","author","source_url","content_file","content_sha256",
    "rights_basis","rights_reference","reviewer","rights_reviewed","training_permission"
}
RIGHTS={"owned","permission","compatible-license"}


def checksum(path:Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as source:
        for part in iter(lambda:source.read(1024*1024),b""):
            h.update(part)
    return h.hexdigest()


class PlainHtml(HTMLParser):
    SKIP={"script","style","svg","nav","noscript"}
    BREAK={"p","div","h1","h2","h3","h4","h5","h6","br","li","section","article"}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts=[]
        self.blocked=0
        self.length=0
    def handle_starttag(self,tag,attrs):
        if tag in self.SKIP:self.blocked+=1
        if tag in self.BREAK and not self.blocked:self.parts.append("\n")
    def handle_endtag(self,tag):
        if tag in self.SKIP:self.blocked=max(0,self.blocked-1)
        if tag in self.BREAK and not self.blocked:self.parts.append("\n")
    def handle_data(self,data):
        if not self.blocked:
            self.length+=len(data)
            if self.length>MAX_CHARS:raise ValueError("FULLTEXT_CHARACTER_CAP_EXCEEDED")
            self.parts.append(data)


def safe_zip_name(name:str)->bool:
    parsed=PurePosixPath(name)
    return not name.startswith("/") and "\\" not in name and ".." not in parsed.parts and ":" not in name


def epub_text(path:Path)->str:
    with zipfile.ZipFile(path) as archive:
        members={m.filename:m for m in archive.infolist() if not m.is_dir()}
        if any(not safe_zip_name(m.filename) or m.flag_bits&1 for m in members.values()):
            raise ValueError("EPUB_UNSAFE_PATH_OR_ENCRYPTED_ARCHIVE")
        total=sum(m.file_size for m in members.values())
        if total>MAX_EPUB_UNPACKED:raise ValueError("EPUB_DECOMPRESSION_LIMIT")
        if "META-INF/encryption.xml" in members:
            raise ValueError("EPUB_DRM_ENCRYPTED_NOT_SUPPORTED")
        text_files=[]
        # EPUB spine is the canonical reading sequence. Do not silently reorder.
        if "META-INF/container.xml" in members:
            meta=ElementTree.fromstring(archive.read("META-INF/container.xml"))
            opfs=[e.attrib.get("full-path","") for e in meta.iter() if e.tag.endswith("rootfile")]
            if opfs and opfs[0] in members:
                opf=opfs[0]
                document=ElementTree.fromstring(archive.read(opf))
                refs={e.attrib.get("id"):e.attrib.get("href") for e in document.iter() if e.tag.endswith("item")}
                spine=[e.attrib.get("idref") for e in document.iter() if e.tag.endswith("itemref")]
                prefix=PurePosixPath(opf).parent
                for ident in spine:
                    href=refs.get(ident)
                    if href:
                        candidate=str(prefix.joinpath(href.split("#",1)[0]))
                        if candidate in members and candidate.lower().endswith((".xhtml",".html",".htm")):
                            text_files.append(candidate)
        if not text_files:
            text_files=sorted(n for n in members if n.lower().endswith((".xhtml",".html",".htm"))
                               and "nav." not in n.lower())
        if not text_files:raise ValueError("EPUB_NO_HTML_CHAPTERS")
        pieces=[]
        for name in text_files:
            member=members[name]
            if member.file_size>MAX_BOOK_BYTES:raise ValueError("EPUB_CHAPTER_TOO_LARGE")
            raw=archive.read(member)
            try:
                chapter=raw.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                raise ValueError("EPUB_CHAPTER_NOT_UTF8") from exc
            parser=PlainHtml()
            parser.feed(chapter)
            pieces.append("".join(parser.parts))
        return "\n\n".join(pieces)


def pdf_text(path:Path)->str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ValueError("PDF_TEXT_EXTRACTION_REQUIRES_PYPDF") from exc
    reader=PdfReader(str(path),strict=False)
    if reader.is_encrypted:raise ValueError("PDF_ENCRYPTED_NOT_SUPPORTED")
    if not 1<=len(reader.pages)<=MAX_PDF_PAGES:
        raise ValueError("PDF_PAGE_LIMIT")
    pieces=[]
    size=0
    for page in reader.pages:
        extracted=page.extract_text(extraction_mode="plain") or ""
        size+=len(extracted)
        if size>MAX_CHARS:raise ValueError("PDF_TEXT_LIMIT")
        pieces.append(extracted)
    # No silent OCR; scanned PDFs may have zero text.
    return "\n\n".join(pieces)


def read_book(path:Path)->str:
    if path.stat().st_size>MAX_BOOK_BYTES or path.stat().st_size<200:
        raise ValueError("BOOK_FILE_SIZE_INVALID")
    if path.suffix.lower()==".txt":
        try:body=path.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError as exc:raise ValueError("TXT_MUST_BE_UTF8") from exc
    elif path.suffix.lower()==".epub":
        body=epub_text(path)
    elif path.suffix.lower()==".pdf":
        body=pdf_text(path)
    else:
        raise ValueError("ONLY_TXT_EPUB_PDF_ALLOWED")
    body=body.replace("\x00","")
    if len(body)>MAX_CHARS:raise ValueError("BOOK_TEXT_TOO_LARGE")
    if len(body.strip())<200:
        raise ValueError("NO_EXTRACTABLE_FULLTEXT_OR_SCANNED_DOCUMENT")
    return body


def validate_row(item:dict,root:Path)->tuple[Path,dict]:
    if not isinstance(item,dict) or not REQUIRED.issubset(item):
        raise ValueError("RIGHTS_MANIFEST_REQUIRED_FIELDS_MISSING")
    extra=set(item)-REQUIRED-{"isbn"}
    if extra:raise ValueError("RIGHTS_MANIFEST_UNEXPECTED_FIELDS")
    ident=item["id"]
    if not isinstance(ident,str) or not re.fullmatch(r"[A-Za-z0-9_-]{3,80}",ident):
        raise ValueError("BOOK_ID_INVALID")
    if item["rights_basis"] not in RIGHTS or item["rights_reviewed"] is not True or item["training_permission"] is not True:
        raise ValueError("EXPLICIT_TRAINING_RIGHTS_NOT_APPROVED")
    if any(not isinstance(item[k],str) or len(item[k].strip())<3
           for k in ("title","author","reviewer","rights_reference")):
        raise ValueError("RIGHTS_DOCUMENTATION_INCOMPLETE")
    if len(item["rights_reference"])<12:
        raise ValueError("RIGHTS_REFERENCE_TOO_SHORT")
    source=item["source_url"]
    if not isinstance(source,str):raise ValueError("CITATION_URL_INVALID")
    url=urlsplit(source)
    if url.scheme!="https" or not url.hostname or url.username or url.password:
        raise ValueError("CITATION_URL_REQUIRES_HTTPS")
    rel=item["content_file"]
    if not isinstance(rel,str) or not rel or Path(rel).is_absolute() or ".." in Path(rel).parts:
        raise ValueError("BOOK_PATH_ESCAPE")
    path=(root/rel).resolve(strict=True)
    if not path.is_relative_to(root) or not path.is_file() or path.suffix.lower() not in {".txt",".epub",".pdf"}:
        raise ValueError("BOOK_OUTSIDE_ROOT_OR_BAD_FORMAT")
    # Reject symlink-based content replacement, including symlinked subdirectories.
    p=root
    for part in Path(rel).parts:
        p=p/part
        if p.is_symlink():raise ValueError("SYMLINK_CONTENT_NOT_ALLOWED")
    if not isinstance(item["content_sha256"],str) or not re.fullmatch(r"[0-9a-f]{64}",item["content_sha256"]):
        raise ValueError("SHA256_REQUIRED")
    actual=checksum(path)
    if actual!=item["content_sha256"]:
        raise ValueError("FULLTEXT_SHA256_MISMATCH")
    return path,item


def init_tables(db:sqlite3.Connection):
    db.executescript("""
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS books(
      id TEXT PRIMARY KEY,title TEXT,author TEXT,source_url TEXT,
      content_sha256 TEXT,rights_basis TEXT,rights_reference TEXT,reviewer TEXT);
    CREATE TABLE IF NOT EXISTS chunks(
      id TEXT PRIMARY KEY,book_id TEXT NOT NULL,position INTEGER,
      body TEXT NOT NULL,body_sha256 TEXT NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id));
    CREATE INDEX IF NOT EXISTS chunk_book ON chunks(book_id);
    CREATE TABLE IF NOT EXISTS ingest_files(
      book_id TEXT PRIMARY KEY,file_path TEXT, file_format TEXT, isbn TEXT,
      source_sha256 TEXT,chunk_count INTEGER,created_utc TEXT);
    CREATE TABLE IF NOT EXISTS audit_failures(
      line_number INTEGER PRIMARY KEY,book_id TEXT, reason TEXT);
    """)


def import_all(root:Path,manifest:Path,index:Path,max_books:int=MAX_BOOKS,resume=False)->dict:
    if not manifest.is_file() or manifest.stat().st_size>MAX_MANIFEST_BYTES:
        raise ValueError("MANIFEST_UNAVAILABLE_OR_TOO_LARGE")
    if not 1<=max_books<=MAX_BOOKS:raise ValueError("BOOK_LIMIT_EXCEEDS_25000")
    if index.exists() and not resume:raise ValueError("REFUSE_OVERWRITE_EXISTING_FULLTEXT_INDEX")
    root=root.resolve(strict=True)
    index.parent.mkdir(parents=True,exist_ok=True)
    con=sqlite3.connect(index)
    init_tables(con)
    counts=Counter()
    reason_counts=Counter()
    seen=set()
    try:
        with manifest.open("r",encoding="utf-8-sig") as lines:
            for number,raw in enumerate(lines,1):
                if not raw.strip():continue
                counts["manifest_rows"]+=1
                if counts["manifest_rows"]>max_books:
                    raise ValueError("BOOK_MANIFEST_ROWS_EXCEED_LIMIT")
                ident="unknown"
                try:
                    if len(raw)>MAX_LINE:raise ValueError("MANIFEST_LINE_TOO_LONG")
                    item=json.loads(raw)
                    if isinstance(item,dict) and isinstance(item.get("id"),str):
                        ident=item["id"]
                    if ident in seen:raise ValueError("DUPLICATE_MANIFEST_ID")
                    seen.add(ident)
                    path,item=validate_row(item,root)
                    prior=con.execute("SELECT source_sha256 FROM ingest_files WHERE book_id=?",
                                      (ident,)).fetchone()
                    if prior:
                        if prior[0]!=item["content_sha256"]:
                            raise ValueError("PREVIOUS_CONTENT_HASH_CONFLICT")
                        counts["already_imported"]+=1
                        continue
                    body=read_book(path)
                    passages=list(chunks(body))
                    if not passages:
                        raise ValueError("NO_USABLE_TEXT_CHUNKS")
                    with con:
                        con.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?)",
                          (ident,item["title"],item["author"],item["source_url"],
                           item["content_sha256"],item["rights_basis"],item["rights_reference"],item["reviewer"]))
                        for position,text in passages:
                            uid=hashlib.sha256((ident+":"+str(position)).encode()).hexdigest()[:24]
                            con.execute("INSERT INTO chunks VALUES(?,?,?,?,?)",
                              ("chunk_"+uid,ident,position,text,hashlib.sha256(text.encode()).hexdigest()))
                        con.execute("INSERT INTO ingest_files VALUES(?,?,?,?,?,?,?)",
                          (ident,item["content_file"],path.suffix.lower(),item.get("isbn",""),
                           item["content_sha256"],len(passages),
                           datetime.now(timezone.utc).isoformat()))
                        # Resume can recover corrected entries.
                        con.execute("DELETE FROM audit_failures WHERE line_number=?",(number,))
                    counts["approved_fulltexts_imported"]+=1
                    counts["paragraphs_indexed"]+=len(passages)
                except (ValueError,KeyError,TypeError,UnicodeError,json.JSONDecodeError,FileNotFoundError,
                        OSError,zipfile.BadZipFile) as exc:
                    # Never treat an unlicensed/inaccessible file as learned content.
                    reason=str(exc)
                    if not re.fullmatch("[A-Z0-9_]+",reason):
                        reason=type(exc).__name__+"_INPUT_INVALID"
                    reason_counts[reason]+=1
                    counts["failed_or_unlicensed"]+=1
                    with con:
                        con.execute("INSERT OR REPLACE INTO audit_failures VALUES(?,?,?)",
                                    (number,ident[:80],reason))
        total_books=con.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        total_chunks=con.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        failed=con.execute("SELECT COUNT(*) FROM audit_failures").fetchone()[0]
        report={
            "status":"indexed-reviewed-local-fulltexts-not-neural-weight-training",
            "manifest_rows_seen_this_run":counts["manifest_rows"],
            "books_imported_this_run":counts["approved_fulltexts_imported"],
            "books_skipped_existing":counts["already_imported"],
            "books_failed_this_run":counts["failed_or_unlicensed"],
            "failure_reasons":dict(reason_counts),
            "approved_fulltext_books_total":total_books,
            "indexed_paragraphs_total":total_chunks,
            "outstanding_manifest_errors":failed,
            "all_manifest_books_indexed":failed==0 and counts["manifest_rows"]==total_books,
            "llm_optimizer_steps":0,"language_model_weights_updated":False,
            "source_manifest_sha256":checksum(manifest),
            "privacy":"private-owner-supplied-files-no-network",
            "report_generated_utc":datetime.now(timezone.utc).isoformat()
        }
        index.with_suffix(".report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        return report
    finally:
        con.close()


def main(argv=None):
    parser=argparse.ArgumentParser(description="Rights-gated bulk book fulltext indexer; no network or LLM training")
    parser.add_argument("--root",type=Path,required=True)
    parser.add_argument("--manifest-jsonl",type=Path,required=True)
    parser.add_argument("--index",type=Path,required=True)
    parser.add_argument("--max-books",type=int,default=20_000)
    parser.add_argument("--resume",action="store_true")
    parser.add_argument("--execute",action="store_true")
    args=parser.parse_args(argv)
    if not args.execute:
        print(json.dumps({"state":"dry-run","maximum_books":args.max_books,
         "fulltexts_read":0,"llm_steps":0,"network_requests":0},ensure_ascii=False))
        return 0
    result=import_all(args.root,args.manifest_jsonl,args.index,args.max_books,args.resume)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 2 if result["outstanding_manifest_errors"] else 0


if __name__=="__main__":
    sys.exit(main())
