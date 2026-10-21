"""One-time Telegram proof required for *owner-initiated* Slime node deletion.

A device holder can always leave locally; this gate does not block OS uninstall.
Confirmation is bound to owner, node, Telegram chat and operation, is single-use,
expires after three minutes, and is invalid after five incorrect attempts.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import time


class RevokeDenied(Exception):
    def __init__(self, message: str = "Telegram 刪除碼錯誤、已過期或操作不存在", status: int = 403):
        super().__init__(message)
        self.status = status


def consume_revoke(owner: str, node_id: str, code: str, chat_id: int | None = None) -> None:
    """Atomically verify a bot-issued proof, revoke the node and audit it.

    Only Telegram can issue confirmations, via slime_telegram.handle_slime().
    Callers MUST first verify the Owner (FamilyIdentity or signed Mini App).
    Invalid proofs never revoke any device.
    """
    from slime import _db
    from slime_telegram import _setup, _audit, _owner_subject

    if not isinstance(owner, str) or not isinstance(node_id, str) or not 8 <= len(node_id) <= 48:
        raise RevokeDenied()
    with _db() as db:
        _setup(db)
        # Lock before migrating and checking the proof; parallel requests
        # cannot both consume a code or race to add the attempts column.
        db.execute("BEGIN IMMEDIATE")
        fields = {r["name"] for r in db.execute("PRAGMA table_info(slime_telegram_confirm)")}
        if "attempts" not in fields:
            db.execute("ALTER TABLE slime_telegram_confirm ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0")
        sql = ("SELECT * FROM slime_telegram_confirm "
               "WHERE owner=? AND node_id=? AND operation='revoke'")
        params: tuple = (owner, node_id)
        if chat_id is not None:
            sql += " AND chat_id=?"
            params += (chat_id,)
        rows = db.execute(sql, params).fetchall()
        # A code cannot ambiguously authorize different owner chats.
        if len(rows) != 1:
            db.rollback()
            raise RevokeDenied()
        row = rows[0]
        now = time.time()
        if row["expires"] <= now or row["attempts"] >= 5:
            db.execute("DELETE FROM slime_telegram_confirm WHERE chat_id=?",
                       (row["chat_id"],))
            db.commit()
            raise RevokeDenied()
        if not _owner_subject(row["chat_id"], owner):
            db.execute("DELETE FROM slime_telegram_confirm WHERE chat_id=?",
                       (row["chat_id"],))
            db.commit()
            raise RevokeDenied("Telegram Owner 授權已失效")
        # Newly issued delete codes contain 48 bits of randomness; legacy 8-hex
        # codes remain valid only for their original three-minute lifetime.
        candidate = hashlib.sha256(
            code.lower().encode("ascii", "ignore")
            if isinstance(code, str) and len(code) <= 64 else b"invalid"
        ).hexdigest()
        valid = bool(isinstance(code, str) and
                     re.fullmatch(r"[a-fA-F0-9]{8}|[a-fA-F0-9]{12}", code) and
                     hmac.compare_digest(candidate, row["code_hash"]))
        if not valid:
            failures = row["attempts"] + 1
            if failures >= 5:
                db.execute("DELETE FROM slime_telegram_confirm WHERE chat_id=?",
                           (row["chat_id"],))
            else:
                db.execute("UPDATE slime_telegram_confirm SET attempts=? WHERE chat_id=?",
                           (failures, row["chat_id"]))
            db.commit()
            raise RevokeDenied(
                "刪除碼驗證失敗；輸錯 5 次將作廢，請重新從 Telegram 取得",
                429 if failures >= 5 else 403,
            )
        updated = db.execute("DELETE FROM nodes WHERE id=? AND owner=?", (node_id, owner))
        if updated.rowcount != 1:
            db.rollback()
            raise RevokeDenied("節點已不存在或不屬於此帳號", 404)
        db.execute("DELETE FROM slime_telegram_confirm WHERE chat_id=?", (row["chat_id"],))
        _audit(db, owner, row["chat_id"], "revoke_telegram_verified", node_id)
        db.commit()
