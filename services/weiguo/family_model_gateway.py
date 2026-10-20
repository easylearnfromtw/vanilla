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
from ceres_admin_policy import provider_key, provider_enabled, check_identity, enforce
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

def _access(user: FamilyIdentity):
    if enforce():
        check_identity(user.sub,user.email,scope="gemini")
    elif user.role!="owner":
        raise HTTPException(403,"雲端共用模型僅供受權帳號")

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
