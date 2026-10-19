"""Standalone authenticated PdfCraft worker for a separately controlled Linux VM.

Run as a non-root systemd user, one uvicorn process, bound ONLY to 127.0.0.1.
The operator's HTTPS reverse proxy is the only external connection. It must
not share the WeiGuo browser volume, access tokens or application secrets.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response, JSONResponse

from pdfcraft_engine import (
    PdfCraftUnavailable, PdfCraftFailed, available, combine_pdfs,
)
from pdfcraft_wire import MAX_REQUEST_BYTES, WireDenied, verify_request, READY_PATH, COMBINE_PATH

app = FastAPI(title="Vanilla PdfCraft Worker", docs_url=None, redoc_url=None, openapi_url=None)
_replay: dict[str, int] = {}


async def authenticated_body(request: Request) -> bytes:
    """Read bounded streaming payload before verifying the signed body digest."""
    if request.method == "POST":
        length = request.headers.get("Content-Length")
        if length:
            try:
                if int(length) > MAX_REQUEST_BYTES:
                    raise HTTPException(413, "Request too large")
            except ValueError as exc:
                raise HTTPException(400, "Invalid length") from exc
        body = bytearray()
        async for part in request.stream():
            body.extend(part)
            if len(body) > MAX_REQUEST_BYTES:
                raise HTTPException(413, "Request too large")
        contents = bytes(body)
    else:
        contents = b""
    try:
        verify_request(request.method, request.url.path, contents, request.headers, _replay)
    except WireDenied as exc:
        raise HTTPException(401, "Worker authentication denied") from exc
    return contents


@app.get(READY_PATH)
async def ready(request: Request):
    await authenticated_body(request)
    if not available():
        raise HTTPException(503, "Native sandbox is unavailable")
    return JSONResponse(
        {"service": "pdfcraft-worker", "schemaVersion": 1,
         "ready": True, "operation": "combine-pdf"},
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.post(COMBINE_PATH)
async def combine(request: Request):
    body = await authenticated_body(request)
    if not available():
        raise HTTPException(503, "Native sandbox is unavailable")
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict) or set(payload) != {"files"}:
            raise ValueError("Invalid schema")
        files = payload["files"]
        if not isinstance(files, list) or not 2 <= len(files) <= 3:
            raise ValueError("Invalid PDF count")
        merged = await combine_pdfs(files)
    except (ValueError, UnicodeError, json.JSONDecodeError) as exc:
        raise HTTPException(400, "Invalid PDF request") from exc
    except PdfCraftUnavailable as exc:
        raise HTTPException(503, "Native sandbox is unavailable") from exc
    except PdfCraftFailed as exc:
        raise HTTPException(422, "Native PDF conversion failed") from exc
    return Response(
        content=merged, media_type="application/pdf",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
