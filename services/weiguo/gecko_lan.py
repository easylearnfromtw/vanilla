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
from urllib.request import Request, urlopen, build_opener, ProxyHandler
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


def _sha256(path:Path) -> str:
    digest=hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda:stream.read(65536),b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stream_cache(manifest:dict, target:Path, stop:threading.Event) -> None:
    target.mkdir(parents=True,exist_ok=True)
    for name in FILES:
        if stop.is_set():return
        destination=target/name
        digest=manifest["hashes"][name]
        if destination.is_file() and destination.stat().st_size<=MAX_INSTALLER_BYTES:
            if _sha256(destination)==digest:
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


def _page(name:str, manifest:dict|None,challenge:str)->bytes:
    tag=manifest["tag"] if manifest else "官方 Releases"
    return ("""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Gecko · Slime 區域網路安裝</title>
<style>:root{font-family:system-ui,-apple-system,sans-serif;background:#f6f6f7;color:#171717}
main{max-width:500px;background:white;margin:7vh auto;padding:32px;border-radius:24px;border:1px solid #ddd}
button,a{display:block;width:100%;box-sizing:border-box;padding:16px;margin:10px 0;border:0;border-radius:12px;background:#19191c;color:#fff;text-align:center;text-decoration:none;font-size:14px}
button.secondary{background:#f0f0f2;color:#171717}
label{display:flex;align-items:start;gap:9px;font-size:13px;line-height:1.7}
small,p{color:#73737a;line-height:1.8;font-size:13px}h1{letter-spacing:-.05em}</style></head><body>
<main><small>VANILLA / GECKO / LAN</small><h1>在自己的裝置上決定。</h1>
<p>這台電腦的主人自願開啟安裝包分享，你可以選擇自行確認，或讓 Telegram Owner 核准下載。不會自動下載、安裝或執行。</p>
<form action="/download/consent" method="post">
<input type="hidden" name="challenge" value="__CHALLENGE__">
<label><input name="consent" type="checkbox" value="yes" required>我正在操作這台接收電腦，並同意取得官方 Slime Friend 安裝包。</label>
<button name="mode" value="receiver" type="submit">由這台電腦確認下載</button>
<button name="mode" value="owner" type="submit" class="secondary">請 Telegram Owner 核准</button>
</form><p>下載後，必須由你親自開啟安裝程式並確認加入。配對後模型推論仍預設關閉。</p>
<small>分享裝置："""+html.escape(name)+""" · 正式來源："""+html.escape(tag)+
""" · 區網分享不會開啟 VPN／遠端控制</small></main></body></html>""").replace("__CHALLENGE__",html.escape(challenge,quote=True)).encode("utf-8")


def _download_ready(name:str,token:str,manifest:dict|None,cache:Path)->bytes:
    from urllib.parse import quote
    parts=["<h1>已獲得下載授權</h1><p>請在這台電腦點選所需版本。只會下載檔案，不會替你執行或安裝。</p>"]
    for filename in FILES:
        title={"Slime-Friend.exe":"Windows","Slime-Friend-macos.zip":"macOS",
               "Slime-Friend-linux.tar.gz":"Linux"}[filename]
        if manifest and (cache/filename).is_file() and _sha256(cache/filename)==manifest["hashes"][filename]:
            target="/file/"+filename+"?grant="+quote(token)
        else:
            target=OFFICIAL+"/releases/latest"
        parts.append('<a href="'+html.escape(target,quote=True)+'" rel="noreferrer noopener">下載 '+title+'</a>')
    return ("""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:6vh auto;padding:24px}
a{display:block;margin:10px 0;padding:16px;background:#171717;color:white;text-align:center;border-radius:12px;text-decoration:none}
p{color:#696976;line-height:1.8}</style><title>Gecko 授權下載</title></head>
<body>"""+ "".join(parts)+
"<p>接收電腦仍需自行開啟安裝程式、閱讀同意事項。此授權限時且只限本裝置。</p></body></html>").encode("utf-8")


def _pending_page(request_id:str)->bytes:
    url="/download/status/"+request_id
    return ("""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="7;url="""+url+"""">
<title>Gecko 等待授權</title></head><body style="font-family:system-ui;max-width:500px;margin:9vh auto;padding:24px">
<h1>已送出 Telegram 核准申請</h1><p>請 Owner 在 Ceres → Slime → Gecko 核准或拒絕。你不必輸入 Telegram 代碼，也不會在核准前下載檔案。</p>
<p>本頁會定期檢查；可隨時關閉，不會安裝任何程式。</p>
<a href="""+url+""">手動確認授權結果</a></body></html>""").encode("utf-8")


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
        self.grants={}
        self.pending={}
        self.challenges={}
        self.auth_lock=threading.Lock()

    def _challenge(self,ip:str)->str:
        with self.auth_lock:
            now=time.monotonic()
            self.challenges={k:v for k,v in self.challenges.items() if v[1]>now}
            challenge=secrets.token_urlsafe(24)
            self.challenges[challenge]=(ip,now+300)
            return challenge

    def _consume_challenge(self,challenge:str,ip:str)->bool:
        with self.auth_lock:
            record=self.challenges.pop(challenge,None)
            return bool(record and record[0]==ip and record[1]>time.monotonic())

    def _grant(self,ip:str)->str:
        with self.auth_lock:
            now=time.monotonic()
            self.grants={k:v for k,v in self.grants.items() if v[1]>now}
            ticket=secrets.token_urlsafe(24)
            self.grants[ticket]=(ip,now+600)
            return ticket

    def _grant_valid(self,ticket:str,ip:str)->bool:
        with self.auth_lock:
            record=self.grants.get(ticket)
            return bool(record and record[0]==ip and record[1]>time.monotonic())

    def _approval_request(self,ip:str,purpose:str)->str:
        from slime_runner_agent import _http
        record=_http("POST",self.settings["server"]+"/v1/slime/node/gecko/request",
                     {"purpose":purpose,"device_label":"LAN "+ip},
                     authorization=self.settings["token"],timeout=12)
        rid=record.get("requestId")
        if not isinstance(rid,str) or not re.fullmatch("[a-f0-9]{48}",rid):
            raise ValueError("Gecko 後端核准請求無效")
        with self.auth_lock:
            self.pending[rid]=(ip,purpose,time.monotonic()+240)
        return rid

    def _approval_status(self,rid:str,ip:str,purpose:str)->dict:
        with self.auth_lock:
            record=self.pending.get(rid)
        if not record or record[0]!=ip or record[1]!=purpose or record[2]<time.monotonic():
            raise ValueError("此裝置無待確認申請")
        from slime_runner_agent import _http
        reply=_http("POST",self.settings["server"]+"/v1/slime/node/gecko/check",
                    {"request_id":rid},authorization=self.settings["token"],timeout=12)
        if reply.get("status") in ("approved","rejected"):
            with self.auth_lock:
                self.pending.pop(rid,None)
        return reply

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
                self.end_headers()
                self.wfile.write(content)
            def do_GET(self):
                if not self._allowed():return self._send(403,b"Forbidden","text/plain")
                from urllib.parse import urlsplit,parse_qs
                url=urlsplit(self.path)
                if url.path=="/":
                    return self._send(200,_page(host.settings["label"],host.manifest,host._challenge(self.client_address[0])),"text/html; charset=utf-8")
                if url.path.startswith("/download/status/"):
                    rid=url.path.rsplit("/",1)[-1]
                    if not re.fullmatch("[a-f0-9]{48}",rid):
                        return self._send(404,b"Not Found","text/plain")
                    try:
                        result=host._approval_status(rid,self.client_address[0],"download")
                        if result.get("status")=="pending":
                            return self._send(202,_pending_page(rid),"text/html; charset=utf-8")
                        if result.get("status")=="approved":
                            grant=host._grant(self.client_address[0])
                            return self._send(200,_download_ready(host.settings["label"],grant,host.manifest,host.cache),"text/html; charset=utf-8")
                        return self._send(403,b"Owner denied this download","text/plain")
                    except (OSError,ValueError,HTTPError,URLError,TimeoutError):
                        return self._send(410,b"Approval expired or unavailable","text/plain")
                if url.path.startswith("/invite/status/"):
                    rid=url.path.rsplit("/",1)[-1]
                    if not re.fullmatch("[a-f0-9]{48}",rid):
                        return self._send(404,b"Not Found","text/plain")
                    try:
                        result=host._approval_status(rid,self.client_address[0],"join")
                        return self._send(200,json.dumps(result).encode("utf-8"))
                    except (OSError,ValueError,HTTPError,URLError,TimeoutError):
                        return self._send(410,b'{"status":"expired"}')
                if self.path=="/manifest":
                    data={"type":"vanilla-gecko-v1","label":host.settings["label"],
                          "server":host.settings["server"],"cached":[x for x in FILES if host.manifest and (host.cache/x).is_file()
                                   and _sha256(host.cache/x)==host.manifest["hashes"][x]]}
                    return self._send(200,json.dumps(data).encode("utf-8"))
                name=url.path.removeprefix("/file/")
                if url.path.startswith("/file/") and name in FILES and host.manifest:
                    grant=parse_qs(url.query).get("grant",[""])[0]
                    if not host._grant_valid(grant,self.client_address[0]):
                        return self._send(403,b"Recipient download approval required","text/plain")
                    file=host.cache/name
                    if (not file.is_file() or file.stat().st_size>MAX_INSTALLER_BYTES
                        or _sha256(file)!=host.manifest["hashes"][name]):
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
                if not self._allowed():
                    return self._send(403,b"Forbidden","text/plain")
                try:
                    n=int(self.headers.get("Content-Length","0"))
                    if n<2 or n>768:raise ValueError("Payload too large")
                    if self.path=="/download/consent":
                        from urllib.parse import parse_qs
                        if "application/x-www-form-urlencoded" not in self.headers.get("Content-Type",""):
                            raise ValueError("Invalid form")
                        form=parse_qs(self.rfile.read(n).decode("utf-8","strict"))
                        mode=form.get("mode",[""])[0]
                        if (mode not in ("receiver","owner") or form.get("consent")!=["yes"] or
                            not host._consume_challenge(form.get("challenge",[""])[0],self.client_address[0])):
                            return self._send(403,b"Explicit receiver consent required","text/plain")
                        if mode=="receiver":
                            grant=host._grant(self.client_address[0])
                            return self._send(200,_download_ready(host.settings["label"],grant,host.manifest,host.cache),"text/html; charset=utf-8")
                        rid=host._approval_request(self.client_address[0],"download")
                        return self._send(202,_pending_page(rid),"text/html; charset=utf-8")
                    if self.path!="/invite" or self.headers.get("X-Gecko-Consent")!="v1":
                        return self._send(403,b'{"error":"explicit recipient consent required"}')
                    if self.headers.get("Content-Type")!="application/json":
                        raise ValueError("Invalid content type")
                    obj=json.loads(self.rfile.read(n))
                    if (not isinstance(obj,dict) or obj.get("consent") is not True or
                        obj.get("mode") not in ("receiver","owner") or
                        set(obj)!={"consent","mode"}):
                        return self._send(403,b'{"error":"explicit consent and mode required"}')
                    if obj["mode"]=="owner":
                        rid=host._approval_request(self.client_address[0],"join")
                        return self._send(202,json.dumps({"status":"pending","requestId":rid}).encode("utf-8"))
                    from slime_runner_agent import _http
                    out=_http("POST",host.settings["server"]+"/v1/slime/node/gecko/invite",
                              {},authorization=host.settings["token"],timeout=12)
                    ticket=out.get("ticket")
                    if not isinstance(ticket,str) or not TICKET.fullmatch(ticket):
                        raise ValueError("Backend Gecko ticket invalid")
                    return self._send(200,json.dumps({"status":"approved","ticket":ticket}).encode("utf-8"))
                except (OSError,ValueError,UnicodeError,URLError,HTTPError,TimeoutError,TypeError):
                    return self._send(503,b'{"error":"Gecko authorization unavailable"}')

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


def request_invite(peer:dict,server:str,mode:str="receiver")->str:
    """Recipient selects their LAN host and confirmation policy; never scans peers."""
    from urllib.parse import urlsplit
    addr=ipaddress.ip_address(peer["ip"])
    if (not isinstance(addr,ipaddress.IPv4Address) or not addr.is_private or
        peer["server"]!=server or peer["port"]!=WEB_PORT or
        urlsplit(server).scheme!="https" or mode not in ("receiver","owner")):
        raise ValueError("Gecko 分享來源或核准方式不受信任")
    opener=build_opener(ProxyHandler({}))
    req=Request("http://"+str(addr)+":"+str(WEB_PORT)+"/invite",
        data=json.dumps({"consent":True,"mode":mode}).encode("utf-8"),method="POST",
        headers={"Content-Type":"application/json","X-Gecko-Consent":"v1"})
    # Never forward local RFC1918 device traffic to a proxy.
    with opener.open(req,timeout=12) as response:
        if response.status not in (200,202):raise ValueError("Gecko 節點未核准")
        raw=response.read(2049)
    if len(raw)>2048:raise ValueError("Gecko 回覆過大")
    result=json.loads(raw.decode("utf-8"))
    if mode=="owner":
        request_id=result.get("requestId")
        if not isinstance(request_id,str) or not re.fullmatch("[a-f0-9]{48}",request_id):
            raise ValueError("Telegram Owner 請求格式不正確")
        print("已送出 Gecko Telegram 核准請求；可從此電腦取消，最多等待 4 分鐘。")
        end=time.monotonic()+235
        while time.monotonic()<end:
            time.sleep(5)
            try:
                with opener.open("http://"+str(addr)+":"+str(WEB_PORT)+"/invite/status/"+request_id,timeout=12) as response:
                    if response.status!=200:break
                    result=json.loads(response.read(2049).decode("utf-8"))
            except (OSError,ValueError,HTTPError,URLError,TimeoutError):
                continue
            if result.get("status")=="rejected":
                raise ValueError("Owner 已拒絕 Gecko 加入")
            if result.get("status")=="approved":break
        else:raise TimeoutError("Telegram Owner 核准已逾時；沒有加入裝置")
    ticket=result.get("ticket")
    if not isinstance(ticket,str) or not TICKET.fullmatch(ticket):
        raise ValueError("Gecko 一次性授權尚未核發或無效")
    return ticket
