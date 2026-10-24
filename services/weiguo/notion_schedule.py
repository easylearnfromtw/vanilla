"""Notion scheduling board adapter for Detroit.

Notion is a task/calendar data store, NOT an always-on job runner. The backend
uses a server-only integration token, a fixed shared data source and an HMAC
owner marker to prevent one Vanilla account from listing/editing another's rows.
This router never accepts credentials, Notion URLs, arbitrary property names,
or instructions for tools from the public PWA.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
from datetime import datetime
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import FamilyIdentity, family_reader
from gas_relay import gas_provider_enabled, gas_service_call, _relay as gas_relay

router = APIRouter(prefix="/v1/family/notion", tags=["notion"])
VERSION = "2026-03-11"
HOST = "https://api.notion.com"
OWNER = "Vanilla Owner"
TITLE = "Name"
WHEN = "When"
DONE = "Done"


class ScheduledTask(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    when: str = Field(min_length=16, max_length=50)
    details: str = Field(default="", max_length=1800)


class NewTime(BaseModel):
    when: str = Field(min_length=16, max_length=50)


def configured() -> bool:
    token = os.getenv("WEIGUO_NOTION_TOKEN", "")
    source = os.getenv("WEIGUO_NOTION_DATA_SOURCE_ID", "")
    return (
        os.getenv("WEIGUO_NOTION_ENABLED", "false").lower() == "true"
        and (gas_provider_enabled("notion") or len(token) >= 20)
        and _uuid(source) is not None
        and len(os.getenv("WEIGUO_SESSION_SECRET", "")) >= 32
    )


def _uuid(value: str) -> str | None:
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        return None


def _settings() -> tuple[str, str]:
    if not configured():
        raise HTTPException(503, "Notion 排程尚未由伺服器管理員啟用")
    return ("" if gas_provider_enabled("notion") else os.environ["WEIGUO_NOTION_TOKEN"]), str(UUID(os.environ["WEIGUO_NOTION_DATA_SOURCE_ID"]))


def _owner(sub: str) -> str:
    key = os.environ.get("WEIGUO_SESSION_SECRET", "")
    if len(key) < 32:
        raise HTTPException(503, "工作階段簽章金鑰未配置")
    return hmac.new(key.encode(), ("notion-schedule:" + sub).encode(), hashlib.sha256).hexdigest()


def _date(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("timezone required")
        return parsed.isoformat(timespec="seconds")
    except (TypeError, ValueError, OverflowError) as exc:
        raise HTTPException(422, "日期必須是含時區的 ISO 8601 格式，例如 2026-11-01T09:00:00+08:00") from exc


async def _call(method: str, path: str, payload: dict | None = None) -> dict:
    token, source = _settings()
    if gas_provider_enabled("notion"):
        if method == "POST" and path == "/v1/data_sources/" + source + "/query":
            try:
                tag = payload["filter"]["rich_text"]["equals"]
            except (TypeError, KeyError):
                raise HTTPException(400, "Notion 查詢擁有者條件無效") from None
            operation, data = "query_tasks", {"owner_tag": tag}
        elif method == "GET" and path.startswith("/v1/pages/") and _uuid(path.removeprefix("/v1/pages/")):
            operation, data = "read_task", {"page_id": path.removeprefix("/v1/pages/")}
        elif method == "POST" and path == "/v1/pages" and isinstance(payload, dict):
            try:
                props = payload["properties"]
                operation, data = "create_task", {
                    "title": props[TITLE]["title"][0]["text"]["content"],
                    "when": props[WHEN]["date"]["start"],
                    "owner_tag": props[OWNER]["rich_text"][0]["text"]["content"],
                    "details": ((payload.get("children") or [{}])[0].get("paragraph", {})
                              .get("rich_text", [{}])[0].get("text", {}).get("content", "")),
                }
            except (TypeError, KeyError, IndexError):
                raise HTTPException(400, "Notion 建立資料格式無效") from None
        elif method == "PATCH" and path.startswith("/v1/pages/") and _uuid(path.removeprefix("/v1/pages/")):
            operation, data = "update_task", {"page_id": path.removeprefix("/v1/pages/"),
                                               "properties": (payload or {}).get("properties", {})}
        else:
            raise HTTPException(400, "不支援的 Notion GAS 操作")
        result = await gas_service_call("notion", operation, data)
        reply = result.get("data")
        if not isinstance(reply, dict):
            raise HTTPException(502, "Notion GAS 回應格式無效")
        return reply
    # No caller-supplied URLs, redirects or credentials. Timeouts prevent
    # hung phone requests; do not retry non-idempotent writes automatically.
    headers = {
        "Authorization": "Bearer " + token,
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False, trust_env=False) as client:
            response = await client.request(method, HOST + path, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Notion API 連線失敗") from exc
    if response.status_code == 429:
        raise HTTPException(503, "Notion API 已達流量限制，請稍後重試")
    if response.status_code == 404:
        raise HTTPException(502, "Notion 資料來源不存在或尚未分享給 Integration")
    if response.status_code == 403:
        raise HTTPException(502, "Notion Integration 缺少必要的內容存取權限")
    if not 200 <= response.status_code < 300:
        raise HTTPException(502, "Notion API 回覆錯誤：" + str(response.status_code))
    if len(response.content) > 1_000_000:
        raise HTTPException(502, "Notion 回傳資料超出安全上限")
    try:
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError("unexpected shape")
        return result
    except ValueError as exc:
        raise HTTPException(502, "Notion 回傳格式不正確") from exc


def _texts(value: dict, kind: str) -> str:
    return "".join(item.get("plain_text", item.get("text", {}).get("content", ""))
                   for item in value.get(kind, []) if isinstance(item, dict))


def _row(page: dict) -> dict:
    props = page.get("properties", {})
    if not isinstance(props, dict):
        props = {}
    time = props.get(WHEN, {}).get("date") or {}
    return {
        "id": page.get("id", ""),
        "title": _texts(props.get(TITLE, {}), "title"),
        "when": time.get("start"),
        "done": bool(props.get(DONE, {}).get("checkbox")),
        "url": page.get("url", ""),
    }


def _owned(page: dict, source: str, sub: str) -> bool:
    parent = page.get("parent", {})
    prop = page.get("properties", {}).get(OWNER, {})
    return (
        parent.get("type") == "data_source_id"
        and _uuid(parent.get("data_source_id", "")) == source
        and hmac.compare_digest(_texts(prop, "rich_text"), _owner(sub))
    )


async def _owned_page(page_id: str, sub: str) -> dict:
    _, source = _settings()
    identifier = _uuid(page_id)
    if identifier is None:
        raise HTTPException(404, "找不到這項排程")
    page = await _call("GET", "/v1/pages/" + identifier)
    if not _owned(page, source, sub):
        raise HTTPException(404, "找不到這項排程")
    return page


@router.get("/status")
async def status(user: FamilyIdentity = Depends(family_reader)):
    active=configured()
    if active and gas_provider_enabled("notion"):
        try:
            summary=await gas_relay({"action": "status"})
            active=bool(summary.get("providers", {}).get("notion", {}).get("configured"))
        except HTTPException:
            active=False
    return {"configured": active, "schedulerActive": False,
            "capabilities": ["list", "create", "complete", "reschedule"],
            "note": "Notion 只同步行程；到點自動通知及執行需另外部署 Chronos"}


@router.get("/tasks")
async def list_tasks(user: FamilyIdentity = Depends(family_reader)):
    _, source = _settings()
    payload = {"page_size": 50, "filter": {"property": OWNER, "rich_text": {"equals": _owner(user.sub)}}}
    response = await _call("POST", "/v1/data_sources/" + source + "/query", payload)
    rows = response.get("results", [])
    if not isinstance(rows, list):
        raise HTTPException(502, "Notion 回傳資料格式不正確")
    return {"tasks": [_row(page) for page in rows
                      if isinstance(page, dict) and _owned(page, source, user.sub)],
            "hasMore": bool(response.get("has_more"))}


@router.post("/tasks", status_code=201)
async def create_task(task: ScheduledTask, user: FamilyIdentity = Depends(family_reader)):
    _, source = _settings()
    title = task.title.strip()
    if not title:
        raise HTTPException(422, "請輸入排程名稱")
    props = {
        TITLE: {"title": [{"text": {"content": title}}]},
        WHEN: {"date": {"start": _date(task.when)}},
        OWNER: {"rich_text": [{"text": {"content": _owner(user.sub)}}]},
        DONE: {"checkbox": False},
    }
    payload = {"parent": {"type": "data_source_id", "data_source_id": source}, "properties": props}
    if task.details.strip():
        payload["children"] = [{
            "object": "block", "type": "paragraph",
            "paragraph": {"rich_text": [{"type": "text", "text": {"content": task.details.strip()}}]},
        }]
    return _row(await _call("POST", "/v1/pages", payload))


@router.post("/tasks/{page_id}/complete")
async def complete_task(page_id: str, user: FamilyIdentity = Depends(family_reader)):
    await _owned_page(page_id, user.sub)
    identifier = str(UUID(page_id))
    return _row(await _call("PATCH", "/v1/pages/" + identifier,
                            {"properties": {DONE: {"checkbox": True}}}))


@router.post("/tasks/{page_id}/reschedule")
async def reschedule_task(page_id: str, when: NewTime, user: FamilyIdentity = Depends(family_reader)):
    await _owned_page(page_id, user.sub)
    identifier = str(UUID(page_id))
    return _row(await _call("PATCH", "/v1/pages/" + identifier,
                            {"properties": {WHEN: {"date": {"start": _date(when.when)}}}}))
