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
    operation TEXT NOT NULL, code_hash TEXT NOT NULL, expires REAL NOT NULL
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
_LOAD = re.compile(r"^/slime load ([a-f0-9]{24}) (10|25|50|75|100)$",re.I)
_TEMP = re.compile(r"^/slime temp ([a-f0-9]{24}) ([0-9]{2})$",re.I)
_POWER = re.compile(r"^/slime power ([a-f0-9]{24}) (off|on)$",re.I)
_CONFIRM = re.compile(r"^確認\s+([A-Fa-f0-9]{8})$")
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
    from slime_ops import score
    with _db() as db:
        rows=db.execute("""SELECT id,label,role,last_seen,share_enabled,owner_enabled,
            inference_enabled,cpu,ram_gb,gpu,os,pair_number,max_load_pct,thermal_limit_c,
            gpu_temp_c,geo_opt_in,geo_area,public_ip FROM nodes
            WHERE owner=? ORDER BY pair_number,label""",(sub,)).fetchall()
    if not rows:
        return "Slime 目前沒有已配對的電腦。請按「＋ 產生新節點配對碼」。"
    active=sum(time.time()-n["last_seen"]<=ONLINE_SECONDS for n in rows)
    lines=[f"Slime 網路：{len(rows)} 個已綁定節點，{active} 個心跳在線。"]
    for n in rows[:12]:
        online="在線" if time.time()-n["last_seen"]<=ONLINE_SECONDS else "離線"
        permitted="可共享" if n["owner_enabled"] and n["share_enabled"] else "暫停"
        inference="推論已授權" if n["inference_enabled"] else "推論未授權"
        temp=(f'{n["gpu_temp_c"]:g}°C' if n["gpu_temp_c"] is not None else "溫度未回報")
        location=(n["geo_area"] or "地區待查") if n["geo_opt_in"] else "位置未授權"
        lines.append(
            f'第{n["pair_number"]}個：{n["label"]}｜{online}｜{permitted}｜{inference}\n'
            f'裝置評分 {score(n["cpu"],n["ram_gb"],n["gpu"])}/10000（估算）'
            f'｜RAM {n["ram_gb"]:g}GB｜GPU {temp}｜負載 {n["max_load_pct"]}%'
            f'｜IP約略位置 {location}\nID {n["id"]}'
        )
    if len(rows)>12:
        lines.append(f"尚有 {len(rows)-12} 台，可從 Telegram Mini App 查看全部。")
    lines.append("即使在線，也必須實際模型測試成功才算可用。")
    return "\n".join(lines)[:3500]


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
            cur = db.execute("DELETE FROM nodes WHERE id=? AND owner=?", (node_id, sub))
        elif operation.startswith("load_"):
            level=int(operation[5:])
            cur=db.execute("UPDATE nodes SET max_load_pct=? WHERE id=? AND owner=?",
                           (level,node_id,sub))
        elif operation.startswith("temp_"):
            level=int(operation[5:])
            cur=db.execute("UPDATE nodes SET thermal_limit_c=? WHERE id=? AND owner=?",
                           (level,node_id,sub))
        elif operation=="power_off":
            cur=db.execute("""UPDATE nodes SET pending_power_off=? WHERE id=? AND owner=?
                     AND shutdown_opt_in=1""",(time.time()+90,node_id,sub))
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
    if operation.startswith("load_"):
        return "已調整節點可用負載級別為 "+operation[5:]+"%。派工優先順序與工作間隔會同步生效。"
    if operation.startswith("temp_"):
        return "GPU 過熱保護門檻已設為 "+operation[5:]+"°C；未回報溫度的裝置無法提供溫控保證。"
    if operation=="power_off":
        return "已要求已授權節點關機（90 秒內交付，節點收到後延遲 60 秒）；如未在線或 OS 拒絕則不會關閉。"
    return {"pause": "已暫停節點；目前不會接受此節點的新計畫。",
            "resume": "已恢復節點的管理端允許狀態；仍由朋友自行決定是否共享。",
            "revoke": "已撤銷節點憑證；此設備必須重新取得邀請才能加入。",
            "inference_on": "已核准該節點提供推論。經 API Key 核准的提示可能傳送至此節點。",
            "inference_off": "已禁止該節點承接新的模型推論。"}[operation]


def handle_slime(chat: int, sub: str, message: str) -> str | None:
    """None => normal Ceres conversation; str => fully handled Slime response."""
    source = message.strip()
    if not source or len(source) > 250:
        return None
    if not (_STATUS.fullmatch(source) or _INVITE.fullmatch(source) or _PAIR_CMD.fullmatch(source)
            or source.lower().startswith(("/slime", "/nodes", "/node "))
            or _INFER.fullmatch(source) or _LOAD.fullmatch(source)
            or _TEMP.fullmatch(source) or _POWER.fullmatch(source)
            or _CONFIRM.fullmatch(source) or _CANCEL.fullmatch(source)
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
                "\n降低負載：/slime load <節點ID> 25|50|75|100"
                "\n溫度上限：/slime temp <節點ID> 75"
                "\n已授權關機：/slime power <節點ID> off"
                "\n開機需要事先設定合規 WoL／常駐喚醒設備，無法憑 Telegram 讓關機電腦直接通電。"
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
    control=_LOAD.fullmatch(source) or _TEMP.fullmatch(source) or _POWER.fullmatch(source)
    if control:
        node_id=control.group(1).lower()
        number=control.group(2).lower()
        is_load=bool(_LOAD.fullmatch(source))
        is_temp=bool(_TEMP.fullmatch(source))
        if is_temp and not 60<=int(number)<=95:
            return "溫控上限須在 60–95°C 之間。"
        if not is_load and not is_temp and number=="on":
            return "無法直接遠端開機：主機已關機時沒有連線。需事先安裝並授權同網段 WoL 中繼或管理設備；目前不提供假開機按鈕。"
        operation=("load_"+number if is_load else "temp_"+number if is_temp else "power_off")
        with _db() as db:
            _setup(db)
            record=db.execute("SELECT id,label,shutdown_opt_in FROM nodes WHERE owner=? AND id=?",
                              (sub,node_id)).fetchone()
            if not record:
                return "找不到該 Owner 的節點。請先查看 /nodes。"
            if operation=="power_off" and not record["shutdown_opt_in"]:
                return "這台裝置尚未在本機同意遠端關機，Telegram 無法強行關閉它。"
            code=secrets.token_hex(4)
            db.execute("""INSERT OR REPLACE INTO slime_telegram_confirm
                 (chat_id,owner,node_id,operation,code_hash,expires)
                 VALUES(?,?,?,?,?,?)""",
                 (chat,sub,node_id,operation,hashlib.sha256(code.encode()).hexdigest(),
                  time.time()+TTL))
        label=("負載 "+number+"%" if is_load else "GPU 溫控 "+number+"°C"
               if is_temp else "遠端關機（本機同意，60 秒取消期）")
        return (f"準備調整「{record['label']}」：{label}。\n"
                f"請於 {TTL//60} 分鐘內回覆「確認 {code}」，或回覆「取消」。尚未執行。")
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
            code = secrets.token_hex(4)
            db.execute("INSERT OR REPLACE INTO slime_telegram_confirm"
                       "(chat_id,owner,node_id,operation,code_hash,expires)"
                       " VALUES(?,?,?,?,?,?)",
                       (chat, sub, nodes[0]["id"], operation,
                        hashlib.sha256(code.encode()).hexdigest(), time.time()+TTL))
        labels = {"pause": "暫停", "resume": "恢復", "revoke": "永久撤銷"} 
        return (f"準備{labels[operation]}節點「{nodes[0]['label']}」。\n"
                f"請在 {TTL//60} 分鐘內回覆「確認 {code}」執行，"
                "或回覆「取消」。目前尚未更動。")
    return "Slime 可以用自然語言操作。試著說「目前有哪些電腦」或「建立朋友邀請碼」。"
