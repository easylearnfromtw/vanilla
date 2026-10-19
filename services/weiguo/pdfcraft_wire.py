"""Versioned authenticated wire contract between WeiGuo and a dedicated PdfCraft worker.

Both sides share only a random 256-bit HMAC key. No user identity, Drive
credentials, internal commands, local paths or administrative token are sent.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import time
from typing import Mapping

READY_PATH = "/v1/pdfcraft/ready"
COMBINE_PATH = "/v1/pdfcraft/combine"
MAX_REQUEST_BYTES = 8_500_000
MAX_AGE_SECONDS = 45
SIGNED = {("GET", READY_PATH), ("POST", COMBINE_PATH)}
NONCE = re.compile(r"^[0-9a-f]{32}$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")


class WireDenied(ValueError):
    pass


def worker_key() -> bytes:
    raw = os.environ.get("WEIGUO_PDFCRAFT_WORKER_SECRET", "")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", raw):
        raise WireDenied("Missing 256-bit worker authentication key")
    return bytes.fromhex(raw)


def _message(method: str, path: str, body: bytes, timestamp: int, nonce: str) -> bytes:
    if (method, path) not in SIGNED:
        raise WireDenied("Operation not allowed")
    return (
        f"pdfcraft-v1\n{method}\n{path}\n{timestamp}\n{nonce}\n"
        + hashlib.sha256(body).hexdigest()
    ).encode("ascii")


def sign_request(method: str, path: str, body: bytes = b"",
                 timestamp: int | None = None, nonce: str | None = None) -> dict[str, str]:
    ts = int(time.time()) if timestamp is None else timestamp
    n = secrets.token_hex(16) if nonce is None else nonce
    if not NONCE.fullmatch(n):
        raise WireDenied("Invalid worker request nonce")
    signature = hmac.new(worker_key(), _message(method, path, body, ts, n), "sha256").hexdigest()
    return {
        "X-PdfCraft-Timestamp": str(ts),
        "X-PdfCraft-Nonce": n,
        "X-PdfCraft-Signature": signature,
    }


def verify_request(method: str, path: str, body: bytes,
                   headers: Mapping[str, str], used: dict[str, int],
                   now: int | None = None) -> None:
    if len(body) > MAX_REQUEST_BYTES:
        raise WireDenied("Worker request too large")
    try:
        timestamp_raw = headers["x-pdfcraft-timestamp"]
        nonce = headers["x-pdfcraft-nonce"]
        signature = headers["x-pdfcraft-signature"]
        if not re.fullmatch(r"[0-9]{10,11}", timestamp_raw):
            raise ValueError("invalid timestamp")
        timestamp = int(timestamp_raw)
        current = int(time.time()) if now is None else now
        if abs(current - timestamp) > MAX_AGE_SECONDS:
            raise ValueError("expired")
        if not NONCE.fullmatch(nonce) or not DIGEST.fullmatch(signature):
            raise ValueError("bad nonce or MAC")
        # One process per worker is required; prune replay nonces as part of each check.
        for token, seen in list(used.items()):
            if current - seen > MAX_AGE_SECONDS * 2:
                used.pop(token, None)
        if nonce in used or len(used) >= 1024:
            raise ValueError("replayed or saturated")
        expected = hmac.new(worker_key(), _message(method, path, body, timestamp, nonce), "sha256").hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise ValueError("bad MAC")
        used[nonce] = current
    except (KeyError, TypeError, ValueError, WireDenied) as exc:
        raise WireDenied("Worker authentication denied") from exc
