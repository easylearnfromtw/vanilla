#!/usr/bin/env python3
"""Opt-in bounded download of a single official NBINet public catalogue CSV.

Do not crawl cis2.ntl.edu.tw; this is metadata only, never book full text.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

URL = "https://www.ncl.edu.tw/OpenDataFile/0Q155002975285157159/a3de23b3-e48c-4cd9-bb2c-374de4abecde"
SOURCE = "https://data.gov.tw/dataset/7502"
MAX_BYTES = 1_200_000_000


class OnlyOfficialRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if (parsed.scheme != "https" or
            parsed.hostname not in {"www.ncl.edu.tw", "ncl.edu.tw"} or
            parsed.username or parsed.password):
            raise ValueError("CROSS_ORIGIN_REDIRECT_REJECTED")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(outdir: Path) -> dict:
    if outdir.exists():
        raise ValueError("REFUSE_OVERWRITE_EXISTING_OUTPUT_DIRECTORY")
    outdir.mkdir(parents=True)
    raw = outdir / "source-download.bin"
    target = outdir / "nbinet.csv"
    try:
        opener = urllib.request.build_opener(OnlyOfficialRedirects())
        request = urllib.request.Request(URL, headers={
            "User-Agent": "Vanilla-Atuber-Catalogue-Ingest/1.0",
            "Accept": "text/csv,application/zip,application/octet-stream"})
        total = 0
        digest = hashlib.sha256()
        with opener.open(request, timeout=60) as response, raw.open("xb") as out:
            final = urllib.parse.urlsplit(response.geturl())
            if final.scheme != "https" or final.hostname not in {"www.ncl.edu.tw", "ncl.edu.tw"}:
                raise ValueError("NON_OFFICIAL_SOURCE_REJECTED")
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError("OFFICIAL_CSV_OVER_TRANSFER_LIMIT")
                digest.update(chunk)
                out.write(chunk)
        if total < 50:
            raise ValueError("EMPTY_OR_TRIVIAL_SOURCE")
        if zipfile.is_zipfile(raw):
            with zipfile.ZipFile(raw) as archive:
                members = [i for i in archive.infolist()
                           if not i.is_dir() and i.filename.lower().endswith(".csv")]
                if len(members) != 1 or members[0].file_size > MAX_BYTES:
                    raise ValueError("ZIP_MUST_CONTAIN_ONE_BOUNDED_CSV")
                with archive.open(members[0]) as source, target.open("xb") as dest:
                    unpacked = 0
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        unpacked += len(chunk)
                        if unpacked > MAX_BYTES:
                            raise ValueError("UNCOMPRESSED_CSV_OVER_LIMIT")
                        dest.write(chunk)
        else:
            with raw.open("rb") as check:
                head = check.read(8192)
            if head.lstrip().lower().startswith((b"<!doctype html", b"<html", b"{")):
                raise ValueError("NOT_A_CSV_RESPONSE")
            raw.replace(target)
        with target.open("rb") as source:
            sample = source.read(16384)
        try:
            header = sample.decode("utf-8-sig").splitlines()[0]
            encoding = "utf-8-sig"
        except UnicodeDecodeError:
            header = sample.decode("cp950").splitlines()[0]
            encoding = "cp950"
        if not any(field in header.lower() for field in ("書名", "題名", "245", "title")):
            raise ValueError("EXPECTED_BOOK_TITLE_COLUMN_NOT_FOUND")
        provenance = {
            "status": "downloaded-official-catalogue-metadata-only",
            "source_page": SOURCE, "official_resource_url": URL,
            "release": "NBINet 2026 Q2 / 民國115年第2季",
            "retrieved_utc": datetime.now(timezone.utc).isoformat(),
            "download_sha256": digest.hexdigest(), "download_bytes": total,
            "csv_bytes": target.stat().st_size, "csv_encoding": encoding,
            "csv_path": str(target), "full_text_books_downloaded": 0,
            "model_weight_updates": 0, "training_approved": False,
        }
        (outdir / "download_provenance.json").write_text(
            json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raw.unlink(missing_ok=True)
        return provenance
    except BaseException:
        shutil.rmtree(outdir)
        raise


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Download one pinned NBINet CSV, not model training")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    if not args.execute:
        print(json.dumps({"status": "dry-run", "url": URL,
                          "target": str(args.output), "network_requests": 0,
                          "training_complete": False}, ensure_ascii=False))
        return 0
    print(json.dumps(fetch(args.output), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
