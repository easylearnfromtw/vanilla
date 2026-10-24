#!/usr/bin/env python3
"""Hermes + Firecrawl REAL reference ingestion to UNAPPROVED research evidence.

External text is never commands. Nothing here updates neural model weights.
Explicit --execute and source-domain allowlist are required for live calls.
All output is local, append-safe (exclusive create), provenance-rich JSONL.
"""
from __future__ import annotations
import argparse
import hashlib
import ipaddress
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "src" / "hermes" / "hermes-skills-index.json"
FIRECRAWL_API = "https://api.firecrawl.dev/v2"
MAX_BYTES = 3_000_000
MAX_CONTENT_CHARS = 12000
MAX_ITEMS = 5


def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def checked_https_url(value: str, allowed_domains: list[str]) -> str:
    if not value or len(value) > 2048:
        raise ValueError("INVALID_URL")
    url = urllib.parse.urlsplit(value)
    host = (url.hostname or "").lower().rstrip(".")
    if (url.scheme != "https" or not host or url.username or url.password
        or url.port not in (None, 443)
        or host == "localhost" or host.endswith(".localhost")
        or host.endswith(".local") or host.endswith(".internal")
        or not re.fullmatch(r"[a-z0-9.-]+", host)
        or ".." in host or "." not in host):
        raise ValueError("ONLY_PUBLIC_HTTPS_URLS")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError("NO_LITERAL_IP_ADDRESSES")
    if host not in {h.lower().strip().rstrip(".") for h in allowed_domains}:
        raise ValueError("SOURCE_HOST_NOT_APPROVED")
    return value


def fetch_json(url: str, *, bearer: str | None, payload: dict | None) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Accept": "application/json", "User-Agent": "Vanilla-Audited-Research/1.0",
                 **({"Content-Type": "application/json"} if body is not None else {}),
                 **({"Authorization": "Bearer "+bearer} if bearer else {})},
        method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ValueError("PROVIDER_RESPONSE_TOO_LARGE")
            parsed = json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        # Don't include response bodies, request URL or key in error messages.
        raise RuntimeError(f"UPSTREAM_HTTP_{exc.code}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("UPSTREAM_UNREACHABLE") from None
    if not isinstance(parsed, dict) or parsed.get("success") is False:
        raise ValueError("PROVIDER_DID_NOT_CONFIRM_SUCCESS")
    return parsed


def make_evidence(*, provider: str, source_url: str, title: str,
                  content: str, license_note: str) -> dict:
    clean = content.strip().replace("\x00", "")
    if len(clean) < 30:
        raise ValueError("NO_SUBSTANTIVE_EXTRACTED_CONTENT")
    clean = clean[:MAX_CONTENT_CHARS]
    digest = sha(clean)
    return {
        "id": "ev_" + sha(provider + "\n" + source_url + "\n" + digest)[:24],
        "provider": provider,
        "source_url": source_url,
        "title": title[:160],
        "content": clean,
        "content_sha256": digest,
        "collected_utc": datetime.now(timezone.utc).isoformat(),
        "origin_license_note": license_note,
        "reviewed": False,
        "training_approved": False,
        "trust": "external-untrusted-document",
    }


def firecrawl_scrape(url: str, approved_hosts: list[str], token: str) -> dict:
    safe = checked_https_url(url, approved_hosts)
    response = fetch_json(FIRECRAWL_API+"/scrape", bearer=token,
                          payload={"url": safe, "formats": ["markdown"], "onlyMainContent": True})
    data = response.get("data")
    if not isinstance(data, dict):
        raise ValueError("FIRECRAWL_MISSING_DATA")
    markdown = data.get("markdown")
    metadata = data.get("metadata") or {}
    if not isinstance(markdown, str):
        raise ValueError("FIRECRAWL_MISSING_MARKDOWN")
    if not isinstance(metadata, dict):
        metadata = {}
    actual = str(metadata.get("sourceURL") or safe)
    checked_https_url(actual, approved_hosts)
    return make_evidence(provider="firecrawl", source_url=actual,
                         title=str(metadata.get("title") or actual),
                         content=markdown,
                         license_note="Unknown until human review; website terms/robots/copyright/PII require approval")


def firecrawl_search(query: str, approved_hosts: list[str], token: str, limit: int) -> list[dict]:
    if not (3 <= len(query.strip()) <= 200):
        raise ValueError("INVALID_SEARCH_QUERY")
    response = fetch_json(FIRECRAWL_API+"/search", bearer=token,
                          payload={"query": query, "limit": limit, "scrapeOptions": {"formats": ["markdown"]}})
    data = response.get("data")
    results = data.get("web", []) if isinstance(data, dict) else data if isinstance(data, list) else []
    if not isinstance(results, list):
        raise ValueError("FIRECRAWL_BAD_SEARCH_RESPONSE")
    output = []
    for row in results[:limit]:
        if not isinstance(row, dict):
            continue
        try:
            url = checked_https_url(str(row.get("url") or ""), approved_hosts)
        except ValueError:
            continue
        body = row.get("markdown") or row.get("description") or ""
        if not isinstance(body, str) or len(body.strip()) < 30:
            continue
        output.append(make_evidence(
            provider="firecrawl-search", source_url=url,
            title=str(row.get("title") or url), content=body,
            license_note="Search results may be snippets, not full articles; copyright/terms/PII review required"))
    return output


def hermes_skill(skill_id: str, selected_manifest: dict | None = None) -> dict:
    manifest = selected_manifest or json.loads(CATALOG.read_text(encoding="utf-8"))
    entry = next((s for s in manifest["skills"] if s["id"] == skill_id), None)
    if entry is None:
        raise ValueError("SKILL_NOT_IN_PINNED_OFFICIAL_HERMES_CATALOG")
    revision = manifest["revision"]
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("UNPINNED_HERMES_REVISION")
    # Never accept user-supplied arbitrary raw URL or path.
    url = "https://raw.githubusercontent.com/NousResearch/hermes-agent/" + revision + "/" + entry["path"]
    request = urllib.request.Request(url, headers={"User-Agent": "Vanilla-Audited-Research/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(90001)
    except urllib.error.HTTPError as exc:
        raise RuntimeError("HERMES_SKILL_HTTP_"+str(exc.code)) from None
    if len(data) > 90000:
        raise ValueError("HERMES_SKILL_EXCEEDS_SIZE_LIMIT")
    markdown = data.decode("utf-8")
    if not markdown.startswith("---") or "\n---" not in markdown or len(markdown) < 30:
        raise ValueError("INVALID_HERMES_SKILL_FILE")
    # No shell / inline command preprocessing, no automatic plugin/tool installation.
    return make_evidence(
        provider="hermes-agent",source_url=entry["github"],title=entry["name"],
        content=markdown, license_note="Hermes repo MIT; individual SKILL.md and third-party content need separate license review")


def save_records(records: list[dict], filename: Path) -> None:
    if not records:
        raise ValueError("NO_APPROVED_HOST_RESULTS_WITH_USABLE_EVIDENCE")
    target = filename.resolve()
    if target.exists():
        raise ValueError("REFUSE_OVERWRITE_EVIDENCE_FILE")
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("x", encoding="utf-8") as out:
        for row in records:
            out.write(json.dumps(row, ensure_ascii=False)+"\n")


def main() -> int:
    p = argparse.ArgumentParser(description="Explicit user-driven Hermes/Firecrawl reference ingestion, not AI weight training")
    p.add_argument("--source", choices=("hermes", "firecrawl-scrape", "firecrawl-search"), required=True)
    p.add_argument("--skill-id", default="")
    p.add_argument("--url", action="append", default=[])
    p.add_argument("--query", default="")
    p.add_argument("--allow-domain", action="append", default=[])
    p.add_argument("--limit", type=int, default=3)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--execute", action="store_true", help="Authorise real HTTP requests and local evidence export")
    a = p.parse_args()
    if not 1 <= a.limit <= MAX_ITEMS:
        p.error("limit must be between 1 and 5")
    if a.source == "hermes":
        if not a.skill_id or a.url or a.query:
            p.error("Hermes requires exactly --skill-id")
        manifest = json.loads(CATALOG.read_text(encoding="utf-8"))
        if not any(s["id"] == a.skill_id for s in manifest["skills"]):
            p.error("Skill id is not in verified manifest")
    elif a.source == "firecrawl-scrape":
        if not 1 <= len(a.url) <= a.limit or not a.allow_domain or a.query or a.skill_id:
            p.error("Use 1..limit URLs, --allow-domain for each approved website")
        for address in a.url:
            checked_https_url(address, a.allow_domain)
    else:
        if not a.query.strip() or not a.allow_domain or a.url or a.skill_id:
            p.error("Firecrawl search requires --query and approved --allow-domain list")
    if not a.execute:
        print(json.dumps({"mode": a.source, "execution": "not-run", "would_access_network": True,
                          "output": str(a.output), "training_completed": False}, ensure_ascii=False))
        return 0
    if a.output.exists():
        raise ValueError("REFUSE_OVERWRITE_EXISTING_EVIDENCE")
    token = os.environ.get("FIRECRAWL_API_KEY", "").strip()
    if a.source != "hermes" and not token:
        raise ValueError("FIRECRAWL_API_KEY_ENVIRONMENT_REQUIRED")
    if a.source == "hermes":
        records = [hermes_skill(a.skill_id)]
    elif a.source == "firecrawl-scrape":
        records = [firecrawl_scrape(url, a.allow_domain, token) for url in a.url]
    else:
        records = firecrawl_search(a.query, a.allow_domain, token, a.limit)
    save_records(records, a.output)
    print(json.dumps({"status": "evidence-only", "count": len(records), "output": str(a.output),
                      "training_completed": False, "human_review_required": True}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
