"""Ceres Telegram Owner operations: safe diagnostics, alerts, approval, audit and reports.

No remote deployment, shell execution, biometric claims, credential reads or
paid model probes. Owner may inspect and approve narrowly defined settings.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from ceres_gateway import _session

_TZ = ZoneInfo("Asia/Taipei")
_KINDS = {"budget", "notifications", "daily_report"}
_PROVIDER = {"gemini", "openai", "deepseek"}
_SAFE_TASKS = {
    "health": "檢查 Telegram／Agent／模型狀態",
    "models": "檢查已記錄的模型實測紀錄",
    "nodes": "檢查 Slime 節點",
    "cost": "檢查已記錄的 API 用量與成本",
    "security": "檢查安全設定與近期變更",
    "deploy": "檢查目前服務版本資訊",
}
_WORKFLOW = {
    "巡檢": ("health", "models", "nodes"),
    "調查故障": ("health", "models", "security"),
    "成本分析": ("cost", "models"),
    "節點管理": ("nodes", "health"),
    "部署檢查": ("deploy", "health"),
}
_MAX_LOG = 35


def _tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_maint_settings(
      owner INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
      PRIMARY KEY(owner,key))""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_maint_pending(
      token TEXT PRIMARY KEY, owner INTEGER NOT NULL, operation TEXT NOT NULL,
      value TEXT NOT NULL, expires INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_maint_audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner INTEGER NOT NULL,
      action TEXT NOT NULL, at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_maint_job(
      id TEXT PRIMARY KEY, owner INTEGER NOT NULL, kind TEXT NOT NULL,
      state TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_maint_events(
      owner INTEGER NOT NULL, code TEXT NOT NULL, seen_at INTEGER NOT NULL,
      last_sent_at INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL,
      PRIMARY KEY(owner,code))""")
    db.execute("""CREATE TABLE IF NOT EXISTS ceres_maint_reports(
      owner INTEGER NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL,
      PRIMARY KEY(owner,day,kind))""")


def _owner(chat: int) -> bool:
    from ceres_admin_bot import owner_subject
    return type(chat) is int and owner_subject(chat) is not None


def _require(chat: int):
    if not _owner(chat):
        raise PermissionError("Ceres Owner required")


def audit(chat: int, action: str):
    _require(chat)
    if action not in ({"approve_budget","approve_notifications","approve_daily_report",
                       "view_audit","view_jobs","create_workflow","view_incidents",
                       "view_deploy","view_security","view_nodes","view_report","view_health",
                       "view_budget","view_backups","view_approvals","cancel_workflow"}):
        return
    with _session() as db:
        _tables(db)
        db.execute("INSERT INTO ceres_maint_audit(owner,action,at) VALUES(?,?,?)",
                   (chat,action,int(time.time())))
        db.execute("DELETE FROM ceres_maint_audit WHERE at<?",(int(time.time())-90*86400,))


def setting(chat: int, key: str, default: str="off") -> str:
    _require(chat)
    with _session() as db:
        _tables(db)
        row=db.execute("SELECT value FROM ceres_maint_settings WHERE owner=? AND key=?",
                       (chat,key)).fetchone()
    return row["value"] if row else default


def request_change(chat: int, kind: str, value: str) -> str:
    _require(chat)
    if kind not in _KINDS:
        raise ValueError("Unsupported setting")
    if kind=="budget":
        if not re.fullmatch(r"(?:0|[1-9][0-9]{0,3})(?:\.[0-9]{1,2})?",value):
            raise ValueError("請使用 0–9999 美元的小數額度")
        if float(value)>9999:
            raise ValueError("額度過大")
    elif value not in {"on","off"}:
        raise ValueError("僅允許 on／off")
    token=secrets.token_urlsafe(16)
    with _session() as db:
        _tables(db)
        db.execute("DELETE FROM ceres_maint_pending WHERE expires<?",(int(time.time()),))
        db.execute("INSERT INTO ceres_maint_pending VALUES(?,?,?,?,?)",
                   (token,chat,kind,value,int(time.time())+120))
    return token


def approve(chat: int, token: str) -> str:
    _require(chat)
    if not isinstance(token,str) or not re.fullmatch(r"[A-Za-z0-9_-]{15,35}",token):
        raise ValueError("無效的確認")
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT operation,value FROM ceres_maint_pending "
                       "WHERE token=? AND owner=? AND expires>?",
                       (token,chat,int(time.time()))).fetchone()
        if row is None:
            raise ValueError("操作已過期或不可用")
        db.execute("DELETE FROM ceres_maint_pending WHERE token=? AND owner=?",
                   (token,chat))
        key,value=row["operation"],row["value"]
        db.execute("INSERT INTO ceres_maint_settings(owner,key,value) VALUES(?,?,?) "
                   "ON CONFLICT(owner,key) DO UPDATE SET value=excluded.value",
                   (chat,key,value))
        db.execute("INSERT INTO ceres_maint_audit(owner,action,at) VALUES(?,?,?)",
                   (chat,"approve_"+key,int(time.time())))
    return {"budget":"預算防護額度","notifications":"主動異常通知",
            "daily_report":"每日摘要"}[key]+"已更新："+value


def _known_usage():
    from ceres_model_ops import summary
    s=summary()
    rows=s.get("providers",[])
    total=sum(float(p["estimated_usd"] or 0) for p in rows)
    unknown=sum(int(p.get("unpriced") or 0) for p in rows)
    return round(total,5),unknown,len(rows)


def budget_state(chat: int) -> dict:
    """An incomplete token/pricing ledger must NEVER be shown as a full invoice."""
    _require(chat)
    ceiling=float(setting(chat,"budget","0"))
    spent,unpriced,providers=_known_usage()
    enforced=ceiling>0 and unpriced==0
    return {"limitUsd":ceiling,"knownEstimateUsd":spent,"unpricedCalls":unpriced,
            "providersRecorded":providers,"hardStopEligible":enforced,
            "overLimit":enforced and spent>=ceiling,
            "note":"只涵蓋 Ceres 已記錄且有價格的 API 使用；非供應商帳單。"
                   if unpriced==0 else "部分呼叫無法計價，因此無法可靠強制 USD 上限。"}


def model_call_allowed(chat: int) -> bool:
    """Fail-open for missing/partial pricing; hard stop only when *all* recorded calls are priced.

    The guard is configured per Owner; does not change default worker behavior.
    """
    if not _owner(chat):
        return True
    st=budget_state(chat)
    return not st["overLimit"]


def overview(chat: int) -> dict:
    _require(chat)
    from ceres_model_ops import dashboard
    from ceres_server_agent import ready,enabled
    state=dashboard()
    telegram=state.get("telegram",{})
    agent=state.get("agent",{})
    issues=[]
    if enabled() and not ready(): issues.append("agent_not_ready")
    # Historical successful send != end-to-end device delivery.
    if telegram.get("webhookConfigured") and not telegram.get("lastVerifiedReplyAt"):
        issues.append("reply_not_verified")
    with _session() as db:
        _tables(db)
        from ceres_agent_bridge import setup as setup_jobs
        setup_jobs(db)
        recent=db.execute("SELECT status,COUNT(*) n FROM ceres_agent_jobs "
                          "WHERE updated_at>? GROUP BY status",
                          (int(time.time())-86400,)).fetchall()
    failures={x["status"]:x["n"] for x in recent
              if x["status"] in ("delivery_unknown","model_unavailable","model_not_configured")}
    if failures: issues.append("recent_agent_failures")
    return {"issues":issues,"recentFailures":failures,
            "telegram":telegram,"agentReady":ready(),"agentEnabled":enabled(),
            "modelProbeSuccess":sum(1 for x in state.get("probes",[]) if x.get("ok")),
            "generatedAt":int(time.time()),"liveTelegramEcho":False}


def version(chat: int) -> dict:
    _require(chat)
    # Railway provenance from platform-injected env, never invented.
    sha=os.getenv("RAILWAY_GIT_COMMIT_SHA","")
    deploy=os.getenv("RAILWAY_DEPLOYMENT_ID","")
    return {"commit":sha[:40] if re.fullmatch(r"[a-fA-F0-9]{40}",sha) else "unknown",
            "deploymentId":deploy if len(deploy)<80 and re.fullmatch(r"[a-zA-Z0-9_-]{4,79}",deploy) else "unknown",
            "rollbackSupported":False,
            "note":"Railway 版本僅在注入部署中繼資料時可見。回滾需透過已授權部署服務驗證並確認，"
                   "此聊天機器人不儲存 GitHub／Railway 管理 Token，也不假裝已部署。"}


def node_snapshot(chat: int) -> str:
    _require(chat)
    from slime_telegram import _listing
    from ceres_admin_bot import owner_subject
    return _listing(owner_subject(chat))


def security(chat: int) -> dict:
    _require(chat)
    from ceres_admin_policy import enforce,accounts,provider_status
    providers=provider_status()
    enabled_count=sum(1 for x in accounts() if x.get("enabled"))
    audit(chat,"view_security")
    return {"gmailEnforced":bool(enforce()),"enabledAccounts":enabled_count,
            "providerConfigured":sum(1 for x in providers if x.get("configured") and x.get("enabled")),
            "providerTotal":len(providers),"ownerChecked":True,
            "biometricVerified":False,
            "note":"Telegram 原生聊天無法直接驗證 Face ID；高風險操作維持 Owner 確認。"}


def workflow_plan(chat: int, intent: str) -> dict:
    _require(chat)
    if intent not in _WORKFLOW: raise ValueError("未知的工作流程")
    steps=[{"tool":s,"description":_SAFE_TASKS[s],"mode":"read_only"} for s in _WORKFLOW[intent]]
    return {"intent":intent,"steps":steps,"privilegedExecution":False,
            "note":"Diana 僅選擇並執行已授權的唯讀診斷，不得發佈程式或變更權限。"}


def run_workflow(chat: int, intent: str) -> dict:
    """Finite deterministic DAG with persisted history, no remote side effects."""
    plan=workflow_plan(chat,intent)
    jobid=secrets.token_hex(5)
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("INSERT INTO ceres_maint_job VALUES(?,?,?,?,?,?)",
                   (jobid,chat,intent,"running","",now))
    results=[]
    for step in plan["steps"]:
        name=step["tool"]
        try:
            if name=="health":
                value="診斷碼："+(",".join(overview(chat)["issues"]) or "無已知告警")
            elif name=="models":
                from ceres_model_ops import diagnostics
                value=str(len(diagnostics()["modelChecks"]))+" 筆模型實測紀錄"
            elif name=="nodes":
                value=node_snapshot(chat).split("\n",1)[0][:120]
            elif name=="cost":
                st=budget_state(chat)
                value="有價估算 US$"+str(st["knownEstimateUsd"])+"；未計價 "+str(st["unpricedCalls"])+" 筆"
            elif name=="security":
                result=security(chat)
                value="白名單："+("強制" if result["gmailEnforced"] else "未強制")
            else:
                value="部署版本："+version(chat)["commit"][:12]
            results.append(name+" ✓ "+value)
        except (ValueError,TypeError,KeyError,RuntimeError) as exc:
            results.append(name+" ✕ 查詢不可用")
    summary="\n".join(results)[:1800]
    with _session() as db:
        _tables(db)
        db.execute("UPDATE ceres_maint_job SET state=?,result=? WHERE id=? AND owner=?",
                   ("completed",summary,jobid,chat))
        db.execute("DELETE FROM ceres_maint_job WHERE at<?",(now-30*86400,))
    audit(chat,"create_workflow")
    return {"id":jobid,"state":"completed","result":summary,"steps":len(results)}


def jobs(chat: int) -> list[dict]:
    _require(chat)
    with _session() as db:
        _tables(db)
        rows=db.execute("SELECT id,kind,state,result,at FROM ceres_maint_job "
                        "WHERE owner=? ORDER BY at DESC LIMIT 8",(chat,)).fetchall()
    return [dict(x) for x in rows]


def audit_log(chat: int) -> list[dict]:
    _require(chat)
    with _session() as db:
        _tables(db)
        rows=db.execute("SELECT action,at FROM ceres_maint_audit "
                        "WHERE owner=? ORDER BY id DESC LIMIT ?",(chat,_MAX_LOG)).fetchall()
    return [dict(x) for x in rows]


def report(chat: int) -> str:
    _require(chat)
    health=overview(chat)
    budget=budget_state(chat)
    nodes=node_snapshot(chat).split("\n",1)[0]
    return ("Ceres · 安全營運摘要\n"
            "Agent："+("就緒" if health["agentReady"] else "待確認")+"\n"
            "告警："+(", ".join(health["issues"]) or "無已知異常")+"\n"
            "模型歷史成功檢測："+str(health["modelProbeSuccess"])+"\n"
            "Slime："+nodes[:140]+"\n"
            "有價估算：US$"+str(budget["knownEstimateUsd"])+"\n"
            "未計價呼叫："+str(budget["unpricedCalls"])+"\n"
            "非供應商帳單；Telegram 是否真正收到訊息仍需實機驗收。")


def backup_guidance(chat: int) -> str:
    _require(chat)
    # SQLite integrity proof is NOT a remotely restorable backup.
    try:
        with _session() as db:
            result=db.execute("PRAGMA quick_check(1)").fetchone()
        integrity=(result[0]=="ok") if result else False
    except Exception:
        integrity=False
    vault=bool(os.getenv("WEIGUO_VAULT_KEY",""))
    return ("備份／復原檢查\n"
            "• SQLite 完整性："+("通過" if integrity else "未通過／無法檢查")+"\n"
            "• Vault 解密金鑰已配置："+("是" if vault else "否")+"（不顯示內容）\n"
            "• SQLite 完整 ≠ 異地備份；目前未自動外傳。\n"
            "• 復原前需要獨立加密備份、加密金鑰與完整驗證。\n"
            "• 未設定已授權的加密目的地，不可宣稱已完成自動備份。")


async def watch_tick(chat: int) -> list[str]:
    """Only probes local existing state; never invokes billable providers or deployment APIs."""
    _require(chat)
    current=set(overview(chat)["issues"])
    if budget_state(chat)["overLimit"]:
        current.add("known_budget_limit")
    notices=[]
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        active=db.execute("SELECT code,seen_at,last_sent_at,active FROM ceres_maint_events "
                          "WHERE owner=?",(chat,)).fetchall()
        known={v["code"]:v for v in active}
        for code in sorted(current):
            row=known.get(code)
            if row is None:
                # Initial observation is a baseline, not an alarm flood.
                db.execute("INSERT INTO ceres_maint_events VALUES(?,?,?,?,?)",
                           (chat,code,now,0,1))
                continue
            if not row["active"]:
                db.execute("UPDATE ceres_maint_events SET active=1,seen_at=?,last_sent_at=0 "
                           "WHERE owner=? AND code=?",(now,chat,code))
            elif now-int(row["last_sent_at"])>=3600 and now-int(row["seen_at"])>=300:
                db.execute("UPDATE ceres_maint_events SET last_sent_at=? WHERE owner=? AND code=?",
                           (now,chat,code))
                notices.append(code)
        for code in known.keys()-current:
            db.execute("UPDATE ceres_maint_events SET active=0 WHERE owner=? AND code=?",(chat,code))
    return notices


async def monitor_loop():
    """Opt-in server loop; persistent cooldown avoids repeat alerts on restart."""
    from ceres_gateway import _allowed_chat_ids
    from ceres_admin_bot import _telegram
    if os.getenv("CERES_MAINTENANCE_ENABLED","false").lower()!="true":
        return
    print("Ceres maintenance: enabled",flush=True)
    while True:
        try:
            from ceres_admin_bot import owner_subject
            owners=[chat for chat in _allowed_chat_ids() if owner_subject(chat)]
            for chat in owners[:5]:
                if setting(chat,"notifications","off")=="on":
                    for code in await watch_tick(chat):
                        await _telegram("sendMessage",{
                            "chat_id":chat,
                            "text":"Ceres 巡檢告警\n診斷碼："+code+
                                   "\n使用 /hub health 查看；本通知不會自動部署或修復。",
                            "disable_web_page_preview":True})
                if setting(chat,"daily_report","off")=="on":
                    now=datetime.now(_TZ)
                    if now.hour==8:
                        day=now.date().isoformat()
                        with _session() as db:
                            _tables(db)
                            db.execute("BEGIN IMMEDIATE")
                            cur=db.execute("INSERT OR IGNORE INTO ceres_maint_reports VALUES(?,?,?)",
                                           (chat,day,"daily"))
                        if cur.rowcount:
                            await _telegram("sendMessage",{
                                "chat_id":chat,"text":report(chat)[:3000],
                                "disable_web_page_preview":True})
        except asyncio.CancelledError:
            raise
        except Exception:
            # Fail without leaking credentials or prompts.
            print("Ceres maintenance: safe tick failure",flush=True)
        await asyncio.sleep(300)
