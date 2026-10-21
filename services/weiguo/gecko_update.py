"""Gecko non-disruptive prefetch of verified official Slime releases.

Downloader only. It never runs executables, installs services, changes startup,
restarts processes, scans machines or writes outside its private cache.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import secrets
import threading
import time
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError

OFFICIAL="https://github.com/easylearnfromtw/vanilla"
RELEASES="https://api.github.com/repos/easylearnfromtw/vanilla/releases/tags/"
TAG=re.compile(r"^slime-v[A-Za-z0-9._-]{1,65}$")
RATE=192*1024
MAX_FILE=48*1024*1024
LOCK=threading.Lock()

def _platform_asset() -> str:
    names={"Windows":"Slime-Friend.exe","Darwin":"Slime-Friend-macos.zip",
           "Linux":"Slime-Friend-linux.tar.gz"}
    return names.get(platform.system(),"")

def _fetch(url:str,max_bytes:int=150000)->bytes:
    req=Request(url,headers={"User-Agent":"Vanilla-Gecko-Fleet/1","Accept":"application/json"})
    with urlopen(req,timeout=15) as f:
        content=f.read(max_bytes+1)
    if len(content)>max_bytes:raise ValueError("Gecko 遠端資料超過上限")
    return content

def _verify_release(tag:str,asset:str) -> tuple[str,str]:
    if not TAG.fullmatch(tag) or asset not in (
       "Slime-Friend.exe","Slime-Friend-macos.zip","Slime-Friend-linux.tar.gz"):
        raise ValueError("不支援的 Gecko 目標版本／平台")
    data=json.loads(_fetch(RELEASES+tag,180000))
    if data.get("tag_name")!=tag or data.get("draft") or data.get("prerelease"):
        raise ValueError("Gecko 目標版本不是官方正式版")
    root=OFFICIAL+"/releases/download/"+tag+"/"
    assets={}
    for a in data.get("assets",[]):
        name=a.get("name")
        if name in (asset,"SHA256SUMS.txt"):
            if a.get("browser_download_url")!=root+name:
                raise ValueError("安裝包官方來源不符合白名單")
            assets[name]=root+name
    if asset not in assets or "SHA256SUMS.txt" not in assets:
        raise ValueError("Release 尚未附上 SHA256 安裝包")
    checksum=_fetch(assets["SHA256SUMS.txt"],32768).decode("utf-8")
    expected=None
    for line in checksum.splitlines():
        row=re.fullmatch(r"([a-fA-F0-9]{64})\s+\*?(\S+)",line.strip())
        if row and row.group(2)==asset:
            expected=row.group(1).lower()
            break
    if expected is None:raise ValueError("官方安裝包缺少 SHA256")
    return assets[asset],expected

def _digest(path:Path)->str:
    sha=hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda:file.read(65536),b""):
            sha.update(chunk)
    return sha.hexdigest()

def _idle_enough() -> bool:
    """Best effort; never block a machine with existing high CPU load."""
    try:
        if hasattr(os,"getloadavg"):
            return os.getloadavg()[0] / max(1,os.cpu_count() or 1)<0.7
    except OSError:
        pass
    return True

def download_only(tag:str,*,cache_root:Path|None=None,stop:threading.Event|None=None)->dict:
    asset=_platform_asset()
    if not asset:raise ValueError("不支援的平台")
    if not _idle_enough():
        return {"skipped":"busy","autoInstalled":False}
    url,expected=_verify_release(tag,asset)
    root=cache_root or Path.home()/".vanilla"/"gecko-updates"
    directory=root/tag
    directory.mkdir(parents=True,exist_ok=True)
    try:
        directory.chmod(0o700)
    except OSError:
        pass
    dest=directory/asset
    if dest.is_file() and dest.stat().st_size<=MAX_FILE and _digest(dest)==expected:
        return {"cached":True,"version":tag,"asset":asset,"autoInstalled":False}
    temp=directory/("."+asset+"."+secrets.token_hex(6)+".part")
    cancel=stop or threading.Event()
    count=0
    hash_state=hashlib.sha256()
    try:
        req=Request(url,headers={"User-Agent":"Vanilla-Gecko-Fleet/1"})
        with urlopen(req,timeout=20) as source,temp.open("wb") as destination:
            while not cancel.is_set():
                start=time.monotonic()
                chunk=source.read(48*1024)
                if not chunk:break
                count+=len(chunk)
                if count>MAX_FILE:raise ValueError("更新超過大小上限")
                destination.write(chunk)
                hash_state.update(chunk)
                slow=max(0,len(chunk)/RATE-(time.monotonic()-start))
                if slow:cancel.wait(slow)
        if cancel.is_set():return {"skipped":"stopped","autoInstalled":False}
        if count==0 or hash_state.hexdigest()!=expected:
            raise ValueError("官方 Slime 更新檔 SHA256 驗證失敗")
        os.replace(temp,dest)
        return {"cached":True,"version":tag,"asset":asset,"autoInstalled":False}
    finally:
        temp.unlink(missing_ok=True)

def sync_once(server:str,token:str)->dict:
    """Poll a node-bound desired tag, prefetch cache, do not execute it."""
    from slime_runner_agent import _http
    if not LOCK.acquire(blocking=False):
        return {"skipped":"already-checking","autoInstalled":False}
    try:
        desired=_http("GET",server+"/v1/gecko/agent/desired",
                      authorization=token,timeout=12)
        if not desired.get("inCanary") or not desired.get("downloadOnly"):
            return {"skipped":"not-in-rollout","autoInstalled":False}
        target=desired.get("desiredVersion","")
        if not isinstance(target,str) or not TAG.fullmatch(target):
            return {"skipped":"invalid-target","autoInstalled":False}
        return download_only(target)
    finally:
        LOCK.release()

def sync_best_effort(server:str,token:str)->None:
    try:
        result=sync_once(server,token)
        if result.get("cached"):
            print("Gecko 官方更新檔已校驗並預載；不會自動安裝或重啟。")
    except (OSError,ValueError,HTTPError,URLError,TimeoutError,KeyError,TypeError):
        # Update prefetch is optional; never interrupt heartbeats or Ollama.
        pass
