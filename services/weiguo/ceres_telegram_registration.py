"""Opt-in, server-only and fail-closed Telegram webhook registration.

Never log Telegram API URLs: BotFather tokens are embedded in their paths.
An existing webhook for another endpoint is never overwritten.
"""
from __future__ import annotations

import json
import os
import re
from urllib.parse import urlsplit

from fastapi import HTTPException

import httpx

from ceres_gateway import _allowed_chat_ids, _secret

_ENDPOINT = "/v1/ceres/telegram/webhook"
_TOKEN = re.compile(r"^[0-9]{5,15}:[A-Za-z0-9_-]{30,80}$")
_SUB = re.compile(r"^[0-9]{8,40}$")
_USERNAME = re.compile(r"^[A-Za-z0-9_]{5,32}$")


def _settings() -> tuple[str, str, str, str] | None:
    """Check complete bindings and public HTTPS endpoint before any network use."""
    token = os.getenv("CERES_TELEGRAM_BOT_TOKEN", "")
    username = os.getenv("CERES_TELEGRAM_EXPECTED_USERNAME", "")
    url = os.getenv("CERES_TELEGRAM_WEBHOOK_URL", "")
    if not _TOKEN.fullmatch(token) or not _USERNAME.fullmatch(username):
        return None
    try:
        parsed = urlsplit(url)
        if (parsed.scheme != "https" or not parsed.hostname
            or not parsed.hostname.endswith(".up.railway.app")
            or parsed.port is not None or parsed.username or parsed.password
            or parsed.path != _ENDPOINT or parsed.query or parsed.fragment
            or url != "https://" + parsed.hostname + _ENDPOINT):
            return None
    except ValueError:
        return None
    try:
        secret = _secret()
        allowlist = _allowed_chat_ids()
        links = json.loads(os.getenv("CERES_FAMILY_LINKS_JSON", "{}"))
        acl = json.loads(os.getenv("WEIGUO_FAMILY_ACL_JSON", "{}"))
    except (ValueError, TypeError, HTTPException):
        return None
    if (not allowlist or not isinstance(links, dict) or not links
        or len(links) > 30 or not isinstance(acl, dict) or len(acl) > 30):
        return None
    subjects: set[str] = set()
    for raw_chat, subject in links.items():
        if (not isinstance(raw_chat, str)
            or not re.fullmatch(r"[0-9]{1,20}", raw_chat)
            or not 0 < int(raw_chat) < 2**63
            or int(raw_chat) not in allowlist
            or not isinstance(subject, str) or not _SUB.fullmatch(subject)
            or subject in subjects):
            return None
        record = acl.get(subject)
        if not isinstance(record, dict) or record.get("role") not in ("owner", "member"):
            return None
        subjects.add(subject)
    return token, username, url, secret


def _checked(payload: httpx.Response) -> dict:
    """Telegram envelope only; descriptions and URLs are never emitted."""
    if payload.status_code != 200:
        raise ValueError("Telegram response was not successful")
    body = payload.json()
    if not isinstance(body, dict) or body.get("ok") is not True or not isinstance(body.get("result"), dict):
        raise ValueError("Telegram response was invalid")
    return body["result"]


async def register_telegram_webhook() -> bool:
    """Run at startup, but only after an explicit separate opt-in flag."""
    if os.getenv("CERES_ENABLED", "").lower() != "true":
        return False
    if os.getenv("CERES_TELEGRAM_REGISTER_WEBHOOK", "").lower() != "true":
        return False
    settings = _settings()
    if settings is None:
        print("Ceres Telegram: registration skipped (invalid server-side configuration)", flush=True)
        return False
    token, expected_username, webhook_url, secret = settings
    api = "https://api.telegram.org/bot" + token + "/"
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=False, trust_env=False) as client:
            me = _checked(await client.get(api + "getMe"))
            if me.get("username", "").lower() != expected_username.lower():
                print("Ceres Telegram: registration skipped (bot identity mismatch)", flush=True)
                return False
            previous = _checked(await client.get(api + "getWebhookInfo"))
            if previous.get("url") not in ("", webhook_url):
                print("Ceres Telegram: registration skipped (different webhook already registered)", flush=True)
                return False
            posted = await client.post(api + "setWebhook", json={
                "url": webhook_url,
                "secret_token": secret,
                "allowed_updates": ["message"],
                "drop_pending_updates": False,
            })
            if posted.status_code != 200:
                raise ValueError("Webhook registration failed")
            answer = posted.json()
            if (not isinstance(answer, dict) or answer.get("ok") is not True
                or answer.get("result") is not True):
                raise ValueError("Webhook registration failed")
            verified = _checked(await client.get(api + "getWebhookInfo"))
            if verified.get("url") != webhook_url:
                raise ValueError("Webhook verification failed")
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        print("Ceres Telegram: registration could not be verified", flush=True)
        return False
    print("Ceres Telegram: webhook registration verified", flush=True)
    return True
