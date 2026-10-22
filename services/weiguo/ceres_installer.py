"""Ceres installer: original, local-only bootstrap and redacted configuration doctor.

This file does not import or execute Wiz-Installer or install a Telegram bot.
It never registers webhooks, contacts Telegram, changes ACLs, or starts services.
All generated credentials are written once to a private local file.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets
import stat
from typing import Mapping
from public_origin import valid_ceres_webhook

TOKEN_RE = re.compile(r"^[0-9]{5,15}:[A-Za-z0-9_-]{30,80}$")
SECRET_RE = re.compile(r"^[A-Za-z0-9_-]{32,256}$")
NAME_RE = re.compile(r"^[A-Za-z0-9_]{5,32}$")
SUB_RE = re.compile(r"^[0-9]{8,40}$")
CHAT_RE = re.compile(r"^[0-9]{1,20}$")
KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")
WEBHOOK_PATH = "/v1/ceres/telegram/webhook"


def _mapping(raw: str) -> dict:
    try:
        result = json.loads(raw)
        return result if isinstance(result, dict) and len(result) <= 30 else {}
    except (ValueError, TypeError):
        return {}


def _owner_binding(env: Mapping[str, str]) -> bool:
    chats = env.get("CERES_TELEGRAM_CHAT_IDS", "").split(",")
    if len(chats) != 1 or not CHAT_RE.fullmatch(chats[0]) or not 0 < int(chats[0]) < 2**63:
        return False
    links = _mapping(env.get("CERES_FAMILY_LINKS_JSON", ""))
    acl = _mapping(env.get("WEIGUO_FAMILY_ACL_JSON", ""))
    if len(links) != 1:
        return False
    subject = links.get(chats[0])
    return bool(
        isinstance(subject, str)
        and SUB_RE.fullmatch(subject)
        and isinstance(acl.get(subject), dict)
        and acl[subject].get("role") == "owner"
        and env.get("CERES_OWNER_ONLY", "").lower() == "true"
    )


def _webhook_url(value: str, env: Mapping[str, str] | None = None) -> bool:
    return valid_ceres_webhook(value, env)


def _vault_valid(value: str) -> bool:
    try:
        return len(value) == 44 and len(base64.urlsafe_b64decode(value.encode("ascii"))) == 32
    except (ValueError, UnicodeError):
        return False


def inspect_settings(env: Mapping[str, str] | None = None) -> list[tuple[str, bool, str]]:
    """Only fixed labels and hints; no credential, URL, ID, or email is returned."""
    cfg = os.environ if env is None else env
    admin = cfg.get("WEIGUO_ADMIN_TOKEN", "")
    session = cfg.get("WEIGUO_SESSION_SECRET", "")
    telegram = cfg.get("CERES_TELEGRAM_WEBHOOK_SECRET", "")
    db_path = cfg.get("CERES_DB_PATH", "")
    return [
        ("Ceres 已啟用", cfg.get("CERES_ENABLED", "").lower() == "true",
         "尚未開啟服務旗標"),
        ("Telegram Bot 身分", bool(TOKEN_RE.fullmatch(cfg.get("CERES_TELEGRAM_BOT_TOKEN", "")))
         and bool(NAME_RE.fullmatch(cfg.get("CERES_TELEGRAM_EXPECTED_USERNAME", ""))),
         "請配置 Bot Token 與預期帳號名稱"),
        ("Webhook HTTPS 地址", _webhook_url(cfg.get("CERES_TELEGRAM_WEBHOOK_URL", ""), cfg),
         "需為受信任主機的精確 HTTPS Webhook 路徑"),
        ("Webhook 驗證密鑰", bool(SECRET_RE.fullmatch(telegram)),
         "請使用獨立隨機密鑰"),
        ("Google Owner 身分綁定", _owner_binding(cfg),
         "需單一 Telegram 私聊 ID 綁定已驗證 Google owner sub"),
        ("後端工作階段密鑰", len(admin) >= 32 and len(session) >= 32
         and admin != session and session != telegram and admin != telegram,
         "Admin 與 Session 密鑰需不同且至少 32 字元"),
        ("加密金鑰庫", _vault_valid(cfg.get("WEIGUO_VAULT_KEY", "")),
         "需設定獨立 32-byte Fernet 金鑰"),
        ("持久化資料庫位置", Path(db_path).is_absolute()
         and not (db_path == "/tmp" or db_path.startswith("/tmp/")),
         "需使用私有持久卷，且不可放在 /tmp"),
        ("公開端點防護", cfg.get("WEIGUO_PUBLIC_FAMILY_ONLY", "").lower() == "true",
         "公開後台實例應啟用 family-only 邊界"),
    ]


def redacted_summary(env: Mapping[str, str] | None = None) -> str:
    rows = inspect_settings(env)
    passed = sum(int(ok) for _, ok, _ in rows)
    details = "\n".join(("● " if ok else "○ ") + title for title, ok, _ in rows)
    return (
        f"Ceres Installer · 安裝配置巡檢 {passed}/{len(rows)}\n"
        + details
        + "\n\n僅檢查設定，不代表 Telegram Webhook、模型、節點已連線。"
        + "\n敏感資料請在伺服器私密環境管理；不得貼進聊天。"
    )


def create_private_template(path: Path) -> None:
    """Fail if file exists (including symlink); never overwrite or print secrets."""
    admin = secrets.token_urlsafe(48)
    session = secrets.token_urlsafe(48)
    webhook_secret = secrets.token_urlsafe(40)
    vault = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii")
    content = "\n".join([
        "# PRIVATE server configuration. Do NOT commit, send to Telegram, or serve over HTTP.",
        "# Supply Telegram/Google IDs only after independent verification.",
        "CERES_ENABLED=false",
        "CERES_OWNER_ONLY=true",
        "CERES_TELEGRAM_REGISTER_WEBHOOK=false",
        "CERES_OUTBOUND_ENABLED=false",
        "CERES_SERVER_AGENT_ENABLED=false",
        "WEIGUO_PUBLIC_FAMILY_ONLY=true",
        "WEIGUO_ADMIN_TOKEN=" + admin,
        "WEIGUO_SESSION_SECRET=" + session,
        "WEIGUO_VAULT_KEY=" + vault,
        "CERES_TELEGRAM_WEBHOOK_SECRET=" + webhook_secret,
        "CERES_TELEGRAM_BOT_TOKEN=",
        "CERES_TELEGRAM_EXPECTED_USERNAME=",
        "CERES_TELEGRAM_WEBHOOK_URL=",
        "CERES_TELEGRAM_CHAT_IDS=",
        "CERES_FAMILY_LINKS_JSON={}",
        "WEIGUO_FAMILY_ACL_JSON={}",
        "CERES_DB_PATH=/data/ceres-events.sqlite3",
        "",
    ])
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o600)
    try:
        if hasattr(os, "fchmod"):
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            fd = -1
            stream.write(content)
    except BaseException:
        if fd >= 0:
            os.close(fd)
        path.unlink(missing_ok=True)
        raise


def load_private_env(path: Path) -> dict[str, str]:
    """Literal KEY=VALUE parser. It never executes dotenv content as shell code."""
    if path.is_symlink():
        raise ValueError("Refusing symlinked configuration")
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > 65536:
        raise ValueError("Configuration must be a small regular file")
    if os.name == "posix" and stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError("Configuration permissions must be 0600")
    loaded: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key, sep, value = stripped.partition("=")
        if not sep or not KEY_RE.fullmatch(key) or key in loaded:
            raise ValueError("Invalid or duplicate configuration key")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        loaded[key] = value
    return loaded


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ceres safe, local-only installer")
    sub = parser.add_subparsers(dest="action", required=True)
    init = sub.add_parser("init", help="create private credentials once; never deploy")
    init.add_argument("--file", required=True, type=Path)
    doctor = sub.add_parser("doctor", help="redacted configuration check; no network")
    doctor.add_argument("--env-file", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action == "init":
            create_private_template(args.file)
            print("已建立私密設定檔（0600）；不顯示密鑰，未啟用服務或 Webhook。")
            return 0
        settings = load_private_env(args.env_file) if args.env_file else os.environ
        print(redacted_summary(settings))
        return 0 if all(ok for _, ok, _ in inspect_settings(settings)) else 2
    except (OSError, UnicodeError, ValueError):
        print("設定檔建立或讀取失敗；未顯示檔案內容或密鑰。")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
