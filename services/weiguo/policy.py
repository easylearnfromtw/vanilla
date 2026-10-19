"""衞國 browser policy. This is defense-in-depth, not network sandboxing."""
from __future__ import annotations
import ipaddress
import os
import re
import socket
from urllib.parse import urlsplit
from typing import Any

ALLOWED_ACTIONS = frozenset(("navigate", "extract", "scroll", "click", "fill"))
WRITE_ACTIONS = frozenset(("click", "fill"))
FORBIDDEN_URL_SCHEMES = ("file:", "data:", "javascript:", "blob:")
INTERACTIVE_TEXT = re.compile(r"(purchase|checkout|transfer|pay|delete|remove account|password|credit card|付款|轉帳|結帳|刪除|密碼|驗證碼)", re.I)

class PolicyError(ValueError):
    pass

def allow_hosts(raw: str | None = None) -> set[str]:
    hosts = (raw if raw is not None else os.environ.get("WEIGUO_ALLOWED_HOSTS", "")).split(",")
    return {x.strip().lower().rstrip(".") for x in hosts if x.strip()}

def validate_url(raw: str, allowed: set[str], *, check_dns: bool = False) -> str:
    if not isinstance(raw, str) or len(raw) > 2048 or any(ord(c) < 32 for c in raw):
        raise PolicyError("網址不合法")
    parts = urlsplit(raw)
    host = (parts.hostname or "").lower().rstrip(".")
    if parts.scheme != "https" or not host or parts.username or parts.password or parts.fragment:
        raise PolicyError("僅允許無帳密、無片段的 HTTPS 網址")
    try:
        port=parts.port
    except ValueError as e:
        raise PolicyError("連接埠格式錯誤") from e
    if port not in (None, 443):
        raise PolicyError("不允許自訂連接埠")
    if host not in allowed:
        raise PolicyError("網址不在後端明確允許的主機清單")
    if host == "localhost" or host.endswith((".localhost",".local",".internal")):
        raise PolicyError("禁止內部網域")
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
    except ValueError:
        ip = None
    if ip and not ip.is_global:
        raise PolicyError("禁止私有或保留 IP")
    if check_dns:
        try:
            addresses = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
        except OSError as e:
            raise PolicyError("DNS 驗證失敗") from e
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise PolicyError("DNS 解析到非公開 IP")
    return raw

def validate_steps(raw: Any, *, approved: bool = False, allow_mutations: bool = False) -> list[dict[str, Any]]:
    if not isinstance(raw, list) or not 1 <= len(raw) <= 12:
        raise PolicyError("需要 1–12 個步驟")
    validated: list[dict[str, Any]] = []
    for step in raw:
        if not isinstance(step, dict):
            raise PolicyError("步驟格式不正確")
        action = step.get("action")
        if action not in ALLOWED_ACTIONS:
            raise PolicyError("不允許的瀏覽器動作")
        if action in WRITE_ACTIONS and (not approved or not allow_mutations):
            raise PolicyError("點擊及輸入必須由受信任的使用者核准，並在後端明確開啟")
        selector = step.get("selector", "")
        if selector and (not isinstance(selector, str) or len(selector) > 240 or any(c in selector for c in "\r\n\x00")):
            raise PolicyError("選擇器長度或內容不正確")
        text = step.get("text", "")
        if not isinstance(text, str) or len(text) > 1200:
            raise PolicyError("輸入文字過長")
        if action in WRITE_ACTIONS and INTERACTIVE_TEXT.search(str(selector)+" "+text):
            raise PolicyError("禁止自動操作付款、帳號安全及不可逆修改")
        amount = step.get("pixels", 600)
        if action == "scroll" and (not isinstance(amount, int) or not -2000 <= amount <= 2000):
            raise PolicyError("捲動距離超出限制")
        if action == "navigate" and not isinstance(step.get("url"),str):
            raise PolicyError("導覽步驟須提供 URL")
        if action in ("click","fill") and not selector:
            raise PolicyError("互動步驟需要明確的選擇器")
        validated.append({k:step[k] for k in ("action","selector","text","url","pixels") if k in step})
    return validated

def validate_tools_manifest(tools: Any) -> list[dict[str, Any]]:
    """Plugin specs only; never import or evaluate user-supplied Python/JS."""
    if not isinstance(tools, list) or len(tools) > 30:
        raise PolicyError("工具清單最多 30 筆")
    out = []
    allowed = frozenset(("navigate","click","fill","scroll","extract","research","analyze","chart","read-file","schedule","plan"))
    ids = set()
    for item in tools:
        if not isinstance(item, dict) or not re.fullmatch(r"[a-z][a-z0-9-]{1,39}",str(item.get("id",""))):
            raise PolicyError("工具 ID 格式錯誤")
        tool_id = item["id"]
        if tool_id in ids: raise PolicyError("重複的工具 ID")
        ids.add(tool_id)
        caps = item.get("capabilities",[])
        if not isinstance(caps,list) or not caps or not set(caps).issubset(allowed):
            raise PolicyError("不支援的工具能力")
        out.append({"id":tool_id,"name":str(item.get("name",""))[:64],"capabilities":caps,"enabled":False})
    return out
