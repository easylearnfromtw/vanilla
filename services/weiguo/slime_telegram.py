"""Owner-only, deterministic conversational controls for Slime via Ceres Telegram.

No LLM-generated SQL or execution. Only four known operations exist: status,
single-use invite, pause/resume, and revoke after a one-time confirmation.
Telegram is NOT an end-to-end encrypted secret store; invite links expire fast.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import time

from slime import _db, _digest, _safe_origin, MAX_ACTIVE_INVITES, INVITE_SECONDS, ONLINE_SECONDS

TTL = 180
STATE_TABLE = """CREATE TABLE IF NOT EXISTS slime_telegram_confirm (
    chat_id INTEGER PRIMARY KEY, owner TEXT NOT NULL, node_id TEXT NOT NULL,
    operation TEXT NOT NULL, code_hash TEXT NOT NULL, expires REAL NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
)"""
_AUDIT_TABLE = """CREATE TABLE IF NOT EXISTS slime_telegram_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, chat_id INTEGER NOT NULL,
    operation TEXT NOT NULL, node_id TEXT NOT NULL, happened_at REAL NOT NULL
)"""
_STATUS = re.compile(r"^(?:/nodes|/slime(?: status)?|節點狀態|電腦狀態|目前有哪些電腦|目前有幾台電腦|查看(?:所有)?(?:節點|電腦)|查詢(?:所有)?(?:節點|電腦)|有哪些(?:節點|電腦)|看一下(?:節點|電腦)|目前節點|Slime 狀態)$", re.I)
_INVITE = re.compile(r"^(?:/slime invite|/node invite|(?:請|幫我|麻煩)?(?:建立|產生|生成|給我|新增|創建)(?:一個|新的)?(?:朋友)?(?:加入)?(?:邀請|邀請碼|邀請連結|節點邀請)(?:碼|連結)?(?:給朋友)?|我要邀請朋友(?:加入)?|邀請朋友(?:加入)?|我想邀請朋友(?:加入)?)$", re.I)
_PAIR_CMD = re.compile(r"^(?:/(?:slime|node) (?:pair|code)|(?:請|幫我|麻煩)?(?:建立|產生|新增|給我)(?:一個|新的)?(?:節點)?(?:配對碼|節點密碼))$",re.I)
_MUTATE = re.compile(r"^(?:請|幫我|麻煩)?(?:把|將)?\s*(?P<name>.{1,90}?)\s*(?P<action>停用|暫停|停止共享|恢復|重新啟用|重新開啟|啟用|移除|刪除|撤銷)(?:節點|電腦)?$", re.I)
_PREFIX_MUTATE = re.compile(r"^(?P<action>停用|暫停|停止共享|恢復|重新啟用|重新開啟|啟用|移除|刪除|撤銷)(?:節點|電腦)?\s+(?P<name>.{1,90})$", re.I)
_INFER = re.compile(r"^/slime infer ([a-f0-9]{8,48}) (on|off)$",re.I)
_CONFIRM = re.compile(r"^確認\s+([A-Fa-f0-9]{8}|[A-Fa-f0-9]{12})$")
_CANCEL = re.compile(r"^(?:取消|算了|不要了)$")


def _owner_subject(chat_id: int, sub: str) -> bool:
    """Recheck the immutable Google subject/ACL link on *every* mutation."""
    try:
        links = json.loads(os.environ.get("CERES_FAMILY_LINKS_JSON", "{}"))
        acl = json.loads(os.environ.get("WEIGUO_FAMILY_ACL_JSON", "{}"))
    except (ValueError, TypeError):
        return False
    if not isinstance(links, dict) or not isinstance(acl, dict):
        return False
    record = acl.get(sub)
    return bool(links.get(str(chat_id)) == sub and isinstance(record, dict)
                and record.get("role") == "owner")


def _setup(db):
    db.execute(STATE_TABLE)
    db.execute(_AUDIT_TABLE)


def _audit(db, sub: str, chat: int, operation: str, node_id: str = ""):
    db.execute("INSERT INTO slime_telegram_audit(owner,chat_id,operation,node_id,happened_at)"
               " VALUES(?,?,?,?,?)", (sub, chat, operation, node_id, time.time()))


def _listing(sub: str) -> str:
    with _db() as db:
        rows = db.execute("SELECT id,label,role,last_seen,share_enabled,owner_enabled,inference_enabled,ram_gb,gpu"
                          " FROM nodes WHERE owner=? ORDER BY label", (sub,)).fetchall()
    if not rows:
        return "Slime 目前沒有已配對的電腦。你可以說「幫我建立朋友邀請碼」。"
    active = sum(time.time() - x["last_seen"] <= ONLINE_SECONDS for x in rows)
    lines = [f"Slime 目前 {len(rows)} 台節點，{active} 台有心跳（不代表正在推論）。"]
    for x in rows[:25]:
        online = "在線" if time.time() - x["last_seen"] <= ONLINE_SECONDS else "離線"
        allowed = "可參與" if x["owner_enabled"] and x["share_enabled"] else "已暫停"
        inference = "已核准推論" if x["inference_enabled"] else "推論關閉"
        lines.append(f"• {x['label']}｜{online}｜{allowed}｜{inference}｜RAM {x['ram_gb']:g}GB｜ID {x['id']}")
    if len(rows) > 25:
        lines.append(f"另有 {len(rows)-25} 台；目前只顯示前 25 台。")
    lines.append("目前只有節點註冊／心跳，尚未啟用 30B 分散式推論。")
    return "\n".join(lines)[:1200]


def _create_invite(sub: str, chat: int) -> dict | None:
    """Short-lived pair code, scoped to a verified Google Owner."""
    from slime import issue_short_pair
    try:
        result=issue_short_pair(sub)
    except Exception:
        return None
    with _db() as db:
        _setup(db)
        _audit(db,sub,chat,"invite")
    return result


def _invite(sub: str, chat: int) -> str:
    invite=_create_invite(sub,chat)
    if not invite:
        return "配對碼建立失敗；可能是邀請數量已達上限或 Slime 後端未就緒。"
    return ("Slime · 一次性配對碼\n"
            "節點配對碼（點按可複製）：\n"
            f"{invite['code']}\n\n"
            f"有效 {INVITE_SECONDS//60} 分鐘，僅能使用一次。\n"
            f"備用邀請連結：\n{invite['link']}\n\n"
            "在 Slime 安裝程式輸入短碼即可，不需要先打開連結。"
            " 使用朋友電腦前須取得持有人的明確同意。"
            " 此處不顯示裝置的長期 Token。")


def _lookup(db, sub: str, name: str):
    name = name.strip().strip("「」\"'")
    rows = db.execute("SELECT id,label FROM nodes WHERE owner=? AND (id=? OR label=?)",
                      (sub, name, name)).fetchall()
    return rows


def _confirm(sub: str, chat: int, code: str) -> str:
    # One gate is shared by Telegram, REST and the signed private Mini App.
    with _db() as db:
        _setup(db)
        pending = db.execute(
            "SELECT node_id,operation FROM slime_telegram_confirm WHERE chat_id=? AND owner=?",
            (chat, sub),
        ).fetchone()
    if pending and pending["operation"] == "revoke":
        from slime_revoke_gate import consume_revoke, RevokeDenied
        try:
            consume_revoke(sub, pending["node_id"], code, chat)
        except RevokeDenied as exc:
            return str(exc) + "；沒有刪除節點。"
        return "Telegram 驗證成功。已撤銷節點憑證並記錄操作。"
    with _db() as db:
        _setup(db)
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM slime_telegram_confirm WHERE chat_id=? AND owner=?",
                         (chat, sub)).fetchone()
        if not row or row["expires"] < time.time() or not hmac.compare_digest(
                row["code_hash"], hashlib.sha256(code.lower().encode()).hexdigest()):
            db.rollback()
            return "確認碼不正確或已逾時；沒有變更任何節點。"
        # Consume before changing. Node id and owner must still match.
        db.execute("DELETE FROM slime_telegram_confirm WHERE chat_id=?", (chat,))
        operation, node_id = row["operation"], row["node_id"]
        if operation == "revoke":
            db.rollback()
            return "刪除必須使用 Telegram 一次性代碼驗證。"
        elif operation in ("inference_on","inference_off"):
            cur = db.execute("UPDATE nodes SET inference_enabled=? WHERE id=? AND owner=?",
                             (int(operation=="inference_on"),node_id,sub))
        else:
            cur = db.execute("UPDATE nodes SET owner_enabled=? WHERE id=? AND owner=?",
                             (int(operation == "resume"), node_id, sub))
        if cur.rowcount != 1:
            db.commit()
            return "節點已不存在或不屬於目前帳號，操作未執行。"
        _audit(db, sub, chat, operation, node_id)
        db.commit()
    return {"pause": "已暫停節點；目前不會接受此節點的新計畫。",
            "resume": "已恢復節點的管理端允許狀態；仍由朋友自行決定是否共享。",
            "revoke": "已撤銷節點憑證；此設備必須重新取得邀請才能加入。",
            "inference_on": "已核准該節點提供推論。經 API Key 核准的提示可能傳送至此節點。",
            "inference_off": "已禁止該節點承接新的模型推論。"}[operation]


def handle_slime(chat: int, sub: str, message: str) -> str | None:
    """None => normal Ceres conversation; str => fully handled Slime response."""
    source = message.strip()
    cmd = re.fullmatch(r"/slime (?:delete|remove|revoke) ([a-f0-9]{24})", source, re.I)
    if cmd:
        source = "移除 " + cmd.group(1).lower()
    if not source or len(source) > 250:
        return None
    if not (_STATUS.fullmatch(source) or _INVITE.fullmatch(source) or _PAIR_CMD.fullmatch(source)
            or source.lower().startswith(("/slime", "/nodes", "/node "))
            or _INFER.fullmatch(source) or _CONFIRM.fullmatch(source) or _CANCEL.fullmatch(source)
            or _MUTATE.fullmatch(source) or _PREFIX_MUTATE.fullmatch(source)
            or "slime" in source.lower()
            or ("節點" in source and any(x in source for x in ("管理", "設定", "GPU", "RAM", "上限", "查看", "查詢", "邀請", "移除")))
            or ("電腦" in source and any(x in source for x in ("加入", "連線", "離線", "管理", "邀請", "停用", "恢復")))):
        return None
    if not _owner_subject(chat, sub):
        return "只有已驗證的 Telegram 擁有者能管理 Slime。"
    if os.environ.get("SLIME_ENABLED", "").lower() != "true":
        return "Slime 後端尚未啟用，未更動任何設定。"
    if _STATUS.fullmatch(source):
        return _listing(sub)
    if source.lower() in ("/slime help", "/node help", "/slime 設定", "/slime 設置"):
        return ("你可以直接說：「目前有哪些電腦」、「產生新配對碼」、"
                "「把『電腦名稱』暫停」、「恢復『電腦名稱』」、「移除『電腦名稱』」。"
                "\n核准本地模型：/slime infer <節點ID> on；撤回：/slime infer <節點ID> off。"
                "\n所有敏感操作都需要確認碼。")
    if _INVITE.fullmatch(source) or _PAIR_CMD.fullmatch(source):
        try:
            return _invite(sub, chat)
        except Exception:
            return "邀請建立失敗：請檢查 Slime HTTPS 網域與服務狀態。"
    if _CANCEL.fullmatch(source):
        with _db() as db:
            _setup(db)
            db.execute("DELETE FROM slime_telegram_confirm WHERE chat_id=? AND owner=?",
                       (chat, sub))
        return "已取消待確認操作，沒有變更節點。"
    confirm = _CONFIRM.fullmatch(source)
    if confirm:
        return _confirm(sub, chat, confirm.group(1))
    request=_INFER.fullmatch(source)
    if request:
        node_id,mode=request.group(1).lower(),request.group(2).lower()
        with _db() as db:
            _setup(db)
            nodes=_lookup(db,sub,node_id)
            if len(nodes)!=1:
                return "找不到該 Owner 旗下的節點，請先查看 /nodes 取得完整 ID。"
            code=secrets.token_hex(4)
            db.execute("INSERT OR REPLACE INTO slime_telegram_confirm"
                       "(chat_id,owner,node_id,operation,code_hash,expires)"
                       " VALUES(?,?,?,?,?,?)",
                       (chat,sub,nodes[0]["id"],
                        "inference_on" if mode=="on" else "inference_off",
                        hashlib.sha256(code.encode()).hexdigest(),time.time()+TTL))
        description="核准節點接收外部 API 使用者的模型提示" if mode=="on" else "停止此節點接受新模型任務"
        return (f"Slime · 安全確認\n{description}：{nodes[0]['label']}。\n"
                f"請於 {TTL//60} 分鐘內回覆「確認 {code}」，或回覆「取消」。目前尚未更動。")
    mutation = _MUTATE.fullmatch(source) or _PREFIX_MUTATE.fullmatch(source)
    if mutation:
        target = mutation.group("name").strip().removeprefix("的").strip()
        action = mutation.group("action")
        operation = ("revoke" if action in ("刪除", "移除", "撤銷")
                     else "resume" if action in ("恢復", "重新啟用", "重新開啟", "啟用")
                     else "pause")
        with _db() as db:
            _setup(db)
            nodes = _lookup(db, sub, target)
            if len(nodes) != 1:
                return "無法唯一識別節點；請先說「目前有哪些電腦」，再使用完整名稱或 ID。"
            code = secrets.token_hex(6) if operation == "revoke" else secrets.token_hex(4)
            db.execute("INSERT OR REPLACE INTO slime_telegram_confirm"
                       "(chat_id,owner,node_id,operation,code_hash,expires)"
                       " VALUES(?,?,?,?,?,?)",
                       (chat, sub, nodes[0]["id"], operation,
                        hashlib.sha256(code.encode()).hexdigest(), time.time()+TTL))
        labels = {"pause": "暫停", "resume": "恢復", "revoke": "永久撤銷"} 
        extra = ("\n此 Telegram 刪除碼也可輸入 Slime 私人 Mini App 的撤銷配對視窗；"
                 "最多錯誤 5 次，並綁定此節點。" if operation == "revoke" else "")
        return (f"準備{labels[operation]}節點「{nodes[0]['label']}」。\n"
                f"請在 {TTL//60} 分鐘內回覆「確認 {code}」執行，"
                "或回覆「取消」。目前尚未更動。" + extra)
    return "Slime 可以用自然語言操作。試著說「目前有哪些電腦」或「建立朋友邀請碼」。"
