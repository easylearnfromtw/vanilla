"""Owner-only Telegram command hub: safe status, existing controls, GitHub discovery.

This module NEVER imports/executes a remote repository or shell command.
All operations enter through the existing verified Ceres private-chat webhook.
"""
from __future__ import annotations

import os
import re
from html import escape
import time

import httpx

from ceres_admin_bot import owner_subject, say, _telegram, _edit_target
from ceres_gateway import _session

_COMMAND = re.compile(r"^/(?:hub|center|centre)(?:@SignWell_bot)?(?:\s+(.*))?$", re.I | re.S)
_SEARCH = re.compile(r"^[A-Za-z0-9\u3400-\u9fff][A-Za-z0-9\u3400-\u9fff ._/-]{1,79}$")
_SOURCES = (
    ("OpenClaw", "MIT", "https://github.com/openclaw/openclaw"),
    ("aiogram", "MIT", "https://github.com/aiogram/aiogram"),
    ("grammY", "MIT", "https://github.com/grammyjs/grammY"),
    ("AstrBot", "AGPL-3.0，架構參考", "https://github.com/AstrBotDevs/AstrBot"),
    ("n8n", "Sustainable Use License，需另行審核", "https://github.com/n8n-io/n8n"),
)


def _button(label: str, item: str) -> dict:
    return {"text": label, "callback_data": "hub:" + item}


def _menu() -> list[list[dict]]:
    """A native Telegram control panel. Callback identities are stable."""
    return [
        [_button("◉ 系統狀態", "status"), _button("▣ 模型診斷", "diagnostics")],
        [_button("◇ Detroit 工具", "tools"), _button("◎ Slime 節點", "nodes")],
        [_button("▤ API 管理", "providers"), _button("♙ 使用者權限", "accounts")],
        [_button("↗ 成本摘要", "usage"), _button("⌕ GitHub 探索", "sources")],
        [_button("🩺 運維巡檢", "health"), _button("🚨 事件告警", "incidents")],
        [_button("🗂 任務／Diana", "jobs"), _button("🛡 審批／稽核", "approvals")],
        [_button("🚀 版本管理", "deploy"), _button("📋 營運報告", "report")],
    ]


def _title(page: str) -> str:
    return ("✦ <b>Ceres</b>  <code>VANILLA / DETROIT</code>\n"
            "━━━━━━━━━━━━━━━━━━\n"
            "<b>"+escape(page)+"</b>\n\n")


def _page_buttons(action: str) -> list[list[dict]]:
    return [[_button("↻ 重新整理",action),_button("← 控制中心","home")]]


async def _home(chat: int) -> None:
    await say(chat,
        _title("OWNER · 私人 AI 控制中心")
        +"<b>你的系統，集中管理。</b>\n"
        +"不必記住指令，直接點選下方功能。\n\n"
        +"<b>系統管理</b>  ·  狀態、模型、節點\n"
        +"<b>存取控制</b>  ·  API、Gmail、成本\n\n"
        +"<i>狀態為配置或歷史紀錄，不能代表目前已成功回覆。所有敏感操作均需 Owner 授權。</i>\n\n"
        +"輸入 <code>/admin</code> 可進入詳細管理。",
        _menu(),html=True)


def _status_text() -> str:
    from ceres_server_agent import enabled, ready
    from ceres_server_model import model_settings
    from ceres_admin_policy import enforce, provider_status
    from policy import allow_hosts
    model = model_settings() is not None
    try:
        allowed_hosts = bool(allow_hosts())
    except (ValueError, TypeError):
        allowed_hosts = False
    providers = provider_status()
    configured = sum(bool(p["enabled"] and p["configured"]) for p in providers)
    return (
        "Ceres · 系統狀態（配置檢查，非端到端健康檢查）\n"
        f"Telegram Ceres：{'開啟' if os.getenv('CERES_ENABLED', '').lower() == 'true' else '關閉'}\n"
        f"常駐 Agent：{'就緒' if ready() else '未就緒'}"
        f"（{'已開啟' if enabled() else '未啟用'}）\n"
        f"常駐模型：{'已配置' if model else '未配置'}\n"
        f"Scouts 核准網站：{'已配置' if allowed_hosts else '未配置'}\n"
        f"Slime 節點註冊：{'已開啟' if os.getenv('SLIME_ENABLED', '').lower() == 'true' else '未開啟'}\n"
        f"Gmail 白名單強制：{'開啟' if enforce() else '關閉'}\n"
        f"可使用 API 供應商配置：{configured} 個\n"
        "實際模型、節點或工具是否在線，應再以對應測試確認。"
    )


def _tools_text() -> str:
    from ceres_server_model import model_settings
    from policy import allow_hosts
    try:
        scouts = bool(allow_hosts())
    except (ValueError, TypeError):
        scouts = False
    model = model_settings() is not None
    slime = os.getenv("SLIME_ENABLED", "").lower() == "true"
    return (
        "Detroit · Telegram 能力目錄\n"
        f"• AI 自然語言：{'模型已配置' if model else '待配置常駐模型'}\n"
        "• Diana：受控工作路由；非任意執行權\n"
        "• CREAM：/calc 算式、/cream 1,2,3\n"
        f"• Scouts：{'核准網站已配置' if scouts else '尚無核准網站'}；/scouts https://...\n"
        f"• Slime：{'可查詢與管理註冊節點' if slime else '需啟用節點服務'}\n"
        "• Gmail/API 管理：/admin（敏感變更需要獨立核准）\n"
        "• GitHub：/hub github 關鍵字（只讀搜尋、授權提示）\n"
        "• Retina、Janus、LUNA、Quirinus、Medusa："
        "Vanilla 具有相關模組，但尚未授予 Telegram 直接執行權。\n"
        "• Mini App：提供經 Telegram 身分驗證的安全設定與健康儀表板。\n\n"
        "不會因為列出工具就宣稱已執行；寫入、部署、安裝須另行授權。"
    )


async def _nodes(chat: int, sub: str) -> None:
    from slime_telegram import handle_slime
    result = handle_slime(chat, sub, "目前有哪些電腦")
    await say(chat,_title("NODES / Slime 節點")
              +"<pre>"+escape(result or "Slime 節點控制尚未設定。")+"</pre>",
              _page_buttons("nodes"),html=True)


async def _sources(chat: int) -> None:
    lines = ["GitHub 可研究的開源框架（不是安裝清單）"]
    for name, license_name, url in _SOURCES:
        lines.append(f"\n{name}｜{license_name}\n{url}")
    lines.append(
        "\n授權依專案當前 LICENSE 為準。"
        " AGPL、GPL 或特殊商業授權不得直接複製進專有產品；"
        "任何下載或安裝需完成授權、依賴與安全審查。"
    )
    await say(chat,_title("SOURCES / GitHub 開源框架")
              +"<pre>"+escape("\n".join(lines))+"</pre>",
              [[_button("⌕ GitHub 查詢說明","github"),_button("← 返回","home")]],html=True)


def _limit_search(chat: int) -> bool:
    now = int(time.time())
    with _session() as db:
        db.execute("CREATE TABLE IF NOT EXISTS ceres_hub_searches ("
                   "id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, at INTEGER NOT NULL)")
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM ceres_hub_searches WHERE at < ?", (now - 3600,))
        recent = db.execute(
            "SELECT COUNT(*) FROM ceres_hub_searches WHERE chat_id=? AND at>=?",
            (chat, now - 60)).fetchone()[0]
        if recent >= 3:
            return False
        db.execute("INSERT INTO ceres_hub_searches(chat_id,at) VALUES(?,?)", (chat, now))
    return True


def _format_repo(item: dict) -> str | None:
    if not isinstance(item, dict):
        return None
    name = item.get("full_name")
    url = item.get("html_url")
    if not isinstance(name, str) or not isinstance(url, str):
        return None
    if not re.fullmatch(r"[\w.-]{1,100}/[\w.-]{1,100}", name, re.ASCII):
        return None
    if url != "https://github.com/" + name:
        return None
    lic = item.get("license")
    spdx = lic.get("spdx_id") if isinstance(lic, dict) else None
    license_name = spdx if isinstance(spdx, str) and len(spdx) <= 40 else "未知"
    desc = item.get("description")
    desc = re.sub(r"\s+", " ", desc).strip()[:90] if isinstance(desc, str) else ""
    stars = item.get("stargazers_count")
    stars = stars if type(stars) is int and 0 <= stars <= 100_000_000 else "?"
    return f"{name} ★{stars}\n授權：{license_name}（需再次核對 LICENSE）\n{desc}\n{url}"


async def _search_github(chat: int, keyword: str) -> None:
    keyword = keyword.strip()
    if (not _SEARCH.fullmatch(keyword) or len(keyword.split()) > 6
        or len(keyword) > 80):
        await say(chat, "請使用 2–80 字的搜尋詞，例如：/hub github telegram bot。")
        return
    if os.getenv("CERES_GITHUB_DISCOVERY_ENABLED", "true").lower() != "true":
        await say(chat, "GitHub 公開專案搜尋目前已由後端停用。")
        return
    if not _limit_search(chat):
        await say(chat, "GitHub 搜尋限制為每分鐘 3 次，請稍後再試。")
        return
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=False,
                                     trust_env=False) as client:
            response = await client.get(
                "https://api.github.com/search/repositories",
                params={"q": keyword + " in:name,description archived:false",
                        "per_page": 5},
                headers={"Accept": "application/vnd.github+json",
                         "User-Agent": "Vanilla-Ceres-ReadOnly"})
            if response.status_code != 200 or len(response.content) > 250_000:
                raise ValueError("search failed")
            data = response.json()
        results = data.get("items") if isinstance(data, dict) else None
        if not isinstance(results, list):
            raise ValueError("unexpected GitHub result")
        cards = [_format_repo(item) for item in results[:5]]
        cards = [item for item in cards if item]
    except (httpx.HTTPError, ValueError, TypeError):
        await say(chat, "GitHub 暫時無法取得可驗證的公開搜尋結果；沒有安裝任何程式。")
        return
    await say(chat, ("GitHub 公開專案搜尋：" + keyword + "\n\n" +
                     ("\n\n".join(cards) if cards else "沒有符合條件的結果") +
                     "\n\n搜尋結果僅供評估，不會自動引入任何外部程式碼。")[:3400],
              [[_button("開源框架目錄", "sources"), _button("返回", "home")]])


async def command(chat: int, body: str) -> None:
    sub = owner_subject(chat)
    if not sub:
        return
    match = _COMMAND.fullmatch(body.strip())
    if not match:
        return
    arg = (match.group(1) or "").strip()
    head, _, tail = arg.partition(" ")
    action = head.lower()
    if not arg or action in ("home", "menu", "help"):
        await _home(chat)
    elif action in ("status", "狀態"):
        await say(chat, _title("SYSTEM / 系統配置")+"<pre>"+escape(_status_text())+"</pre>\n<i>配置快照並非端對端回覆測試。</i>", _page_buttons("status"),html=True)
    elif action in ("tools", "skills", "功能", "工具"):
        await say(chat, _title("TOOLS / Detroit 工具")+"<pre>"+escape(_tools_text())+"</pre>", _page_buttons("tools"),html=True)
    elif action in ("nodes", "slime", "節點"):
        await _nodes(chat, sub)
    elif action in ("sources", "projects", "開源"):
        await _sources(chat)
    elif action in ("github", "search"):
        await _search_github(chat, tail)
    elif action in ("diagnostics", "diag"):
        from ceres_model_ops import diagnostics
        report=diagnostics()
        records=report["modelChecks"][-8:]
        entries=("\n".join(
            ("● " if x["ok"] else "○ ")
            +"<b>"+escape(x["provider"])+"</b> / <code>"+escape(x["model"])+"</code>"
            +" · "+escape("OK" if x["ok"] else x["code"])
            for x in records) if records else "尚無模型實測結果")
        await say(chat,_title("MODELS / 實際推論診斷")
                  +entries
                  +"\n\n<i>歷史探測紀錄；最新測試可從 /admin 安全設定頁啟動。</i>",
                  _page_buttons("diagnostics"),html=True)
    elif action in ("usage", "cost"):
        from ceres_model_ops import summary
        report=summary()
        rows=report["providers"]
        lines=[]
        for item in rows:
            priced=(item["estimated_usd"] is not None and not item["unpriced"])
            cost=("$"+str(round(item["estimated_usd"],5)) if priced else "價格資料不足")
            lines.append("<b>"+escape(item["provider"].title())+"</b>\n"
                         +"  呼叫 "+str(item["calls"])+" 次 · "+escape(cost))
        await say(chat,_title("COST / 最近 30 日")
                  +("\n\n".join(lines) if lines else "尚無已記錄的用量")
                  +"\n\n<i>非供應商完整帳單；未計價呼叫不會估算。</i>",
                  _page_buttons("usage"),html=True)
    elif action in ("plan", "設定"):
        from ceres_model_ops import preview
        from fastapi import HTTPException
        try:
            proposal=preview(tail,chat)
        except HTTPException as exc:
            await say(chat,str(exc.detail)+"\n例如 /hub plan Gemini 速度優先",_menu())
            return
        message=(_title("REVIEW / 待確認設定")
                 +"<b>供應商</b>  "+escape(proposal["provider"])+"\n"
                 +"<b>操作</b>  "+escape(proposal["operation"])+"\n"
                 +"<b>預定值</b>  <code>"+escape(proposal["value"])+"</code>\n\n"
                 +escape(proposal["warning"])+"\n\n"
                 +"<i>尚未執行 · 請於 120 秒內確認</i>")
        await say(chat,message,[[_button("✓ 確認套用","confirmplan:"+proposal["token"]),
                                _button("× 取消","home")]],html=True)
    elif action in ("health","incidents","jobs","approvals","deploy","report",
                     "audit","security","backup","maintenance","flows") or (action=="budget" and not tail):
        from ceres_maintenance import (overview,budget_state,version,jobs,audit_log,security,
                                       report,node_snapshot,backup_guidance,setting,workflow_plan,
                                       run_workflow,audit)
        label={"health":"HEALTH / 系統巡檢","incidents":"ALERTS / 事件告警",
               "jobs":"TASKS / 任務中心","approvals":"APPROVALS / 審批中心",
               "deploy":"RELEASE / 部署資訊","report":"REPORT / 營運摘要",
               "budget":"BUDGET / API 預算","audit":"AUDIT / 操作紀錄",
               "security":"SECURITY / 安全狀態","backup":"RECOVERY / 備份指引",
               "maintenance":"SETTINGS / 主動監控","flows":"DIANA / 唯讀工作流程"}[action]
        if action=="health":
            state=overview(chat)
            detail=("Agent："+("就緒" if state["agentReady"] else "未就緒")
                    +"\n模型歷史成功："+str(state["modelProbeSuccess"])
                    +"\n近期異常："+(", ".join(state["issues"]) or "無已知異常")
                    +"\n最近回覆記錄："+("有" if state["telegram"].get("lastVerifiedReplyAt") else "尚未確認")
                    +"\n端到端實際測試：未執行")
            audit(chat,"view_health")
        elif action=="incidents":
            from ceres_maintenance import watch_tick
            state=overview(chat)
            detail=("目前診斷碼："+(", ".join(state["issues"]) or "無已知異常")
                    +"\n主動提醒："+("啟用" if setting(chat,"notifications")=="on" else "停用")
                    +"\n注意：首次巡檢僅建立基準，異常持續才會通知。")
            audit(chat,"view_incidents")
        elif action=="jobs":
            records=jobs(chat)
            detail="\n".join(x["id"]+" · "+x["kind"]+" · "+x["state"] for x in records) or "尚無任務"
            detail+="\n\n輸入 /hub workflow 巡檢 可執行安全唯讀工作流程。"
            audit(chat,"view_jobs")
        elif action=="approvals":
            detail=("高風險操作一律保留 Owner 120 秒單次確認。\n"
                    "支援：設定 API 預算、開啟／關閉異常通知、每日營運報告。\n"
                    "部署、回滾、金鑰操作不會由 Telegram 自動執行。")
            audit(chat,"view_approvals")
        elif action=="deploy":
            item=version(chat)
            detail=("Railway commit："+item["commit"]+"\n部署識別："+item["deploymentId"]
                    +"\n回滾執行：未連接具權限的 Railway 審批執行器。\n"+item["note"])
            audit(chat,"view_deploy")
        elif action=="report":
            detail=report(chat)+"\n\n每日 08:00 報告："+("開啟" if setting(chat,"daily_report")=="on" else "關閉")
            audit(chat,"view_report")
        elif action=="budget":
            item=budget_state(chat)
            detail=("30 日預算 US$"+str(item["limitUsd"])+"\n已知費率估算 US$"+str(item["knownEstimateUsd"])
                    +"\n未計價："+str(item["unpricedCalls"])+" 次\n"
                    +"完整定價可用於阻止額外模型請求："+("是" if item["hardStopEligible"] else "否")
                    +"\n設定：/hub budget 5.00（先預覽再確認）。\n"+item["note"])
            audit(chat,"view_budget")
        elif action=="audit":
            entries=audit_log(chat)
            detail="\n".join(x["action"] for x in entries[-15:]) or "尚無稽核紀錄"
            audit(chat,"view_audit")
        elif action=="security":
            item=security(chat)
            detail=("Owner 已驗證："+("是" if item["ownerChecked"] else "否")
                    +"\nGmail 白名單強制："+("開啟" if item["gmailEnforced"] else "關閉")
                    +"\n已授權帳號："+str(item["enabledAccounts"])
                    +"\n可用 API 供應商："+str(item["providerConfigured"])
                    +"\n原生聊天 Face ID 驗證：未支援\n"+item["note"])
        elif action=="backup":
            detail=backup_guidance(chat)
            audit(chat,"view_backups")
        elif action=="maintenance":
            detail=("自動巡檢由 Ceres 後端排程控制；關閉時不會發出任何告警。\n"
                    "異常通知："+setting(chat,"notifications")+
                    "\n每日摘要："+setting(chat,"daily_report")+
                    "\n切換：/hub alerts on、/hub daily on\n"
                    "以上操作會產生確認卡片。")
        else:
            detail="Diana 唯讀流程：巡檢、調查故障、成本分析、節點管理、部署檢查。\n例如 /hub workflow 調查故障。"
        buttons=[[_button("↻ 更新",action),_button("← 控制中心","home")]]
        if action=="health":
            buttons.insert(0,[_button("🚨 告警","incidents"),_button("🗂 任務","jobs")])
        if action=="budget":
            buttons.insert(0,[_button("↗ 成本摘要","usage")])
        if action=="maintenance":
            buttons.insert(0,[_button("📋 營運摘要","report")])
        await say(chat,_title(label)+"<pre>"+escape(detail[:2900])+"</pre>",buttons,html=True)
    elif action in ("alerts","daily") and tail in ("on","off"):
        from ceres_maintenance import request_change
        kind="notifications" if action=="alerts" else "daily_report"
        token=request_change(chat,kind,tail)
        await say(chat,_title("REVIEW / 等待確認")
                  +escape(("異常通知" if action=="alerts" else "每日營運報告")
                          +" → "+tail)
                  +"\n\n<i>此處尚未生效，請於 120 秒內完成確認。</i>",
                  [[_button("✓ 確認套用","maintconfirm:"+token),
                    _button("× 取消","home")]],html=True)
    elif action=="budget" and tail:
        from ceres_maintenance import request_change
        try:
            token=request_change(chat,"budget",tail)
        except ValueError as exc:
            await say(chat,str(exc),_page_buttons("budget"))
            return
        await say(chat,_title("REVIEW / API 成本防護")
                  +"預算門檻 <b>US$"+escape(tail)+"</b>／30 日\n"
                  +"僅在所有已記錄呼叫可計價時實施停止。\n"
                  +"<i>可能存在未記錄的供應商費用；此值不是完整帳單。</i>",
                  [[_button("✓ 確認門檻","maintconfirm:"+token),
                    _button("× 取消","budget")]],html=True)
    elif action=="workflow" and tail:
        from ceres_maintenance import run_workflow
        try:
            data=run_workflow(chat,tail)
            await say(chat,_title("DIANA / 任務已完成")
                      +"<code>"+escape(data["id"])+"</code>\n"
                      +"<pre>"+escape(data["result"])+"</pre>\n"
                      +"<i>僅執行已核准唯讀步驟；未變更權限或部署。</i>",
                      _page_buttons("jobs"),html=True)
        except ValueError:
            await say(chat,"未知工作流程，使用 /hub flows 查看支援項目。")
    elif action in ("accounts", "gmail", "providers", "api", "admin"):
        from ceres_admin_bot import command as admin_command
        await admin_command(chat, "/admin " + ("users" if action in ("accounts", "gmail")
                                              else "providers" if action in ("api", "providers")
                                              else ""))
    else:
        await say(chat, "無法辨識控制中心指令，請使用 /hub 查看選單。", _menu())


async def callback(chat: int, callback_id: str, data: str, message_id: int | None=None) -> None:
    if not data.startswith("hub:") or not owner_subject(chat):
        return
    await _telegram("answerCallbackQuery", {"callback_query_id": callback_id})
    token=_edit_target.set(message_id if type(message_id) is int and message_id>0 else None)
    try:
        await _handle_callback(chat,data[4:])
    finally:
        _edit_target.reset(token)


async def _handle_callback(chat: int, action: str) -> None:
    if action in {"home", "status", "tools", "nodes", "sources",
                  "accounts", "providers"}:
        await command(chat, "/hub " + action)
    elif action == "github":
        await say(chat, "輸入 /hub github 關鍵字，例如 /hub github telegram AI agent。")
    elif action in ("diagnostics","usage"):
        await command(chat,"/hub "+action)
    elif action in {"health","incidents","jobs","approvals","deploy","report","budget",
                     "audit","security","backup","maintenance","flows"}:
        await command(chat,"/hub "+action)
    elif action.startswith("maintconfirm:"):
        from ceres_maintenance import approve
        try:
            result=approve(chat,action[len("maintconfirm:"):])
            await say(chat,_title("APPROVED / 設定已套用")+escape(result),_page_buttons("maintenance"),html=True)
        except (ValueError,PermissionError) as exc:
            await say(chat,_title("EXPIRED / 操作未執行")+escape(str(exc)),_page_buttons("maintenance"),html=True)
    elif action.startswith("confirmplan:"):
        from ceres_model_ops import approve
        from fastapi import HTTPException
        try:
            result=approve(action[12:],chat)
            await say(chat,"已套用 Owner 確認的設定："+result["provider"],_menu())
        except HTTPException as exc:
            await say(chat,str(exc.detail),_menu())
