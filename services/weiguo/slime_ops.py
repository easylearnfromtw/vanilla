"""Slime owner notifications and privacy-gated approximate IP geolocation.

No external lookup is made without explicit on-device consent. Telegram receives
only owner-authorized node information; the notification is emitted after the
first authenticated heartbeat, not merely after claiming a pairing code.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
import ipaddress
import json
import os
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from zoneinfo import ZoneInfo


def valid_public_ip(value: str) -> str:
    if not isinstance(value,str) or len(value)>48:
        return ""
    try:
        address=ipaddress.ip_address(value)
        return str(address) if address.is_global else ""
    except ValueError:
        return ""


def score(cpu: int, ram_gb: float, gpu: str) -> int:
    """1–10000 hardware *estimate*, deliberately not a performance benchmark."""
    cpu=int(cpu or 0)
    ram=float(ram_gb or 0)
    gpu=str(gpu or "").lower()
    cpu_points=min(max(cpu,0),32)/32*3100
    ram_points=min(max(ram,0),128)/128*3000
    gpu_points=0
    if gpu:
        gpu_points=1000
        if "rtx" in gpu or "radeon rx" in gpu or "apple m" in gpu:
            gpu_points=2800
        elif "gtx" in gpu or "tesla" in gpu or "quadro" in gpu:
            gpu_points=1900
    return max(1,min(10000,round(100+cpu_points+ram_points+gpu_points)))


def coarse_location(ip: str) -> str:
    """Third-party lookup only after opt-in; unknown remains unknown."""
    ip=valid_public_ip(ip)
    if not ip:
        return "無法辨識（可能是代理或私人 IP）"
    try:
        req=Request("https://ipwho.is/"+ip,headers={"Accept":"application/json",
                                                     "User-Agent":"Vanilla-Slime/1"})
        with urlopen(req,timeout=5) as response:
            data=json.loads(response.read(2048).decode("utf-8"))
        if not isinstance(data,dict) or data.get("success") is not True:
            return "無法取得 IP 估測位置"
        parts=[]
        for key in ("country","region","city"):
            value=data.get(key)
            if isinstance(value,str) and 0<len(value)<90:
                parts.append(value)
        return "／".join(parts)[:180] or "無法取得 IP 估測位置"
    except (HTTPError,URLError,TimeoutError,OSError,ValueError,TypeError):
        return "IP 定位服務暫不可用"


async def notify_pairing(node_id: str) -> None:
    """Best effort and re-entrant; idempotent DB marker guards duplicate sends."""
    from slime import _db
    from ceres_admin_bot import _telegram, owner_subject
    with _db() as db:
        node=db.execute("SELECT * FROM nodes WHERE id=?",(node_id,)).fetchone()
    if not node or node["notified_at"]>=0:
        return
    location="未授權查詢"
    if node["geo_opt_in"]:
        location=await asyncio.to_thread(coarse_location,node["public_ip"])
    links={}
    try:
        links=json.loads(os.environ.get("CERES_FAMILY_LINKS_JSON","{}"))
    except (ValueError,TypeError):
        pass
    chats=[]
    if isinstance(links,dict):
        for raw,sub in links.items():
            try:
                chat=int(raw)
            except (ValueError,TypeError):
                continue
            if sub==node["owner"] and owner_subject(chat)==node["owner"]:
                chats.append(chat)
    ip=node["public_ip"] if node["geo_opt_in"] else "未授權分享"
    timestamp=datetime.fromtimestamp(
        node["paired_at"] or time.time(),tz=ZoneInfo("Asia/Taipei")
    ).strftime("%Y-%m-%d %H:%M:%S UTC+8")
    message=("\u2705 Slime 節點安裝並首次連線成功\n"
             "第 "+str(node["pair_number"] or "?")+" 個節點安裝成功\n"
             "裝置名稱："+node["label"]+"\n"
             "配置評分（硬體估算）："+str(score(node["cpu"],node["ram_gb"],node["gpu"]))+"/10000\n"
             "時間："+timestamp+"\n"
             "IP 位置："+ip+"\n"
             "位置（IP 約略估測）："+location+"\n"
             "作業系統："+(node["os"] or "尚未辨識")+"\n"
             "硬體："+(node["gpu"] or "未回報 GPU")+" · RAM "+str(node["ram_gb"])+" GB\n"
             "狀態：首次心跳確認；模型需另外核准與實測。")
    sent=False
    for chat in chats:
        if await _telegram("sendMessage",{"chat_id":chat,"text":message[:3500],
                                          "disable_web_page_preview":True}):
            sent=True
    with _db() as db:
        db.execute("UPDATE nodes SET notified_at=?,geo_area=? WHERE id=? AND notified_at=?",
                   (time.time() if sent else 0, location if node["geo_opt_in"] else "",
                    node_id,node["notified_at"]))
