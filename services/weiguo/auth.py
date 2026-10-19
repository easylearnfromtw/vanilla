"""Verified Google OIDC identity -> least-privilege short-lived family session.

The browser NEVER receives the backend operator token. Google Drive OAuth access
tokens are deliberately not accepted here. Family rights live only in server env.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException
from google.auth.transport.requests import Request
from google.oauth2 import id_token

SESSION_SECONDS = 15 * 60
_SUB = re.compile(r"^[0-9]{8,40}$")
_ROLES = frozenset(("owner", "member", "viewer"))


@dataclass(frozen=True)
class FamilyIdentity:
    sub: str
    member: str
    role: str
    email: str


def _member_for(sub: str) -> tuple[str, str] | None:
    """Reload ACL per request so revocation takes effect without JWT refresh."""
    try:
        acl = json.loads(os.environ.get("WEIGUO_FAMILY_ACL_JSON", "{}"))
    except (TypeError, ValueError):
        raise HTTPException(503, "家庭權限設定格式錯誤")
    if not isinstance(acl, dict) or len(acl) > 30:
        raise HTTPException(503, "家庭權限設定格式錯誤")
    record = acl.get(sub)
    if record is None:
        return None
    if not isinstance(record, dict):
        raise HTTPException(503, "家庭權限設定格式錯誤")
    name, role = record.get("member"), record.get("role")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64 or role not in _ROLES:
        raise HTTPException(503, "家庭權限設定格式錯誤")
    return name.strip(), role


def _signing_key() -> bytes:
    key = os.environ.get("WEIGUO_SESSION_SECRET", "")
    if len(key) < 32 or key == os.environ.get("WEIGUO_ADMIN_TOKEN", ""):
        raise HTTPException(503, "未設定獨立的家庭工作階段簽章金鑰")
    return key.encode("utf-8")


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)


def google_login(credential: str) -> tuple[str, FamilyIdentity]:
    client = os.environ.get("WEIGUO_GOOGLE_CLIENT_ID", "").strip()
    if not client or not isinstance(credential, str) or not 100 <= len(credential) <= 8192:
        raise HTTPException(400, "Google 登入設定或憑證不正確")
    _signing_key()
    try:
        claims = id_token.verify_oauth2_token(credential, Request(), audience=client)
    except (ValueError, Exception) as exc:
        # Intentionally never include the token, claims or verifier response.
        raise HTTPException(401, "Google 身分驗證失敗") from exc
    sub = claims.get("sub")
    email = claims.get("email")
    if (not isinstance(sub, str) or not _SUB.fullmatch(sub)
        or claims.get("email_verified") is not True
        or not isinstance(email, str) or not email.strip()
        or claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com")):
        raise HTTPException(401, "Google 帳號資料未通過驗證")
    family = _member_for(sub)
    if family is None:
        raise HTTPException(403, "此 Google 帳號尚未獲得家庭權限")
    identity = FamilyIdentity(sub, family[0], family[1], email.strip().lower())
    now = int(time.time())
    payload = {"v": 1, "aud": "weiguo-family", "sub": sub, "email": identity.email,
               "iat": now, "exp": now + SESSION_SECONDS, "jti": secrets.token_urlsafe(12)}
    message = _encode(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    digest = hmac.new(_signing_key(), message.encode("ascii"), hashlib.sha256).digest()
    return message + "." + _encode(digest), identity


def verify_family_token(raw: str) -> FamilyIdentity:
    if not isinstance(raw, str) or len(raw) > 2048:
        raise HTTPException(401, "工作階段無效")
    try:
        encoded, mac = raw.split(".")
        expected = hmac.new(_signing_key(), encoded.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _decode(mac)):
            raise ValueError("bad signature")
        claims = json.loads(_decode(encoded))
        now = int(time.time())
        if (not isinstance(claims, dict) or claims.get("aud") != "weiguo-family"
            or claims.get("v") != 1 or not isinstance(claims.get("sub"), str)
            or not _SUB.fullmatch(claims["sub"])
            or type(claims.get("iat")) is not int or type(claims.get("exp")) is not int
            or claims["iat"] > now + 30 or claims["exp"] <= now
            or claims["exp"] - claims["iat"] > SESSION_SECONDS
            or not isinstance(claims.get("email"), str)):
            raise ValueError("expired or wrong claims")
    except HTTPException:
        raise
    except (ValueError, TypeError, UnicodeError, KeyError):
        raise HTTPException(401, "工作階段無效或已過期")
    family = _member_for(claims["sub"])
    if family is None:
        raise HTTPException(403, "家庭權限已撤銷")
    return FamilyIdentity(claims["sub"], family[0], family[1], claims["email"])


async def family_user(authorization: str | None = Header(default=None)) -> FamilyIdentity:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "請使用 Google 帳號登入衞國")
    return verify_family_token(authorization[7:])


async def family_reader(authorization: str | None = Header(default=None)) -> FamilyIdentity:
    identity = await family_user(authorization)
    if identity.role not in ("owner", "member"):
        raise HTTPException(403, "此家庭角色沒有瀏覽器任務權限")
    return identity
