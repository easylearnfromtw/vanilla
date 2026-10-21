"""Gecko: opt-in, throttled Slime installer mirror and no-code LAN onboarding.

No LAN enumeration, arbitrary device interaction, silent install, remote
execution, remote file access, VPN, or credential sharing. Hosts explicitly opt
in; recipients explicitly choose the local host before joining. Each receiver
uses an ephemeral 120-second HTTPS-backend pairing ticket, never the host bearer.
"""
from __future__ import annotations

import hashlib
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import threading
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DISCOVER_PORT=41437
WEB_PORT=41438
DISCOVER_QUERY=b"VANILLA_GECKO_DISCOVER_V1"
DOWNLOAD_RATE=384*1024  # bytes per second, one transfer per host
MAX_INSTALLER_BYTES=48*1024*1024
OFFICIAL="https://github.com/easylearnfromtw/vanilla"
API="https://api.github.com/repos/easylearnfromtw/vanilla/releases/latest"
FILES=("Slime-Friend.exe","Slime-Friend-macos.zip","Slime-Friend-linux.tar.gz")
TAG=re.compile(r"^slime-v[A-Za-z0-9._-]{1,65}$")
TICKET=re.compile(r"^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$")
TRANSFER=threading.Lock()


def _local_ipv4() -> str:
    """Select one private LAN interface, without sending a probe packet."""
    sock=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1",9))
        value=sock.getsockname()[0]
    finally:
        sock.close()
    ip=ipaddress.ip_address(value)
    if not isinstance(ip,ipaddress.IPv4Address) or not ip.is_private or ip.is_loopback:
        raise ValueError("沒有可用的私人 IPv4 網路，Gecko 不會向公網開放")
    return value


def _same_lan(peer: str, host: str) -> bool:
    try:
        address=ipaddress.ip_address(peer)
        if not isinstance(address,ipaddress.IPv4Address):
            return False
        return address in ipaddress.ip_network(host+"/24",strict=False)
    except ValueError:
        return False


def _json(url: str, limit: int=131072):
    req=Request(url,headers={"User-Agent":"Vanilla-Gecko/1","Accept":"application/vnd.github+json"})
    with urlopen(req,timeout=12) as response:
        body=response.read(limit+1)
    if len(body)>limit:
        raise ValueError("官方發行資訊過大")
    return json.loads(body.decode("utf-8"))


def official_manifest() -> dict:
    release=_json(API)
    tag=release.get("tag_name","")
    if not isinstance(tag,str) or not TAG.fullmatch(tag) or release.get("draft") or release.get("prerelease"):
        raise ValueError("未找到可用的正式 Slime 發行版")
    prefix=OFFICIAL+"/releases/download/"+tag+"/"
    urls={}
    for item in release.get("assets",[]):
        name=item.get("name")
        if name in FILES+("SHA256SUMS.txt",):
            url=item.get("browser_download_url","")
            if not isinstance(url,str) or url!=prefix+name:
                raise ValueError("發行資產來源不符合官方規範")
            urls[name]=url
    if set(urls)!=set(FILES+("SHA256SUMS.txt",)):
        raise ValueError("官方發行資產不足")
    req=Request(urls["SHA256SUMS.txt"],headers={"User-Agent":"Vanilla-Gecko/1"})
    with urlopen(req,timeout=12) as response:
        checksum=response.read(32769)
    if len(checksum)>32768:
        raise ValueError("官方 SHA256 清單無效")
    hashes={}
    for line in checksum.decode("utf-8").splitlines():
        match=re.fullmatch(r"([a-fA-F0-9]{64})\s+\*?(\S+)",line.strip())
        if match:
            hashes[match.group(2)]=match.group(1).lower()
    if not all(name in hashes for name in FILES):
        raise ValueError("官方安裝包缺少 SHA256")
    return {"tag":tag,"urls":urls,"hashes":hashes}


def _stream_cache(manifest:dict, target:Path, stop:threading.Event) -> None:
    target.mkdir(parents=True,exist_ok=True)
    for name in FILES:
        if stop.is_set():return
        destination=target/name
        digest=manifest["hashes"][name]
        if destination.is_file() and destination.stat().st_size<=MAX_INSTALLER_BYTES:
            if hashlib.file_digest(destination.open("rb"),"sha256").hexdigest()==digest:
                continue
        temp=target/("."+name+"."+secrets.token_hex(6)+".part")
        try:
            total=0
            hash_state=hashlib.sha256()
            req=Request(manifest["urls"][name],headers={"User-Agent":"Vanilla-Gecko/1"})
            with urlopen(req,timeout=20) as response, open(temp,"wb") as out:
                while not stop.is_set():
                    start=time.monotonic()
                    data=response.read(64*1024)
                    if not data:break
                    total+=len(data)
                    if total>MAX_INSTALLER_BYTES:raise ValueError("安裝包超出大小上限")
                    hash_state.update(data);out.write(data)
                    elapsed=time.monotonic()-start
                    if elapsed<len(data)/DOWNLOAD_RATE:
                        stop.wait(len(data)/DOWNLOAD_RATE-elapsed)
            if stop.is_set():return
            if total==0 or hash_state.hexdigest()!=digest:
                raise ValueError("官方 Slime 安裝包 SHA256 驗證不符")
            os.replace(temp,destination)
        except (OSError,HTTPError,URLError,TimeoutError,ValueError):
            # Local mirroring is optional, never blocks public GitHub downloads.
            pass
        finally:
            temp.unlink(missing_ok=True)


def _page(name: str, host: str, manifest: dict|None, cache:Path) -> bytes:
    items=[]
    for file in FILES:
        title={"Slime-Friend.exe":"Windows","Slime-Friend-macos.zip":"macOS",
               "Slime-Friend-linux.tar.gz":"Linux"}[file]
        tag=manifest["tag"] if manifest else ""
        source=(f"/file/{file}" if manifest and (cache/file).is_file() else
                f"{OFFICIAL}/releases/latest")
        items.append(f'<a href="{html.escape(source,quote=True)}" rel="noopener noreferrer">'+
                     f'下載 {title} Slime Friend</a>')
    return ("""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Gecko · Slime 區域網路安裝</title>
<style>:root{font-family:system-ui,-apple-system,sans-serif;background:#f6f6f7;color:#171717}
main{max-width:500px;background:white;margin:7vh auto;padding:32px;border-radius:24px;border:1px solid #ddd}
a{display:block;padding:16px;margin:9px 0;border-radius:12px;background:#19191c;color:#fff;text-align:center;text-decoration:none}
small,p{color:#73737a;line-height:1.8;font-size:13px}h1{letter-spacing:-.05em}</style></head><body>
<main><small>VANILLA / GECKO / LAN</small><h1>同一個網路，加入 Slime。</h1>
<p>這台電腦的主人已自願開啟 Gecko 分享。你可以自行選擇下載官方安裝包；不會自動下載、安裝或啟用任何功能。</p>"""+
"".join(items)+
f"""<p>下載完成後開啟 Slime Friend，選擇「附近 Gecko 分享」，確認加入即可；不需向 Telegram 索取配對碼。</p>
<small>提供裝置：{html.escape(name)} · 僅限已同意的同網路裝置 · {html.escape(tag if manifest else "官方 Releases")}
· 模型推論預設停用，必須由 Owner 額外核准。</small></main></body></html>""").encode("utf-8")


class GeckoHost:
    """Explicitly launched foreground LAN service with optional low-priority cache."""
    def __init__(self,settings:dict,cache_dir:Path|None=None):
        self.settings=settings
        self.ip=_local_ipv4()
        self.stop=threading.Event()
        self.cache=cache_dir or (Path.home()/".vanilla"/"gecko-cache")
        self.manifest=None
        self.http=None
        self.threads=[]

    def _http_handler(self):
        host=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*_):
                pass
            def _allowed(self):
                return _same_lan(self.client_address[0],host.ip)
            def _send(self,status,content,kind="application/json"):
                self.send_response(status)
                self.send_header("Content-Type",kind)
                self.send_header("Content-Length",str(len(content)))
                self.send_header("Cache-Control","no-store")
                self.send_header("X-Content-Type-Options","nosniff")
                self.send_header("X-Frame-Options","DENY")
                self.send_header("Access-Control-Allow-Origin","null" if False else "none")
                self.end_headers()
                self.wfile.write(content)
            def do_GET(self):
                if not self._allowed():return self._send(403,b"Forbidden","text/plain")
                if self.path=="/":
                    return self._send(200,_page(host.settings["label"],host.ip,host.manifest,host.cache),"text/html; charset=utf-8")
                if self.path=="/manifest":
                    data={"type":"vanilla-gecko-v1","label":host.settings["label"],
                          "server":host.settings["server"],"cached":[x for x in FILES if (host.cache/x).is_file()]}
                    return self._send(200,json.dumps(data).encode("utf-8"))
                name=self.path.removeprefix("/file/")
                if self.path.startswith("/file/") and name in FILES and host.manifest:
                    file=host.cache/name
                    if not file.is_file() or file.stat().st_size>MAX_INSTALLER_BYTES:
                        return self._send(404,b"Not Found","text/plain")
                    if not TRANSFER.acquire(blocking=False):
                        return self._send(429,b"Transfer in progress","text/plain")
                    try:
                        length=file.stat().st_size
                        self.send_response(200)
                        self.send_header("Content-Type","application/octet-stream")
                        self.send_header("Content-Disposition",'attachment; filename="'+name+'"')
                        self.send_header("Content-Length",str(length))
                        self.send_header("Cache-Control","no-store")
                        self.send_header("X-Content-Type-Options","nosniff")
                        self.end_headers()
                        with file.open("rb") as stream:
                            while not host.stop.is_set():
                                begin=time.monotonic()
                                chunk=stream.read(64*1024)
                                if not chunk:break
                                self.wfile.write(chunk)
                                pace=len(chunk)/DOWNLOAD_RATE-(time.monotonic()-begin)
                                if pace>0:host.stop.wait(pace)
                    except (BrokenPipeError,ConnectionResetError,OSError):
                        pass
                    finally:
                        TRANSFER.release()
                    return
                return self._send(404,b"Not Found","text/plain")
            def do_POST(self):
                if not self._allowed():return self._send(403,b"Forbidden","text/plain")
                if self.path!="/invite" or self.headers.get("X-Gecko-Consent")!="v1" or self.headers.get("Content-Type")!="application/json":
                    return self._send(403,b'{"error":"explicit recipient consent required"}')
                try:
                    n=int(self.headers.get("Content-Length","0"))
                    if n<2 or n>512:raise ValueError()
                    obj=json.loads(self.rfile.read(n))
                    if obj!={"consent":True}:raise ValueError()
                    # Parent-only bearer is sent to WeiGuo over HTTPS, never LAN.
                    from slime_runner_agent import _http
                    out=_http("POST",host.settings["server"]+"/v1/slime/node/gecko/invite",
                              {},authorization=host.settings["token"],timeout=12)
                    ticket=out.get("ticket")
                    if not isinstance(ticket,str) or not TICKET.fullmatch(ticket):
                        raise ValueError()
                    return self._send(200,json.dumps({"ticket":ticket}).encode("utf-8"))
                except (OSError,ValueError,URLError,HTTPError,TimeoutError):
                    return self._send(503,b'{"error":"Gecko pairing unavailable"}')
        return Handler

    def start(self,mirror=True):
        from slime_runner_agent import _http,_heartbeat
        _heartbeat(self.settings["server"],self.settings["token"])
        _http("POST",self.settings["server"]+"/v1/slime/node/gecko/enable",
              {"enabled":True},authorization=self.settings["token"])
        try:
            self.http=ThreadingHTTPServer((self.ip,WEB_PORT),self._http_handler())
            server_thread=threading.Thread(target=self.http.serve_forever,daemon=True)
            server_thread.start();self.threads.append(server_thread)
            udp_thread=threading.Thread(target=self._discovery_loop,daemon=True)
            udp_thread.start();self.threads.append(udp_thread)
            if mirror:
                cache_thread=threading.Thread(target=self._cache_loop,daemon=True)
                cache_thread.start();self.threads.append(cache_thread)
        except Exception:
            self.close()
            raise

    def _cache_loop(self):
        try:
            self.manifest=official_manifest()
            _stream_cache(self.manifest,self.cache,self.stop)
        except (OSError,ValueError,URLError,HTTPError,TimeoutError):
            pass

    def _discovery_loop(self):
        sock=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
        try:
            sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            sock.bind(("",DISCOVER_PORT))
            sock.settimeout(1.0)
            while not self.stop.is_set():
                try:body,remote=sock.recvfrom(128)
                except socket.timeout:continue
                if body!=DISCOVER_QUERY or not _same_lan(remote[0],self.ip):continue
                payload={"type":"vanilla-gecko-v1","label":self.settings["label"],
                         "port":WEB_PORT,"server":self.settings["server"]}
                sock.sendto(json.dumps(payload).encode("utf-8"),remote)
        except OSError:
            pass
        finally:
            sock.close()

    def close(self):
        self.stop.set()
        if self.http:
            self.http.shutdown()
            self.http.server_close()
            self.http=None
        try:
            from slime_runner_agent import _http
            _http("POST",self.settings["server"]+"/v1/slime/node/gecko/enable",
                  {"enabled":False},authorization=self.settings["token"],timeout=5)
        except (OSError,ValueError,URLError,HTTPError,TimeoutError):
            pass  # Backend also requires a recent active heartbeat.


def discover(server:str,timeout:float=0.8) -> list[dict]:
    """Broadcast a single optional discovery question. No subnet scanning."""
    found={}
    sock=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET,socket.SO_BROADCAST,1)
        sock.settimeout(0.15)
        sock.bind(("",0))
        sock.sendto(DISCOVER_QUERY,("255.255.255.255",DISCOVER_PORT))
        end=time.monotonic()+min(max(timeout,0.1),2.0)
        while time.monotonic()<end:
            try:body,remote=sock.recvfrom(1024)
            except socket.timeout:continue
            try:
                record=json.loads(body)
                addr=ipaddress.ip_address(remote[0])
                if (record.get("type")!="vanilla-gecko-v1" or
                    record.get("server")!=server or record.get("port")!=WEB_PORT or
                    not isinstance(addr,ipaddress.IPv4Address) or not addr.is_private):
                    continue
                found[remote[0]]={"ip":remote[0],"name":str(record.get("label","Gecko"))[:64],
                                  "port":WEB_PORT,"server":server}
            except (ValueError,TypeError,AttributeError):
                continue
    except OSError:
        pass
    finally:sock.close()
    return list(found.values())[:8]


def request_invite(peer:dict,server:str) -> str:
    """Call a user-selected LAN host; redeem ticket ONLY with trusted HTTPS server."""
    from urllib.parse import urlsplit
    addr=ipaddress.ip_address(peer["ip"])
    if (not isinstance(addr,ipaddress.IPv4Address) or not addr.is_private or
        peer["server"]!=server or peer["port"]!=WEB_PORT or
        urlsplit(server).scheme!="https"):
        raise ValueError("Gecko 分享來源不受信任")
    req=Request("http://"+str(addr)+":"+str(WEB_PORT)+"/invite",
        data=b'{"consent":true}',method="POST",
        headers={"Content-Type":"application/json","X-Gecko-Consent":"v1"})
    with urlopen(req,timeout=12) as response:
        if response.status!=200:raise ValueError("Gecko 節點未核准")
        raw=response.read(1025)
    if len(raw)>1024:raise ValueError("Gecko 回覆過大")
    ticket=json.loads(raw.decode("utf-8")).get("ticket")
    if not isinstance(ticket,str) or not TICKET.fullmatch(ticket):
        raise ValueError("Gecko 一次性授權無效")
    return ticket
