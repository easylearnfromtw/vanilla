"""Server-only Gemini model gateway for verified Vanilla family sessions.

Never returns provider keys. Never accepts provider URLs, paths or arbitrary
tool calls from the browser. Users must explicitly approve cloud AI in UI.
"""
from __future__ import annotations
import asyncio
import os
import re
import time
from collections import deque
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from auth import FamilyIdentity, family_reader
from ceres_admin_policy import provider_key, provider_enabled, require_scope, reserve_shared_tokens
from ceres_model_catalog import selected_model

router=APIRouter(prefix="/v1/family/models",tags=["family-ai"])
_MODEL=re.compile(r"^gemini-[A-Za-z0-9.-]{3,64}$")
_recent:dict[str,deque[float]]={}
_lock=asyncio.Lock()

def _key():
    if provider_enabled("gemini") is False:
        return None
    key=provider_key("gemini")
    if not key:
        return None
    return key

def _model():
    model=selected_model("gemini") or os.getenv("WEIGUO_GEMINI_MODEL","gemini-2.5-flash").strip()
    return model if _MODEL.fullmatch(model) else None

def _access(user: FamilyIdentity, provider: str = "gemini"):
    require_scope(user.sub,user.email,provider)

@router.get("/status")
async def status(user:FamilyIdentity=Depends(family_reader)):
    _access(user)
    return {"ready":bool(_key() and _model()),"provider":"gemini","model":_model() or ""}

class Turn(BaseModel):
    role: str=Field(pattern="^(user|assistant)$")
    content: str=Field(min_length=1,max_length=5000)

class ChatRequest(BaseModel):
    turns:list[Turn]=Field(min_length=1,max_length=12)
    approved_cloud_send:bool=False

@router.post("/chat")
async def chat(body:ChatRequest,user:FamilyIdentity=Depends(family_reader)):
    _access(user)
    key,model=_key(),_model()
    if not key or not model:
        raise HTTPException(503,"Gemini API 尚未由 Ceres 管理中心啟用")
    if not body.approved_cloud_send:
        raise HTTPException(400,"未同意將本次對話送至 Gemini")
    now=time.monotonic()
    async with _lock:
        recent=_recent.setdefault(user.sub,deque())
        while recent and now-recent[0]>60:recent.popleft()
        if len(recent)>=5:
            raise HTTPException(429,"雲端模型每分鐘最多五次")
        recent.append(now)
    budget=sum(len(t.content.encode("utf-8"))+256 for t in body.turns)+1024
    if not reserve_shared_tokens(user.sub,budget):
        raise HTTPException(429,"今日共用雲端 API Token 額度不足")
    contents=[{"role":"model" if t.role=="assistant" else "user",
               "parts":[{"text":t.content}]} for t in body.turns]
    url="https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent"
    try:
        async with httpx.AsyncClient(timeout=35,follow_redirects=False,trust_env=False) as client:
            response=await client.post(url,headers={"x-goog-api-key":key},
                json={"contents":contents,"generationConfig":{"maxOutputTokens":1024,"temperature":0.4}})
    except httpx.HTTPError:
        raise HTTPException(502,"Gemini 連線暫不可用") from None
    if response.status_code==429:
        raise HTTPException(429,"Gemini API 配額不足或頻率受限")
    if response.status_code!=200:
        raise HTTPException(502,"Gemini 回應失敗，請在 Telegram 檢查服務憑證與額度")
    try:
        data=response.json()
        first=data["candidates"][0]["content"]["parts"]
        answer="".join(part.get("text","") for part in first if isinstance(part,dict))
        if not answer.strip():
            raise ValueError()
    except (ValueError,KeyError,IndexError,TypeError):
        raise HTTPException(502,"Gemini 未傳回有效文字") from None
    return {"text":answer[:10000],"model":model,"provider":"gemini"}


# Unified private cloud service, backed only by Owner-managed server vault keys.
# Never accept caller-supplied provider URLs, models, or upstream credentials.
from typing import Literal


class SharedChatRequest(ChatRequest):
    provider: Literal["gemini", "openai", "deepseek"]


@router.get("/shared/status")
async def shared_status(user: FamilyIdentity = Depends(family_reader)):
    rows=[]
    for provider in ("gemini","openai","deepseek"):
        try:
            _access(user,provider)
        except HTTPException:
            continue
        model=_model() if provider=="gemini" else selected_model(provider)
        rows.append({"provider":provider,"ready":bool(provider_key(provider) and model
                      and provider_enabled(provider) is not False),
                     "model":model or ""})
    return {"providers":rows}


@router.post("/shared/chat")
async def shared_chat(body: SharedChatRequest, user: FamilyIdentity = Depends(family_reader)):
    _access(user,body.provider)
    if body.provider == "gemini":
        return await chat(ChatRequest(turns=body.turns,approved_cloud_send=body.approved_cloud_send),user)
    if not body.approved_cloud_send:
        raise HTTPException(400,"未同意本次共用雲端 AI 傳送")
    if provider_enabled(body.provider) is False:
        raise HTTPException(503,"雲端供應商已停用")
    model=selected_model(body.provider)
    secret=provider_key(body.provider)
    if not model or not secret or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{1,95}",model):
        raise HTTPException(503,"尚未在 Ceres 設定可用模型與憑證")
    now=time.monotonic()
    async with _lock:
        recent=_recent.setdefault(user.sub,deque())
        while recent and now-recent[0]>60:recent.popleft()
        if len(recent)>=5:
            raise HTTPException(429,"每分鐘最多五次共用模型請求")
        recent.append(now)
    cost=sum(len(t.content.encode("utf-8"))+256 for t in body.turns)+1024
    if not reserve_shared_tokens(user.sub,cost):
        raise HTTPException(429,"今日共用雲端 API Token 額度不足")
    origin=({"openai":"https://api.openai.com/v1/chat/completions",
             "deepseek":"https://api.deepseek.com/chat/completions"})[body.provider]
    payload={"model":model,"messages":[{"role":t.role,"content":t.content} for t in body.turns],
             "max_tokens":1024,"temperature":0.4,"stream":False}
    try:
        async with httpx.AsyncClient(timeout=40,follow_redirects=False,trust_env=False) as client:
            response=await client.post(origin,json=payload,
                                       headers={"Authorization":"Bearer "+secret,
                                                "Content-Type":"application/json"})
    except httpx.HTTPError:
        raise HTTPException(502,"共用雲端 API 無法連線") from None
    if response.status_code==429:
        raise HTTPException(429,"共用雲端 API 已達供應商配額")
    if response.status_code!=200 or len(response.content)>150000:
        raise HTTPException(502,"共用雲端模型推論失敗")
    try:
        data=response.json()
        answer=data["choices"][0]["message"]["content"]
        if not isinstance(answer,str) or not answer.strip():
            raise ValueError("empty response")
    except (ValueError,TypeError,KeyError,IndexError):
        raise HTTPException(502,"共用雲端模型未提供有效回覆") from None
    return {"text":answer[:10000],"model":model,"provider":body.provider}
