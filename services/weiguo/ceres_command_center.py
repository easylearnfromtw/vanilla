"""Owner-only Telegram command hub: safe status, existing controls, GitHub discovery.

This module NEVER imports/executes a remote repository or shell command.
All operations enter through the existing verified Ceres private-chat webhook.
"""
from __future__ import annotations

import os
import re
import time

import httpx

from ceres_admin_bot import owner_subject, say, _telegram
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
    """Telegram-native compact entry points; callback identities stay stable."""
    return [
        [_button("📊 系統概覽", "status"), _button("🩺 模型診斷", "diagnostics")],
        [_button("🧠 Detroit 工具", "tools"), _button("🖥 Slime 節點", "nodes")],
        [_button("🔌 API 與模型", "providers"), _button("👥 Gmail 權限", "accounts")],
        [_button("📈 使用成本", "usage"), _button("🔎 GitHub 探索", "sources")],
    ]

async def _home(chat: int) -> None:
    await say(chat,
        "CERES  /  VANILLA AI\n"
        "────────────────────\n"
        "Detroit · Owner 控制中心\n\n"
        "選擇下方功能，或直接和 Ceres 對話。\n"
        "系統狀態分為配置、歷史紀錄與實際測試；不會把「服務在線」當成已成功回覆。\n\n"
        "快速指令\n"
        "• /hub diagnostics — 模型實測與故障碼\n"
        "• /hub usage — 30 日用量\n"
        "• /hub plan Gemini 速度優先 — 預覽設定\n"
        "• /admin — 安全憑證與詳細設定\n\n"
        "權限與付費設定都需要經過後端授權。",
        _menu())

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
        "• Mini App：目前提供安全 API 設定 WebApp；完整儀表板尚未上線。\n\n"
        "不會因為列出工具就宣稱已執行；寫入、部署、安裝須另行授權。"
    )


async def _nodes(chat: int, sub: str) -> None:
    from slime_telegram import handle_slime
    result = handle_slime(chat, sub, "目前有哪些電腦")
    await say(chat, result or "Slime 節點控制尚未設定。", [[_button("返回", "home")]])


async def _sources(chat: int) -> None:
    lines = ["GitHub 可研究的開源框架（不是安裝清單）"]
    for name, license_name, url in _SOURCES:
        lines.append(f"\n{name}｜{license_name}\n{url}")
    lines.append(
        "\n授權依專案當前 LICENSE 為準。"
        " AGPL、GPL 或特殊商業授權不得直接複製進專有產品；"
        "任何下載或安裝需完成授權、依賴與安全審查。"
    )
    await say(chat, "\n".join(lines), [[_button("返回", "home")]])


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
        await say(chat, _status_text(), _menu())
    elif action in ("tools", "skills", "功能", "工具"):
        await say(chat, _tools_text(), _menu())
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
        await say(chat, "Ceres · 模型診斷\n"+
                  ("\n".join(x["provider"]+"/"+x["model"]+" · "+
                             ("OK" if x["ok"] else x["code"]) for x in records)
                   if records else "尚無實測結果")+
                  "\n詳細健康與模型比較請使用 /admin 的安全設定頁。",_menu())
    elif action in ("usage", "cost"):
        from ceres_model_ops import summary
        report=summary()
        rows=report["providers"]
        message="\n".join(x["provider"]+" · "+str(x["calls"])+" 次 · "+
                           ("$"+str(round(x["estimated_usd"],5)) if x["estimated_usd"] is not None
                            and not x["unpriced"] else "費用部分未知")
                           for x in rows)
        await say(chat,"Ceres · 最近 30 日已記錄的模型用量\n"+
                  (message or "尚無紀錄")+"\n非供應商完整帳單。",_menu())
    elif action in ("plan", "設定"):
        from ceres_model_ops import preview
        from fastapi import HTTPException
        try:
            proposal=preview(tail,chat)
        except HTTPException as exc:
            await say(chat,str(exc.detail)+"\n例如 /hub plan Gemini 速度優先",_menu())
            return
        message=("Ceres · 設定預覽（尚未執行）\n"+
                 proposal["provider"]+" · "+proposal["operation"]+" → "+proposal["value"]+
                 "\n"+proposal["warning"]+"\n120 秒內可確認。")
        await say(chat,message,[[_button("✅ 確認套用","confirmplan:"+proposal["token"]),
                                _button("取消","home")]])
    elif action in ("accounts", "gmail", "providers", "api", "admin"):
        from ceres_admin_bot import command as admin_command
        await admin_command(chat, "/admin " + ("users" if action in ("accounts", "gmail")
                                              else "providers" if action in ("api", "providers")
                                              else ""))
    else:
        await say(chat, "無法辨識控制中心指令，請使用 /hub 查看選單。", _menu())


async def callback(chat: int, callback_id: str, data: str) -> None:
    if not data.startswith("hub:") or not owner_subject(chat):
        return
    await _telegram("answerCallbackQuery", {"callback_query_id": callback_id})
    action = data[4:]
    if action in {"home", "status", "tools", "nodes", "sources",
                  "accounts", "providers"}:
        await command(chat, "/hub " + action)
    elif action == "github":
        await say(chat, "輸入 /hub github 關鍵字，例如 /hub github telegram AI agent。")
    elif action in ("diagnostics","usage"):
        await command(chat,"/hub "+action)
    elif action.startswith("confirmplan:"):
        from ceres_model_ops import approve
        from fastapi import HTTPException
        try:
            result=approve(action[12:],chat)
            await say(chat,"已套用 Owner 確認的設定："+result["provider"],_menu())
        except HTTPException as exc:
            await say(chat,str(exc.detail),_menu())
