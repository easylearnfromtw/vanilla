"""Slime opt-in Google reward wallet and verifiable metering ledger.

One reward per *Google subject* and per physically paired node ID. Codes are
issued only to the node's authenticated bearer token, never via public static
HTML; claiming requires verified Google OIDC. Reward balances live alongside
Vanilla API usage in the same SQLite transaction for atomic reservations.
"""
from __future__ import annotations
import hashlib
import hmac
import html
import json
import os
import re
import secrets
import time
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, ConfigDict
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import id_token
from ceres_gateway import _session

router=APIRouter(tags=["slime-rewards"])
DEFAULT_REWARD=100 # Token per score point
MAX_REWARD=10_000 # Max configurable multiplier
TICKET_TTL=600
ABANDONED_RESERVATION_SECONDS=900  # Above bounded inference execution time.
_ID=re.compile(r"^[a-f0-9]{24}$")
_SUB=re.compile(r"^[0-9]{8,32}$")
_TICKET=re.compile(r"^[A-Za-z0-9_-]{32,160}$")
_CLIENT=re.compile(r"^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$")
_GATEWAY_PREFIX="vnl_"


def _enabled():
    if os.getenv("SLIME_ENABLED","").lower()!="true":
        raise HTTPException(503,"Slime 尚未開啟")
    if os.getenv("SLIME_REWARDS_ENABLED","false").lower()!="true":
        raise HTTPException(503,"Slime 獎勵功能尚未由管理員啟用")


def _tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_config(
      owner_sub TEXT PRIMARY KEY, amount INTEGER NOT NULL CHECK(amount>=0 AND amount<=10000000),
      enabled INTEGER NOT NULL DEFAULT 1, changed_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_ticket(
      node_id TEXT PRIMARY KEY, owner_sub TEXT NOT NULL, code_digest TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL, issued_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_wallet(
      google_sub TEXT PRIMARY KEY, owner_sub TEXT NOT NULL, balance INTEGER NOT NULL
      CHECK(balance>=0), earned INTEGER NOT NULL CHECK(earned>=0),
      spent INTEGER NOT NULL DEFAULT 0 CHECK(spent>=0), created_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_claim(
      node_id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL, claimed_at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_ledger(
      id TEXT PRIMARY KEY, google_sub TEXT NOT NULL, kind TEXT NOT NULL,
      delta INTEGER NOT NULL, created_at INTEGER NOT NULL, model TEXT,
      note TEXT NOT NULL DEFAULT '')""")
    db.execute("CREATE INDEX IF NOT EXISTS slime_reward_ledger_subject ON slime_reward_ledger(google_sub,created_at)")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_key(
      key_id TEXT PRIMARY KEY, google_sub TEXT NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_admin_audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_sub TEXT NOT NULL,
      amount INTEGER NOT NULL, enabled INTEGER NOT NULL, at INTEGER NOT NULL)""")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_weeken_enrollment(
      google_sub TEXT PRIMARY KEY, node_id TEXT NOT NULL UNIQUE,
      score INTEGER NOT NULL, bonus INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('joined','withdrawn','node_removed')),
      consent_version INTEGER NOT NULL, consent_at INTEGER NOT NULL,
      changed_at INTEGER NOT NULL, allow_contact INTEGER NOT NULL DEFAULT 0,
      allow_diagnostics INTEGER NOT NULL DEFAULT 0,
      allow_relay INTEGER NOT NULL DEFAULT 0)""")
    from slime_reward_policy import _debt_tables
    _debt_tables(db)
    cols={r["name"] for r in db.execute("PRAGMA table_info(slime_reward_config)")}
    if "score_multiplier" not in cols:
        db.execute("ALTER TABLE slime_reward_config ADD COLUMN score_multiplier INTEGER NOT NULL DEFAULT 100")
    if "weeken_enabled" not in cols:
        db.execute("ALTER TABLE slime_reward_config ADD COLUMN weeken_enabled INTEGER NOT NULL DEFAULT 1")
    cols={r["name"] for r in db.execute("PRAGMA table_info(slime_reward_claim)")}
    if "score" not in cols:
        db.execute("ALTER TABLE slime_reward_claim ADD COLUMN score INTEGER NOT NULL DEFAULT 0")
    if "bonus" not in cols:
        db.execute("ALTER TABLE slime_reward_claim ADD COLUMN bonus INTEGER NOT NULL DEFAULT 0")



def recover_abandoned_reservations(db, now: int | None = None) -> int:
    """Recover reward credits trapped by a crashed inference process.

    Caller MUST hold a write transaction (BEGIN IMMEDIATE). Mark usage failed,
    restore wallet balance and append its refund ledger entry atomically.
    Actual backend requests are bounded at 45 seconds; 15 minutes gives an
    ample margin before treating a running job as abandoned.
    """
    if not _usage_exists(db):
        return 0
    timestamp = int(time.time()) if now is None else int(now)
    rows = db.execute("""SELECT u.id, u.key_id, u.charged_tokens, u.model,
                               k.google_sub
        FROM vanilla_api_usage u JOIN slime_reward_key k ON k.key_id=u.key_id
        WHERE u.status='running' AND u.created_at<=?
        ORDER BY u.created_at,id LIMIT 200""",
        (timestamp-ABANDONED_RESERVATION_SECONDS,)).fetchall()
    recovered = 0
    for row in rows:
        amount = int(row["charged_tokens"])
        if amount < 0:
            raise RuntimeError("Invalid abandoned reservation amount")
        changed=db.execute("""UPDATE vanilla_api_usage
            SET status='failed', charged_tokens=0,
                prompt_tokens=NULL, completion_tokens=NULL
            WHERE id=? AND key_id=? AND status='running'""",
            (row["id"],row["key_id"]))
        if changed.rowcount != 1:
            continue
        wallet=db.execute("""UPDATE slime_reward_wallet
            SET balance=balance+?,spent=spent-?
            WHERE google_sub=? AND spent>=?""",
            (amount,amount,row["google_sub"],amount))
        if wallet.rowcount != 1:
            raise RuntimeError("Reward wallet missing during recovery")
        db.execute("""INSERT INTO slime_reward_ledger
            (id,google_sub,kind,delta,created_at,model,note)
            VALUES(?,?,?,?,?,?,?)""",
            (row["id"]+":abandoned",row["google_sub"],
             "api_refund",amount,timestamp,row["model"],
             "abandoned_timeout_refund"))
        recovered += 1
    return recovered


def _google(credential: str) -> str:
    client=os.getenv("WEIGUO_GOOGLE_CLIENT_ID","").strip()
    if not _CLIENT.fullmatch(client):
        raise HTTPException(503,"Google OIDC Client ID 尚未設定")
    if not isinstance(credential,str) or not 100<=len(credential)<=8192:
        raise HTTPException(401,"Google 登入憑證無效")
    try:
        claims=id_token.verify_oauth2_token(credential,GoogleAuthRequest(),audience=client)
    except Exception:
        raise HTTPException(401,"Google 身分驗證失敗") from None
    sub=claims.get("sub") if isinstance(claims,dict) else None
    if (not isinstance(sub,str) or not _SUB.fullmatch(sub) or
        claims.get("email_verified") is not True or
        claims.get("iss") not in ("accounts.google.com","https://accounts.google.com")):
        raise HTTPException(401,"Google 帳號未通過身分驗證")
    return sub


def _owner_chat(sub: str) -> int:
    """Require immutable Owner ↔ Telegram identity link to issue usable credits."""
    from slime_telegram import _owner_subject
    try:
        mapping=json.loads(os.environ.get("CERES_FAMILY_LINKS_JSON","{}"))
    except (TypeError,ValueError):
        mapping={}
    matches=[int(chat) for chat,owner in mapping.items()
             if isinstance(chat,str) and chat.isascii() and chat.isdigit()
             and owner==sub and _owner_subject(int(chat),sub)]
    if len(matches)!=1:
        raise HTTPException(503,"獎勵發行者未完成 Telegram Owner 綁定")
    return matches[0]


def config(owner_sub: str) -> dict:
    with _session() as db:
        _tables(db)
        row=db.execute("SELECT score_multiplier,enabled,weeken_enabled FROM slime_reward_config WHERE owner_sub=?",
                       (owner_sub,)).fetchone()
    multiplier=row["score_multiplier"] if row else DEFAULT_REWARD
    return {"amount":multiplier,"multiplier":multiplier,
            "enabled":bool(row["enabled"]) if row else True,
            "weekenEnabled":bool(row["weeken_enabled"]) if row else True}


def set_config(owner_sub: str, amount: int, enabled: bool,
               weeken_enabled: bool=True) -> dict:
    """Legacy 'amount' request parameter now means tokens per score point."""
    if type(amount) is not int or not 0<=amount<=MAX_REWARD:
        raise HTTPException(422,"每評分點的 Token 倍率超出範圍")
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute("""INSERT INTO slime_reward_config
          (owner_sub,amount,enabled,changed_at,score_multiplier,weeken_enabled)
          VALUES(?,?,?,?,?,?) ON CONFLICT(owner_sub) DO UPDATE SET
          score_multiplier=excluded.score_multiplier,
          enabled=excluded.enabled,weeken_enabled=excluded.weeken_enabled,
          changed_at=excluded.changed_at""",
          (owner_sub,100000,int(enabled),now,amount,int(weeken_enabled)))
        db.execute("INSERT INTO slime_reward_admin_audit(owner_sub,amount,enabled,at) VALUES(?,?,?,?)",
                   (owner_sub,amount,int(enabled),now))
    return config(owner_sub)


class RewardTicketRequest(BaseModel):
    model_config=ConfigDict(extra="forbid")


@router.post("/v1/slime/node/reward-ticket")
def reward_ticket(authorization: str | None=Header(default=None)):
    _enabled()
    from slime import _db, _node, _safe_origin
    with _db() as nodes:
        node=_node(nodes,authorization)
        node_id,owner=node["id"],node["owner"]
        from slime_reward_policy import score_capabilities
        try:
            score=score_capabilities(node["cpu"],node["ram_gb"],node["gpu"])
        except ValueError:
            raise HTTPException(409,"節點需先回報 CPU 與 RAM 資訊，才能領取獎勵") from None
    _owner_chat(owner)
    settings=config(owner)
    if not settings["enabled"] or settings["amount"]==0:
        raise HTTPException(403,"管理員目前關閉節點獎勵")
    ticket=secrets.token_urlsafe(32)
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM slime_reward_claim WHERE node_id=?",
                      (node_id,)).fetchone():
            raise HTTPException(409,"此節點獎勵已領取")
        old=db.execute("SELECT issued_at,expires_at FROM slime_reward_ticket "
                       "WHERE node_id=?",(node_id,)).fetchone()
        if old and old["expires_at"]>now:
            raise HTTPException(429,"已有未過期的領獎連結，請稍後重試")
        db.execute("""INSERT INTO slime_reward_ticket VALUES(?,?,?,?,?)
            ON CONFLICT(node_id) DO UPDATE SET code_digest=excluded.code_digest,
            expires_at=excluded.expires_at,issued_at=excluded.issued_at""",
            (node_id,owner,hashlib.sha256(ticket.encode()).hexdigest(),now+TICKET_TTL,now))
    return {"url":_safe_origin()+"/v1/slime/rewards#ticket="+ticket,
            "score":score,"rewardTokens":score*settings["multiplier"],
            "expiresSeconds":TICKET_TTL,
            "note":"一次性領獎連結，請勿轉交；只能由一個 Google 帳號領取"}


class Quote(BaseModel):
    model_config=ConfigDict(extra="forbid")
    ticket: str=Field(min_length=32,max_length=160)


@router.post("/v1/slime/rewards/quote")
def reward_quote(body:Quote):
    _enabled()
    if not _TICKET.fullmatch(body.ticket):
        raise HTTPException(422,"領獎連結格式不正確")
    now=int(time.time())
    with _session() as db:
        _tables(db)
        row=db.execute("SELECT node_id,owner_sub,expires_at FROM slime_reward_ticket "
                       "WHERE code_digest=? AND expires_at>?",
                       (hashlib.sha256(body.ticket.encode()).hexdigest(),now)).fetchone()
    if not row:
        raise HTTPException(409,"領獎連結已使用或逾時")
    settings=config(row["owner_sub"])
    if not settings["enabled"]:
        raise HTTPException(403,"管理員目前已暫停獎勵")
    from slime import _db
    from slime_reward_policy import score_capabilities,bonus_round_up_nine
    with _db() as nodes:
        node=nodes.execute("SELECT owner,cpu,ram_gb,gpu FROM nodes WHERE id=?",
                           (row["node_id"],)).fetchone()
    if not node or node["owner"]!=row["owner_sub"]:
        raise HTTPException(409,"配對節點已退出或不可用")
    try:
        score=score_capabilities(node["cpu"],node["ram_gb"],node["gpu"])
    except ValueError:
        raise HTTPException(409,"節點尚未回報完整硬體資料") from None
    return {"amount":score*settings["multiplier"],"score":score,
            "multiplier":settings["multiplier"],
            "weekenBonus":bonus_round_up_nine(score*100),
            "expiresIn":max(0,row["expires_at"]-now)}


class Claim(BaseModel):
    model_config=ConfigDict(extra="forbid")
    credential: str=Field(min_length=100,max_length=8192)
    ticket: str=Field(min_length=32,max_length=160)


def _new_key(db,subject:str,owner_sub:str) -> str:
    """Issue/re-issue an isolated budget-limited vnl_ key, scoped to this wallet."""
    from vanilla_public_api import _db_tables
    _db_tables(db)
    chat=_owner_chat(owner_sub)
    now=int(time.time())
    # Preserve mappings for in-flight requests using the old key. New calls
    # are denied by revoked_at, but settlement can still refund the old key.
    db.execute("""UPDATE vanilla_api_keys SET revoked_at=?
        WHERE revoked_at IS NULL AND id IN
        (SELECT key_id FROM slime_reward_key WHERE google_sub=?)""",(now,subject))
    project=db.execute("""SELECT p.id FROM vanilla_api_projects p
      WHERE p.owner_chat=? AND p.label=?""",(chat,"Slime Contributor Rewards")).fetchone()
    if project:
        project_id=project["id"]
    else:
        project_id=secrets.token_hex(8)
        db.execute("INSERT INTO vanilla_api_projects VALUES(?,?,?,?,?)",
                   (project_id,"Slime Contributor Rewards",chat,1,now))
    key_id=secrets.token_hex(10)
    raw=f"vnl_{key_id}_{secrets.token_urlsafe(32)}"
    db.execute("""INSERT INTO vanilla_api_keys(
        id,project_id,digest,label,models_json,daily_limit,monthly_limit,rpm,
        max_output,expires_at,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
        (key_id,project_id,hashlib.sha256(raw.encode()).hexdigest(),
         "Slime Google reward",json.dumps(["vanilla-default"]),
         2_000_000,30_000_000,8,512,now+365*86400,now))
    db.execute("INSERT INTO slime_reward_key VALUES(?,?)",(key_id,subject))
    return raw


@router.post("/v1/slime/rewards/claim")
def claim(body:Claim):
    _enabled()
    if not _TICKET.fullmatch(body.ticket):
        raise HTTPException(422,"領獎連結格式無效")
    sub=_google(body.credential)
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT * FROM slime_reward_ticket WHERE code_digest=? AND expires_at>?",
                       (hashlib.sha256(body.ticket.encode()).hexdigest(),now)).fetchone()
        if not row:
            raise HTTPException(409,"領獎連結已過期或使用過")
        # Deleting a node invalidates its future tickets, even if it was paired earlier.
        from slime import _db
        with _db() as nodes:
            active=nodes.execute("SELECT owner FROM nodes WHERE id=?",
                                 (row["node_id"],)).fetchone()
        if not active or active["owner"]!=row["owner_sub"]:
            raise HTTPException(409,"此節點已退出，不能領取獎勵")
        settings=db.execute("SELECT amount,enabled FROM slime_reward_config WHERE owner_sub=?",
                            (row["owner_sub"],)).fetchone()
        amount=settings["amount"] if settings else DEFAULT_REWARD
        enabled=bool(settings["enabled"]) if settings else True
        if not enabled or not amount:
            raise HTTPException(403,"此管理員已暫停獎勵")
        if db.execute("SELECT 1 FROM slime_reward_wallet WHERE google_sub=?",(sub,)).fetchone():
            raise HTTPException(409,"此 Google 帳號已領取首次節點獎勵")
        if db.execute("SELECT 1 FROM slime_reward_claim WHERE node_id=?",
                      (row["node_id"],)).fetchone():
            raise HTTPException(409,"此節點已被領取過")
        key=_new_key(db,sub,row["owner_sub"])
        db.execute("INSERT INTO slime_reward_wallet VALUES(?,?,?,?,?,?)",
                   (sub,row["owner_sub"],amount,amount,0,now))
        db.execute("INSERT INTO slime_reward_claim VALUES(?,?,?,?)",
                   (row["node_id"],sub,amount,now))
        db.execute("INSERT INTO slime_reward_ledger VALUES(?,?,?,?,?,?,?)",
                   (secrets.token_hex(12),sub,"node_signup",amount,now,None,"一次性節點加入獎勵"))
        db.execute("DELETE FROM slime_reward_ticket WHERE node_id=?",(row["node_id"],))
    return {"claimed":True,"rewardTokens":amount,"balance":amount,
            "apiKey":key,"keyShownOnce":True,
            "notice":"API Key 僅顯示一次，請勿公開或放入前端程式碼"}


class GoogleCredential(BaseModel):
    model_config=ConfigDict(extra="forbid")
    credential: str=Field(min_length=100,max_length=8192)


@router.post("/v1/slime/rewards/balance")
def balance(body:GoogleCredential):
    _enabled()
    sub=_google(body.credential)
    now=int(time.time())
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        recover_abandoned_reservations(db, now)
        wallet=db.execute("SELECT balance,earned,spent,created_at FROM slime_reward_wallet WHERE google_sub=?",
                          (sub,)).fetchone()
        if not wallet:
            return {"claimed":False,"balance":0,"earned":0,"spent":0,
                    "transactions":[],"usage":{"requests":0,"exactTokens":0,"estimatedTokens":0}}
        transactions=db.execute("""SELECT kind,delta,created_at,model,note
           FROM slime_reward_ledger WHERE google_sub=?
           ORDER BY created_at DESC,id DESC LIMIT 30""",(sub,)).fetchall()
        # Include historical keys, including rotated keys, for complete metering.
        stats=db.execute("""SELECT COUNT(u.id) requests,
          COALESCE(SUM(u.charged_tokens),0) charged,
          COALESCE(SUM(CASE WHEN u.status='success' AND
                            u.prompt_tokens IS NOT NULL AND u.completion_tokens IS NOT NULL
                       THEN u.charged_tokens ELSE 0 END),0) exact,
          COALESCE(SUM(CASE WHEN u.status='success' AND
                            (u.prompt_tokens IS NULL OR u.completion_tokens IS NULL)
                       THEN u.charged_tokens ELSE 0 END),0) estimated,
          COALESCE(SUM(COALESCE(u.prompt_tokens,0)),0) input,
          COALESCE(SUM(COALESCE(u.completion_tokens,0)),0) output,
          COALESCE(SUM(CASE WHEN u.status='failed' THEN 1 ELSE 0 END),0) failures,
          COALESCE(SUM(CASE WHEN u.created_at>=? THEN u.charged_tokens ELSE 0 END),0) day_tokens,
          COALESCE(SUM(CASE WHEN u.created_at>=? THEN u.charged_tokens ELSE 0 END),0) month_tokens
          FROM slime_reward_key k JOIN vanilla_api_usage u ON u.key_id=k.key_id
          WHERE k.google_sub=?""",
          (now-now%86400,now-30*86400,sub)).fetchone() if _usage_exists(db) else None
        by_model=db.execute("""SELECT u.model,COUNT(*) requests,
          COALESCE(SUM(u.charged_tokens),0) total_tokens,
          COALESCE(SUM(u.prompt_tokens),0) input_tokens,
          COALESCE(SUM(u.completion_tokens),0) output_tokens,
          COALESCE(SUM(CASE WHEN u.status='success' AND u.prompt_tokens IS NULL
               THEN u.charged_tokens ELSE 0 END),0) estimated_tokens
          FROM slime_reward_key k JOIN vanilla_api_usage u ON u.key_id=k.key_id
          WHERE k.google_sub=? GROUP BY u.model ORDER BY total_tokens DESC LIMIT 20""",
          (sub,)).fetchall() if _usage_exists(db) else []
    return {"claimed":True,"balance":wallet["balance"],"earned":wallet["earned"],
            "spent":wallet["spent"],"transactions":[dict(x) for x in transactions],
            "usageByModel":[dict(x) for x in by_model],
            "usage":({
              "requests":stats["requests"],"chargedTokens":stats["charged"],
              "exactTokens":stats["exact"],"estimatedTokens":stats["estimated"],
              "inputTokens":stats["input"],"outputTokens":stats["output"],
              "failures":stats["failures"],"todayTokens":stats["day_tokens"],
              "last30DaysTokens":stats["month_tokens"]}
             if stats else {"requests":0,"exactTokens":0,"estimatedTokens":0})}


def _usage_exists(db) -> bool:
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='vanilla_api_usage'").fetchone() is not None


@router.post("/v1/slime/rewards/rotate-key")
def rotate_key(body:GoogleCredential):
    _enabled()
    sub=_google(body.credential)
    with _session() as db:
        _tables(db)
        db.execute("BEGIN IMMEDIATE")
        wallet=db.execute("SELECT owner_sub FROM slime_reward_wallet WHERE google_sub=?",
                          (sub,)).fetchone()
        if not wallet:
            raise HTTPException(404,"尚未領取節點獎勵")
        raw=_new_key(db,sub,wallet["owner_sub"])
    return {"apiKey":raw,"shownOnce":True,"notice":"舊金鑰立即作廢，請妥善保存新金鑰"}


_PAGE="""<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light">
<title>Slime · Google 登入領取獎勵</title>
<script nonce="__NONCE__">
(function(){var s=location.hash.match(/^#ticket=([A-Za-z0-9_-]{32,160})$/);
window.__slimeTicket=s?s[1]:"";if(location.hash)history.replaceState(null,"",location.pathname);})();
</script>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<style nonce="__NONCE__">
:root{font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif;color:#141416;background:#f7f7f9}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
main{width:min(100%,500px);background:#fff;border:1px solid #e7e7e9;padding:clamp(24px,6vw,44px);border-radius:29px}
.brand{font-size:12px;font-weight:850;letter-spacing:.14em;color:#797981}h1{font-size:34px;letter-spacing:-.055em;line-height:1.2;margin:20px 0 11px}
p,small{color:#75757c;font-size:13px;line-height:1.8}small{font-size:11px}
.metric{margin:20px 0;padding:23px;border-radius:17px;background:#f5f5f6}
.metric small{display:block}.metric strong{font-size:31px;letter-spacing:-.04em}
#google{margin:18px 0;min-height:43px}button{width:100%;border:0;padding:14px 17px;margin:7px 0;border-radius:12px;background:#18181b;color:#fff;font-size:13px;font-weight:750;cursor:pointer}
button:disabled{opacity:.5}button.secondary{color:#18181b;background:#f1f1f3}
#key{font:12px ui-monospace,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f5;padding:13px;border-radius:10px}
[hidden]{display:none!important}#status{border-radius:12px;padding:10px 0;font-size:12px}
</style></head><body><main>
<div class="brand">SLIME / VANILLA REWARDS</div><h1>配對完成，<br>領取你的 Token。</h1>
<p>完成 Google 身分驗證後，可領取由 Slime 管理員提供的一次性模型額度。每個 Google 帳號及每個節點最多領取一次。</p>
<div class="metric"><small>本次新節點加入獎勵</small><strong><span id="reward-amount">—</span> <small style="display:inline">Token</small></strong></div>
<div id="google"></div>
<p id="status" role="status" aria-live="polite">登入後會檢查獎勵資格；不會向 Google 傳送節點金鑰。</p>
<div id="wallet" hidden><div class="metric"><small>目前可用額度</small><strong id="balance">—</strong></div>
<div class="metric"><small>累計消耗 · 以實際用量優先</small><strong id="spent">0</strong>
<p id="usage-detail" style="margin-bottom:0">尚未產生模型請求。</p></div>
<button type="button" id="rotate" class="secondary">重新產生 API Key（舊金鑰失效）</button></div>
<div id="keybox" hidden><small>這是唯一一次顯示 API Key，請存入你自己的私密伺服器設定。</small>
<pre id="key"></pre><button type="button" id="copy">複製 API Key</button>
<button type="button" id="hide" class="secondary">已保存，清除畫面</button></div>
<small>獎勵 Token 僅供 Vanilla 自有模型 API 扣抵，非現金；若模型未提供可靠 Token 用量，會標示保守預留結算。首次領取並不代表節點已獲模型推論權限。</small>
</main><script nonce="__NONCE__">
(function(){
"use strict";
const ticket=window.__slimeTicket||"";delete window.__slimeTicket;
const $=id=>document.getElementById(id);
let credential="",issued="";
function msg(text){$("status").textContent=String(text)}
async function api(route,data){
 const response=await fetch("/v1/slime/rewards/"+route,{method:"POST",credentials:"omit",cache:"no-store",
 headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 const body=await response.json();
 if(!response.ok)throw Error(typeof body.detail==="string"?body.detail:"操作失敗");
 return body;
}
function showKey(key){issued=key;$("key").textContent=key;$("keybox").hidden=false;}
function showWallet(data){
 $("wallet").hidden=!data.claimed;
 $("balance").textContent=Number(data.balance||0).toLocaleString();
 $("spent").textContent=Number(data.spent||0).toLocaleString();
 const u=data.usage||{};
 const models=(data.usageByModel||[]).slice(0,8).map(x=>
   x.model+": "+Number(x.total_tokens).toLocaleString()+" Token").join("；");
 $("usage-detail").textContent=
   "本期輸入 "+Number(u.inputTokens||0).toLocaleString()+
   " / 輸出 "+Number(u.outputTokens||0).toLocaleString()+
   " · 精確結算 "+Number(u.exactTokens||0).toLocaleString()+
   " · 保守計算 "+Number(u.estimatedTokens||0).toLocaleString()+
   (models?" · 模型： "+models:"");
}
function hideKey(){issued="";$("key").textContent="";$("keybox").hidden=true;}
window.onload=async function(){
 if(ticket){
  try{
    const quote=await api("quote",{ticket});
    $("reward-amount").textContent=Number(quote.amount).toLocaleString();
  }catch(error){msg(error.message);}
 }else{$("reward-amount").textContent="100,000（預設）";}
 if(!window.google?.accounts?.id){msg("Google 登入元件載入失敗，請檢查網路或瀏覽器設定。");return;}
 google.accounts.id.initialize({client_id:__GOOGLE_CLIENT__,callback:async function(auth){
  if(!auth||!auth.credential)return;
  credential=auth.credential;msg("正在驗證 Google 身分與節點資格…");
  try{
   if(ticket){
    const result=await api("claim",{credential,ticket});
    msg("已領取 "+result.rewardTokens.toLocaleString()+" Token！");
    showWallet(await api("balance",{credential}));
    showKey(result.apiKey);
   }else{
    const result=await api("balance",{credential});
    showWallet(result);
    msg(result.claimed?"Google 身分確認成功，可查詢目前剩餘 Token。":"尚未領取。請由已配對的 Slime 節點開啟專屬領獎連結。");
   }
  }catch(error){msg(error.message)}
 }});
 google.accounts.id.renderButton($("google"),{theme:"outline",size:"large",shape:"pill",text:"continue_with"});
 if(!ticket)msg("Google 登入可查看餘額；新獎勵須從已配對的節點開啟專屬連結。");
};
$("rotate").onclick=async function(){
 if(!credential||!confirm("重新產生 API Key 會立即撤銷舊金鑰，確定繼續？"))return;
 try{const r=await api("rotate-key",{credential});showKey(r.apiKey);msg("新金鑰已產生，舊金鑰失效。");}
 catch(e){msg(e.message)}
};
$("copy").onclick=async function(){if(!issued)return;try{await navigator.clipboard.writeText(issued);msg("已複製，請保存在安全環境。")}catch{msg("複製失敗，請手動選取金鑰。")}};
$("hide").onclick=hideKey;window.addEventListener("pagehide",hideKey);
})();
</script></body></html>"""


@router.get("/v1/slime/rewards",response_class=HTMLResponse)
def reward_page():
    _enabled()
    client=os.getenv("WEIGUO_GOOGLE_CLIENT_ID","").strip()
    if not _CLIENT.fullmatch(client):
        raise HTTPException(503,"Google OIDC 尚未設定")
    nonce=secrets.token_urlsafe(18)
    page=_PAGE.replace("__NONCE__",nonce).replace("__GOOGLE_CLIENT__",json.dumps(client))
    result=HTMLResponse(page)
    result.headers.update({"Cache-Control":"no-store, private","Referrer-Policy":"no-referrer",
      "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY",
      "Content-Security-Policy":("default-src 'none'; "
       f"script-src 'nonce-{nonce}' https://accounts.google.com; "
       f"style-src 'nonce-{nonce}' https://accounts.google.com; "
       "frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; "
       "img-src https://accounts.google.com data:; frame-ancestors 'none'; "
       "form-action 'none'; base-uri 'none'")})
    return result


def reward_snapshot(owner_sub: str) -> dict:
    settings=config(owner_sub)
    with _session() as db:
        _tables(db)
        r=db.execute("""SELECT COUNT(*) recipients,COALESCE(SUM(amount),0) awarded
             FROM slime_reward_claim c JOIN slime_reward_wallet w ON w.google_sub=c.google_sub
             WHERE w.owner_sub=?""",(owner_sub,)).fetchone()
        spent=db.execute("SELECT COALESCE(SUM(spent),0) x FROM slime_reward_wallet WHERE owner_sub=?",
                         (owner_sub,)).fetchone()["x"]
    return {**settings,"recipients":r["recipients"],"awarded":r["awarded"],"spent":spent}
