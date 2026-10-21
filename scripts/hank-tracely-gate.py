#!/usr/bin/env python3
"""Hank's optional Tracely scenario gate. No prompts or model outputs in CI logs."""
from __future__ import annotations
import ipaddress
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

AGENT = re.compile(r"[a-zA-Z0-9_-]{1,64}(?:,[a-zA-Z0-9_-]{1,64}){0,19}\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
OUT = Path("artifacts/hank-tracely-summary.json")


def https_url(value: str, *, revision: bool = False) -> bool:
    try:
        p = urlsplit(value)
        host = p.hostname or ""
        try:
            public_host = ipaddress.ip_address(host).is_global
        except ValueError:
            public_host = bool(host and host != "localhost"
                               and not host.endswith((".localhost", ".local", ".internal")))
        return bool(public_host and p.scheme == "https" and p.hostname
                    and not p.username and not p.password
                    and p.port in (None, 443)
                    and not p.query and not p.fragment
                    and value == value.strip()
                    and (p.path != "" if revision else p.path in ("", "/")))
    except ValueError:
        return False


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def revision_matches(url: str, expected: str) -> bool:
    """Fail closed unless deployed candidate exposes its exact commit hash."""
    if not SHA.fullmatch(expected) or not https_url(url, revision=True):
        return False
    try:
        request = Request(url, headers={"Accept": "application/json", "Cache-Control": "no-store"})
        with build_opener(NoRedirect).open(request, timeout=7) as response:
            if (response.status != 200
                or response.headers.get("content-type", "").split(";")[0] != "application/json"):
                return False
            obj = json.loads(response.read(512))
            return isinstance(obj, dict) and obj.get("sha") == expected
    except (HTTPError, URLError, OSError, ValueError, TypeError):
        return False


def summarize(status: str, reason: str = "") -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {"schemaVersion": 1, "system": "Hank", "engine": "Tracely",
            "status": status, "reason": reason, "sensitiveTracesUploaded": False}
    OUT.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Hank / Tracely: {status}" + (f" ({reason})" if reason else ""))
    if path := os.getenv("GITHUB_STEP_SUMMARY"):
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"### Hank / Tracely: {status}\n{reason}\n")


def main() -> int:
    api = os.getenv("TRACELY_API", "").strip().rstrip("/")
    key = os.getenv("TRACELY_KEY", "")
    agents = os.getenv("HANK_TRACELY_AGENTS", "").strip()
    revision_url = os.getenv("HANK_TRACELY_REVISION_URL", "").strip()
    sha = os.getenv("HANK_EXPECTED_SHA", "").strip()
    seconds = os.getenv("HANK_TRACELY_TIMEOUT", "900").strip()
    if not all((api, key, agents, revision_url, sha)):
        summarize("ERROR", "Missing Tracely API/key/agents or candidate revision URL")
        return 2
    if not https_url(api) or not https_url(revision_url, revision=True):
        summarize("ERROR", "Invalid HTTPS Tracely/revision endpoint")
        return 2
    if not AGENT.fullmatch(agents) or not SHA.fullmatch(sha):
        summarize("ERROR", "Invalid agent slug(s) or expected commit SHA")
        return 2
    if not seconds.isascii() or not seconds.isdecimal() or not 60 <= int(seconds) <= 1200:
        summarize("ERROR", "Invalid scenario timeout")
        return 2
    if not revision_matches(revision_url, sha):
        summarize("ERROR", "Candidate SHA mismatch: refusing to test an unrelated deployment")
        return 2
    cmd = ["tracely", "simulate", "--agent", agents, "--env", "ci",
           "--timeout", seconds, "--no-github"]
    try:
        run = subprocess.run(cmd, env={**os.environ, "TRACELY_API": api,
                                       "TRACELY_KEY": key, "GITHUB_TOKEN": ""},
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             timeout=int(seconds) + 30, check=False)
    except (OSError, subprocess.TimeoutExpired):
        summarize("ERROR", "CLI unavailable or timed out")
        return 2
    if run.returncode == 0:
        summarize("PASS", "Tracely scenario gate passed on verified candidate")
        return 0
    if run.returncode == 1:
        summarize("FAIL", "Scenario regression; see private Tracely workspace")
        return 1
    summarize("ERROR", "Scenario gate incomplete/unreachable, not PASS")
    return 2


if __name__ == "__main__":
    sys.exit(main())
