"""Ceres administrator policy and encrypted provider vault.

Owner-managed changes are server-side only. Telegram messages NEVER contain keys.
The allowlist is independent of browser local storage and Google Drive tokens.
"""
from __future__ import annotations
import base64
import binascii
import json
import os
import re
import sqlite3
import time
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from ceres_gateway import _session

_EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$")
_ROLES = {"owner", "member", "viewer"}
_SCOPES = {"chat", "files", "nodes", "canva", "gemini", "automation", "studio"}
_PROVIDERS = {"canva", "gemini", "deepseek", "openai"}
def _setup(db: sqlite3.Connection):
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_admin_accounts(
      email TEXT PRIMARY KEY, google_sub TEXT UNIQUE, role TEXT NOT NULL,
      scopes TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_admin_providers(
      provider TEXT PRIMARY KEY, secret_ciphertext BLOB,
      enabled INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_admin_options(
      key TEXT PRIMARY KEY, value TEXT NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_admin_audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor_chat INTEGER NOT NULL,
      operation TEXT NOT NULL, subject TEXT NOT NULL, created_at INTEGER NOT NULL)""")

def enforce() -> bool:
    with _session() as db:
        _setup(db)
        row=db.execute("SELECT value FROM ceres_admin_options WHERE key='enforce'").fetchone()
    return row["value"]=="true" if row else os.getenv("WEIGUO_GMAIL_ACL_ENFORCE","").lower()=="true"

def set_enforce(value: bool, actor: int):
    with _session() as db:
        _setup(db)
        db.execute("INSERT INTO ceres_admin_options(key,value) VALUES('enforce',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ("true" if value else "false",))
        _audit(db, actor, "enforce", "on" if value else "off")
        db.commit()

def _audit(db, chat, operation, subject):
    db.execute("INSERT INTO ceres_admin_audit(actor_chat,operation,subject,created_at) VALUES(?,?,?,?)",
               (chat,operation,subject,int(time.time())))

def normalize_email(email: str) -> str:
    if not isinstance(email,str) or len(email)>254 or not _EMAIL.fullmatch(email):
        raise ValueError("invalid Gmail address")
    value=email.lower()
    if not (value.endswith("@gmail.com") or value.endswith("@googlemail.com")):
        # Workspace identities are supported if verified by Google OIDC.
        return value
    return value

def grant(email: str, role: str, scopes: list[str], actor: int):
    email=normalize_email(email)
    if role not in _ROLES or not scopes or set(scopes)-_SCOPES:
        raise ValueError("invalid role or scopes")
    with _session() as db:
        _setup(db)
        now=int(time.time())
        db.execute("""INSERT INTO ceres_admin_accounts
          (email,role,scopes,enabled,created_at,updated_at)
          VALUES(?,?,?,1,?,?)
          ON CONFLICT(email) DO UPDATE SET role=excluded.role,
          scopes=excluded.scopes,enabled=1,updated_at=excluded.updated_at""",
          (email,role,json.dumps(sorted(set(scopes))),now,now))
        _audit(db,actor,"grant",email)
        db.commit()

def revoke(email: str, actor: int):
    email=normalize_email(email)
    with _session() as db:
        _setup(db)
        db.execute("UPDATE ceres_admin_accounts SET enabled=0,updated_at=? WHERE email=?",
                   (int(time.time()),email))
        _audit(db,actor,"revoke",email)
        db.commit()

def accounts() -> list[dict]:
    with _session() as db:
        _setup(db)
        rows=db.execute("SELECT email,google_sub,role,scopes,enabled FROM ceres_admin_accounts ORDER BY email LIMIT 100").fetchall()
        return [{"email":x["email"],"linked":bool(x["google_sub"]),"role":x["role"],
                 "scopes":json.loads(x["scopes"]),"enabled":bool(x["enabled"])} for x in rows]

def _account_for(email: str|None=None, sub: str|None=None):
    with _session() as db:
        _setup(db)
        if email:
            return db.execute("SELECT * FROM ceres_admin_accounts WHERE email=?",(email.lower(),)).fetchone()
        if sub:
            return db.execute("SELECT * FROM ceres_admin_accounts WHERE google_sub=?",(sub,)).fetchone()
    return None

def role_for_sub(sub: str):
    row=_account_for(sub=sub)
    if row and row["enabled"]:
        return (row["email"],row["role"])
    return None

def check_identity(sub: str, email: str, scope: str|None=None, bind: bool=False):
    """No existing signed session can bypass a newly enforced ACL or changed scope.
    Link email to immutable Google subject only after Google verifies the ID token.
    """
    if not enforce():
        return
    try:
        email=normalize_email(email)
    except ValueError:
        raise HTTPException(403,"此帳號未獲授權") from None
    with _session() as db:
        _setup(db)
        row=db.execute("SELECT * FROM ceres_admin_accounts WHERE email=?",(email,)).fetchone()
        if not row or not row["enabled"] or (row["google_sub"] and row["google_sub"]!=sub):
            raise HTTPException(403,"此 Google 帳號未獲管理員授權")
        if scope and scope not in json.loads(row["scopes"]):
            raise HTTPException(403,"此帳號未取得此功能權限")
        if bind and not row["google_sub"]:
            collision=db.execute("SELECT 1 FROM ceres_admin_accounts WHERE google_sub=?",(sub,)).fetchone()
            if collision:
                raise HTTPException(403,"Google 身分已連結其他帳號")
            db.execute("UPDATE ceres_admin_accounts SET google_sub=?,updated_at=? WHERE email=? AND google_sub IS NULL",
                       (sub,int(time.time()),email))
            db.commit()

def provider_status() -> list[dict]:
    with _session() as db:
        _setup(db)
        rows={x["provider"]:x for x in db.execute("SELECT * FROM ceres_admin_providers")}
    result=[]
    for name in sorted(_PROVIDERS):
        row=rows.get(name)
        legacy=bool(os.getenv("WEIGUO_CANVA_ACCESS_TOKEN","")) if name=="canva" else bool(os.getenv("CERES_SERVER_MODEL_API_KEY","")) if name=="gemini" else False
        result.append({"provider":name,"configured":bool(row and row["secret_ciphertext"]) or legacy,
                       "enabled":bool(row["enabled"]) if row else bool(legacy)})
    return result

def _fernet() -> Fernet:
    raw=os.getenv("WEIGUO_VAULT_KEY","")
    try:
        key=base64.urlsafe_b64decode(raw)
        if len(key)!=32 or len(raw)!=44:
            raise ValueError("invalid key")
        return Fernet(raw.encode("ascii"))
    except (ValueError,TypeError,UnicodeError,binascii.Error) as exc:
        raise HTTPException(503,"尚未在後端配置加密金鑰 WEIGUO_VAULT_KEY") from exc

def store_provider_key(provider: str, secret: str, actor: int):
    if provider not in _PROVIDERS or not isinstance(secret,str) or not 20<=len(secret)<=4096 or secret.strip()!=secret or any(ord(c)<32 for c in secret):
        raise HTTPException(422,"無效的服務或憑證格式")
    cipher=_fernet().encrypt(secret.encode("utf-8"))
    with _session() as db:
        _setup(db)
        db.execute("""INSERT INTO ceres_admin_providers(provider,secret_ciphertext,enabled,updated_at)
                      VALUES(?,?,1,?) ON CONFLICT(provider) DO UPDATE SET
                      secret_ciphertext=excluded.secret_ciphertext,enabled=1,updated_at=excluded.updated_at""",
                   (provider,cipher,int(time.time())))
        _audit(db,actor,"rotate_provider",provider)
        db.commit()

def provider_key(provider: str) -> str|None:
    if provider not in _PROVIDERS:
        return None
    with _session() as db:
        _setup(db)
        row=db.execute("SELECT secret_ciphertext,enabled FROM ceres_admin_providers WHERE provider=?",(provider,)).fetchone()
    if not row:
        return None
    if not row["enabled"] or not row["secret_ciphertext"]:
        return None
    try:
        return _fernet().decrypt(row["secret_ciphertext"]).decode("utf-8")
    except (InvalidToken, UnicodeError) as exc:
        raise HTTPException(503,"服務金鑰解密失敗，請重新配置") from exc

def provider_enabled(provider: str) -> bool|None:
    with _session() as db:
        _setup(db)
        row=db.execute("SELECT enabled FROM ceres_admin_providers WHERE provider=?",(provider,)).fetchone()
    return bool(row["enabled"]) if row else None

def toggle_provider(provider: str, enabled: bool, actor: int):
    if provider not in _PROVIDERS:
        raise ValueError("unknown provider")
    with _session() as db:
        _setup(db)
        db.execute("""INSERT INTO ceres_admin_providers(provider,enabled,updated_at) VALUES(?,?,?)
          ON CONFLICT(provider) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at""",
          (provider,int(enabled),int(time.time())))
        _audit(db,actor,"provider_on" if enabled else "provider_off",provider)
        db.commit()
