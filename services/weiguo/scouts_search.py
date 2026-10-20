"""Scouts: independent, authenticated search provider pool for Detroit.

Brave and Tavily are separate general-web indexes/services, not Google Search
scrapers and not Gemini grounding. Credentials exist ONLY on Railway, and no
query, credential or response body is persisted. Search never executes code.
"""
from __future__ import annotations
import asyncio
import html
import ipaddress
import os
import re
import time
from urllib.parse import urlsplit
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from auth import FamilyIdentity, family_reader

router=APIRouter()
LIMIT:dict[str,list[float]]={}
LOCK=asyncio.Lock()
MAX_REQUESTS_PER_MINUTE=6
BRAVE="https://api.search.brave.com/res/v1/web/search"
TAVILY="https://api.tavily.com/search"

class ScoutsQuery(BaseModel):
    query:str=Field(min_length=2,max_length=180)
    region:str=Field(default="台灣",min_length=2,max_length=40)

def providers()->list[str]:
    enabled=[]
    if os.environ.get("WEIGUO_SCOUTS_BRAVE_API_KEY","").strip():enabled.append("Brave")
    if os.environ.get("WEIGUO_SCOUTS_TAVILY_API_KEY","").strip():enabled.append("Tavily")
    return enabled

def clean(text:object,maxlen:int=600)->str:
    return html.unescape(re.sub(r"<[^>]+>"," ",str(text or ""))).replace("\x00"," ").strip()[:maxlen]

def safe_public_url(value:object)->str|None:
    if not isinstance(value,str) or len(value)>2000:return None
    try:
        u=urlsplit(value)
        if u.scheme!="https" or not u.hostname or u.port not in (None,443) or u.username or u.password:return None
        h=u.hostname.lower()
        if h in {"localhost","metadata.google.internal","instance-data"} or h.endswith((".local",".internal",".localhost",".test",".example")):return None
        if h.startswith("xn--") and len(h)<5:return None
        try:
            ipaddress.ip_address(h)
            return None
        except ValueError:pass
        if not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+",h):return None
        return value.split("#",1)[0]
    except (ValueError,UnicodeError):return None

def regional(hit:dict,region:str)->bool:
    host=urlsplit(hit["url"]).hostname or ""
    if region.lower() in {"台灣","臺灣","taiwan","tw"}:
        return host.endswith(".tw") or any(x in (hit["title"]+" "+hit["snippet"]).lower() for x in ("台灣","臺灣","taiwan"))
    return region.casefold() in (hit["title"]+" "+hit["snippet"]).casefold()

def choose_sources(hits:list[dict],region:str)->list[dict]:
    clean_hits:list[dict]=[]
    seen:set[str]=set()
    for item in hits:
        url=safe_public_url(item.get("url"))
        if not url:continue
        key=url.split("?",1)[0].rstrip("/")
        if key in seen:continue
        seen.add(key)
        clean_hits.append({
         "title":clean(item.get("title") or url,160),"url":url,
         "snippet":clean(item.get("snippet"),500),
         "provider":str(item.get("provider") or "unknown")[:30],
         "excerpt":clean(item.get("excerpt"),6000),
         "kind":"full" if len(str(item.get("excerpt") or ""))>=120 else "snippet",
        })
    primary=[x for x in clean_hits if not regional(x,region)][:3]
    for hit in clean_hits:
        if len(primary)>=3:break
        if hit not in primary:primary.append(hit)
    local=next((x for x in clean_hits if regional(x,region) and x not in primary),None)
    if local:primary.append(local)
    for hit in primary:hit["regionSpecific"]=regional(hit,region)
    return primary

async def provider_search(provider:str,query:str,region:str)->list[dict]:
    # The only outbound destinations are two immutable, audited API URLs.
    settings={"timeout":httpx.Timeout(9.0),"follow_redirects":False}
    async with httpx.AsyncClient(**settings) as client:
        if provider=="Brave":
            key=os.environ["WEIGUO_SCOUTS_BRAVE_API_KEY"]
            tw=region.casefold() in {"台灣","臺灣","taiwan","tw"}
            response=await client.get(BRAVE,
             params={"q":query,"count":8,"country":"TW" if tw else "ALL",
                     "search_lang":"zh-hant" if tw else "en","ui_lang":"zh-TW" if tw else "en-US"},
             headers={"Accept":"application/json","X-Subscription-Token":key})
            if response.status_code!=200:raise RuntimeError("Brave HTTP "+str(response.status_code))
            if len(response.content)>1_400_000:raise RuntimeError("Brave 回應過大")
            payload=response.json()
            return [{"title":h.get("title"),"url":h.get("url"),"snippet":h.get("description"),
                     "provider":"Brave"} for h in (payload.get("web",{}).get("results") or [])[:8]]
        if provider=="Tavily":
            key=os.environ["WEIGUO_SCOUTS_TAVILY_API_KEY"]
            response=await client.post(TAVILY,headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"},
              json={"query":query,"search_depth":"basic","topic":"general","max_results":8,
                    "include_raw_content":"markdown","include_answer":False})
            if response.status_code!=200:raise RuntimeError("Tavily HTTP "+str(response.status_code))
            if len(response.content)>1_400_000:raise RuntimeError("Tavily 回應過大")
            payload=response.json()
            return [{"title":h.get("title"),"url":h.get("url"),"snippet":h.get("content"),
                     "excerpt":h.get("raw_content"),"provider":"Tavily"} for h in (payload.get("results") or [])[:8]]
    return []

async def quota(sub:str)->None:
    async with LOCK:
        now=time.monotonic()
        recent=[t for t in LIMIT.get(sub,[]) if now-t<60]
        if len(recent)>=MAX_REQUESTS_PER_MINUTE:
            raise HTTPException(429,"Scouts 每分鐘最多 6 次搜尋，以保護第三方 API 額度")
        LIMIT[sub]=recent+[now]
        # At most 30 identities; clear stale entries to bound memory.
        if len(LIMIT)>30:
            for who in list(LIMIT):
                if not LIMIT[who] or now-LIMIT[who][-1]>60:LIMIT.pop(who,None)

@router.get("/v1/family/scouts/status")
async def scouts_status(_user:FamilyIdentity=Depends(family_reader)):
    available=providers()
    return {"ready":bool(available),"providers":available,"regionDefault":"台灣",
            "note":"後端獨立搜尋服務，不使用 Gemini 搜尋額度。尚無供應商金鑰時不宣稱可搜尋全網。"}

@router.post("/v1/family/scouts/search")
async def scouts_search(payload:ScoutsQuery,user:FamilyIdentity=Depends(family_reader)):
    if not providers():raise HTTPException(503,"衞國 Scouts 尚未設定 Brave 或 Tavily 搜尋服務")
    await quota(user.sub)
    query=payload.query.strip()
    region=payload.region.strip()
    if not query or not region or re.search(r"[\x00-\x1f]",query+region):
        raise HTTPException(400,"Scouts 搜尋主題或地區無效")
    hits:list[dict]=[]
    errors:list[str]=[]
    used:list[str]=[]
    for provider in providers():
        try:
            found=await provider_search(provider,query,region)
            used.append(provider);hits.extend(found)
            if len(choose_sources(hits,region))>=4:break
        except (httpx.HTTPError,RuntimeError,ValueError,KeyError) as error:
            errors.append(clean(str(error),110))
    if hits and not any(regional(x,region) for x in choose_sources(hits,region)):
        # One independent, bounded local query only with a configured provider.
        for provider in used[:1]:
            try:
                hits.extend(await provider_search(provider,query+" "+region,region))
            except (httpx.HTTPError,RuntimeError,ValueError,KeyError) as error:
                errors.append("地區搜尋："+clean(str(error),110))
    selected=choose_sources(hits,region)
    return {"results":selected,"providers":used,"errors":errors,"region":region,
            "complete":len(selected)>=4 and any(x["regionSpecific"] for x in selected)}
