"""Opt-in, disposable Moli CLI adapter for 衞國's public read-only extraction.

Moli is NOT a Chromium wrapper. Its CLI does not give this service Playwright's
request routing controls. Therefore this adapter is disabled until an operator
confirms an actual outbound allowlist proxy/firewall, including redirects and
subresources. The environment flag alone is NOT that network isolation.
"""
from __future__ import annotations

import asyncio
import os
import shutil
from typing import Any

OUTPUT_LIMIT = 65536
TEXT_LIMIT = 10000
TIMEOUT_SECONDS = 20


def moli_eligible(steps: list[dict[str, Any]], *, approved_interactions: bool = False) -> bool:
    """Never change the authorization of a request to make Moli eligible."""
    return (
        os.getenv("WEIGUO_BROWSER_ENGINE", "chromium").lower() in ("auto", "moli")
        and os.getenv("WEIGUO_MOLI_EGRESS_ISOLATED", "false").lower() == "true"
        and not approved_interactions
        and len(steps) == 1
        and steps[0].get("action") == "extract"
    )


async def _read_moli(binary: str, url: str) -> str:
    # Neither a shell nor an untrusted model may supply CLI flags.
    # Do not pass admin, OAuth, family ACL, model, or cloud credentials to Moli.
    environment = {
        "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
        "HOME": "/tmp",
        "XDG_CACHE_HOME": "/tmp/.cache",
        "LANG": "C.UTF-8",
    }
    process = await asyncio.create_subprocess_exec(
        binary, "fetch", "--dump", "markdown", "--wait-until", "done",
        "--block-private-networks", "--disable-subframes",
        "--fail", "--timeout", "12000",
        *(["--disable-js"] if os.getenv("WEIGUO_ALLOW_JAVASCRIPT", "false").lower() != "true" else []),
        url,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        cwd="/tmp", env=environment,
    )
    try:
        data = bytearray()
        assert process.stdout is not None
        while True:
            chunk = await process.stdout.read(8192)
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > OUTPUT_LIMIT:
                raise RuntimeError("Moli extraction exceeded the output limit")
        if await process.wait() != 0:
            raise RuntimeError("Moli returned a nonzero exit code")
        content = data.decode("utf-8", errors="replace").strip()
        if not content:
            raise RuntimeError("Moli returned empty content")
        return content[:TEXT_LIMIT]
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()


async def maybe_moli_extract(
    url: str, steps: list[dict[str, Any]], *, approved_interactions: bool = False
) -> dict[str, Any] | None:
    """Attempt a single read; return None for the existing Chromium fallback.

    Caller MUST validate the URL and steps with Athena policy, including DNS,
    before calling this function. Egress isolation MUST independently enforce
    the same HTTPS host allowlist for redirects and subresources.
    """
    if not moli_eligible(steps, approved_interactions=approved_interactions):
        return None
    binary = shutil.which("moli")
    if not binary:
        return None
    try:
        content = await asyncio.wait_for(_read_moli(binary, url), timeout=TIMEOUT_SECONDS)
    except (OSError, RuntimeError, asyncio.TimeoutError):
        return None
    return {
        "status": "completed",
        "title": "",
        # Requested URL, NOT a claim that Moli verified a final redirect URL.
        "url": url,
        "events": [{"step": 1, "action": "extract", "text": content, "source": url}],
        "models_loaded": 0,
        "engine": "moli",
    }
