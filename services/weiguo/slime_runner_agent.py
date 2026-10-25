"""Vanilla Slime local Ollama model runner (Windows/macOS/Linux, Python 3.10+).

Outbound HTTPS ONLY to user's configured WeiGuo host. Ollama is accessed ONLY
via 127.0.0.1:11434, with no externally reachable port required.

Required environment:
  SLIME_NODE_TOKEN     token returned by an existing consented Slime invite/join
  VANILLA_SERVER_URL   e.g. https://weiguo-browser-production.up.railway.app

Owner must explicitly turn on inference for this node in Slime's Owner API.
Do not embed node tokens in a public installer or check them into source code.
"""
from __future__ import annotations

import json
import secrets
import threading
import os
import platform
import subprocess
from functools import lru_cache
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlsplit
import ctypes
import subprocess
import shutil
from urllib.request import Request,build_opener,HTTPRedirectHandler,ProxyHandler
from urllib.error import HTTPError,URLError

_LOCAL="http://127.0.0.1:11434"
_MODEL=re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$")


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return None


# Local Ollama must NEVER traverse a system proxy. Remote HTTPS follows the
# operating system's approved proxy configuration, including enterprise proxy.
_LOCAL_OPENER=build_opener(ProxyHandler({}),_NoRedirect())
_NETWORK_OPENER=build_opener(_NoRedirect())


def _server():
    raw=os.getenv("VANILLA_SERVER_URL","").rstrip("/")
    url=urlsplit(raw)
    if (url.scheme!="https" or not url.hostname or url.username or url.password
        or url.port not in (None,443) or url.path or url.query or url.fragment):
        raise ValueError("VANILLA_SERVER_URL must be an HTTPS origin with no path")
    return raw


def _token():
    token=os.getenv("SLIME_NODE_TOKEN","")
    if not 32<=len(token)<=256:
        raise ValueError("SLIME_NODE_TOKEN must be set from an approved Slime node")
    return token


def _http(method,url,body=None,authorization=None,timeout=12):
    raw=json.dumps(body,ensure_ascii=False).encode("utf-8") if body is not None else None
    headers={"Content-Type":"application/json"}
    if authorization:
        headers["Authorization"]="Bearer "+authorization
    request=Request(url,data=raw,headers=headers,method=method)
    hostname=urlsplit(url).hostname
    opener=_LOCAL_OPENER if hostname in ("127.0.0.1","localhost") else _NETWORK_OPENER
    with opener.open(request,timeout=timeout) as response:
        data=response.read(524288)
    return json.loads(data.decode("utf-8"))


def _models():
    result=_http("GET",_LOCAL+"/api/tags")
    items=result.get("models",[]) if isinstance(result,dict) else []
    return sorted({x["name"] for x in items
                   if isinstance(x,dict) and isinstance(x.get("name"),str)
                   and _MODEL.fullmatch(x["name"])})[:40]


def _ram_gb():
    """Best-effort read of installed memory; no third-party dependencies."""
    try:
        system=platform.system()
        if system=="Linux":
            with open("/proc/meminfo",encoding="ascii") as handle:
                for line in handle:
                    if line.startswith("MemTotal:"):
                        return round(int(line.split()[1])/1048576,1)
        if system=="Darwin":
            result=subprocess.run(["/usr/sbin/sysctl","-n","hw.memsize"],
                                  capture_output=True,text=True,timeout=3,check=True)
            return round(int(result.stdout.strip())/(1024**3),1)
        if system=="Windows":
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_=[("dwLength",ctypes.c_ulong),("dwMemoryLoad",ctypes.c_ulong),
                          ("ullTotalPhys",ctypes.c_ulonglong),
                          ("ullAvailPhys",ctypes.c_ulonglong),
                          ("ullTotalPageFile",ctypes.c_ulonglong),
                          ("ullAvailPageFile",ctypes.c_ulonglong),
                          ("ullTotalVirtual",ctypes.c_ulonglong),
                          ("ullAvailVirtual",ctypes.c_ulonglong),
                          ("ullAvailExtendedVirtual",ctypes.c_ulonglong)]
            m=MEMORYSTATUSEX()
            m.dwLength=ctypes.sizeof(m)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
                return round(m.ullTotalPhys/(1024**3),1)
    except (OSError,ValueError,AttributeError,subprocess.SubprocessError):
        pass
    return 0.0


_last_gpu_scan=0.0
_cached_gpu=""
def _gpu_name():
    """Read-only NVIDIA discovery, throttled to avoid repeated GPU wake-ups."""
    global _last_gpu_scan,_cached_gpu
    now=time.monotonic()
    if _last_gpu_scan and now-_last_gpu_scan<3600:
        return _cached_gpu
    _last_gpu_scan=now
    if not shutil.which("nvidia-smi"):
        _cached_gpu=""
        return _cached_gpu
    try:
        result=subprocess.run(["nvidia-smi","--query-gpu=name","--format=csv,noheader"],
                              capture_output=True,text=True,timeout=3,check=True)
        _cached_gpu=", ".join(x.strip() for x in result.stdout.splitlines() if x.strip())[:150]
    except (OSError,ValueError,subprocess.SubprocessError):
        _cached_gpu=""
    return _cached_gpu


_last_metrics_at=0.0
_metrics=(None,None)
def _gpu_metrics():
    global _last_metrics_at,_metrics
    now=time.monotonic()
    if now-_last_metrics_at<60:
        return _metrics
    _last_metrics_at=now
    if not shutil.which("nvidia-smi"):
        _metrics=(None,None)
        return _metrics
    try:
        result=subprocess.run(["nvidia-smi",
            "--query-gpu=temperature.gpu,utilization.gpu",
            "--format=csv,noheader,nounits"],
            capture_output=True,text=True,timeout=3,check=True)
        values=result.stdout.splitlines()[0].split(",")
        temp=float(values[0].strip())
        use=float(values[1].strip())
        _metrics=(temp if 0<=temp<=125 else None,
                  use if 0<=use<=100 else None)
    except (OSError,ValueError,IndexError,subprocess.SubprocessError):
        _metrics=(None,None)
    return _metrics


def _cpu_percent():
    try:
        import psutil
        return max(0,min(100,float(psutil.cpu_percent(interval=None))))
    except (ImportError,ValueError,AttributeError):
        pass
    try:
        return round(max(0,min(100,os.getloadavg()[0]/max(os.cpu_count() or 1,1)*100)),1)
    except (OSError,AttributeError,ValueError):
        return None


@lru_cache(maxsize=1)
def _capabilities():
    """Non-invasive local hardware facts, shared by runtime and reward onboarding."""
    ram=0.0
    try:
        if sys.platform=="win32":
            import ctypes
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_=[("length",ctypes.c_ulong),("load",ctypes.c_ulong),
                    ("total",ctypes.c_ulonglong),("available",ctypes.c_ulonglong),
                    ("page_total",ctypes.c_ulonglong),("page_available",ctypes.c_ulonglong),
                    ("virtual_total",ctypes.c_ulonglong),("virtual_available",ctypes.c_ulonglong),
                    ("extended",ctypes.c_ulonglong)]
            stat=MEMORYSTATUSEX()
            stat.length=ctypes.sizeof(stat)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                ram=round(stat.total/1024**3,1)
        elif sys.platform=="darwin":
            ram=round(int(subprocess.check_output(["sysctl","-n","hw.memsize"],timeout=3))
                      /1024**3,1)
        else:
            line=next((x for x in Path("/proc/meminfo").read_text().splitlines()
                       if x.startswith("MemTotal:")),"")
            if line:
                ram=round(int(line.split()[1])/1024**2,1)
    except (OSError,ValueError,subprocess.SubprocessError):
        pass
    gpu=""
    try:
        gpu=subprocess.check_output(
            ["nvidia-smi","--query-gpu=name,memory.total","--format=csv,noheader"],
            timeout=3,stderr=subprocess.DEVNULL).decode("utf-8","replace").splitlines()[0][:150]
    except (OSError,subprocess.SubprocessError,IndexError):
        pass
    if not gpu and sys.platform=="darwin" and platform.machine().lower()=="arm64":
        # Apple unified GPU: identify architecture without guessing VRAM.
        gpu="Apple Silicon integrated GPU (unified memory)"
    return {"cpu":min(os.cpu_count() or 1,512),"ram_gb":min(ram,2048.0),
            "gpu":gpu,"os":platform.system()[:80]}


def _heartbeat(server,token):
    temperature,utilization=_gpu_metrics()
    caps=dict(_capabilities())
    temperature,utilization=_gpu_metrics()
    caps.update({"cpu_pct":_cpu_percent(),"gpu_temp_c":temperature,
                 "gpu_util_pct":utilization})
    return _http("POST",server+"/v1/slime/node/heartbeat",{
        "capabilities":caps,"share_enabled":True},authorization=token)


def _register(server,token,models):
    if models:
        _http("POST",server+"/v1/slime/node/runner/register",
              {"models":models},authorization=token)


def _execute(request):
    """Second-level guard: Ollama must enforce requested max generation tokens."""
    model=request.get("model")
    if not isinstance(model,str) or not _MODEL.fullmatch(model):
        raise ValueError("Invalid local model")
    messages=request.get("messages")
    if not isinstance(messages,list) or not 1<=len(messages)<=16:
        raise ValueError("Invalid chat request")
    for m in messages:
        if (not isinstance(m,dict) or m.get("role") not in ("system","user","assistant")
            or not isinstance(m.get("content"),str) or not 0<len(m["content"])<=16000):
            raise ValueError("Invalid message")
    n=request.get("max_tokens")
    if type(n) is not int or not 1<=n<=2048:
        raise ValueError("Invalid output budget")
    # Conservative text-byte bound prevents silent Ollama context truncation.
    # This is not a claim about the actual model tokenizer.
    prompt_upper=sum(len(m["content"].encode("utf-8"))+len(m["role"])+256 for m in messages)
    if prompt_upper+n>4096:
        raise ValueError("Input exceeds conservative local context budget")
    temperature=request.get("temperature",0.4)
    if type(temperature) not in (float,int) or not 0<=temperature<=2:
        raise ValueError("Invalid temperature")
    response=_http("POST",_LOCAL+"/api/chat",{
        "model":model,"messages":messages,"stream":False,
        "options":{"num_predict":n,"num_ctx":4096,"temperature":temperature}},
        timeout=43)
    content=response.get("message",{}).get("content")
    a=response.get("prompt_eval_count")
    b=response.get("eval_count")
    if (not isinstance(content,str) or not content.strip() or len(content)>20000
        or type(a) is not int or type(b) is not int or a<0 or b<0 or b>n):
        raise ValueError("Model reply omitted verifiable usage or exceeded output cap")
    return {"ok":True,"text":content,"prompt_tokens":a,"completion_tokens":b}


def _handle_power(server,token,stop_event=None):
    if os.getenv("SLIME_ALLOW_POWER_OFF")!="1":
        return
    response=_http("POST",server+"/v1/slime/node/power/poll",authorization=token)
    if response.get("command")!="shutdown":
        return
    print("Owner 已核准關機。60 秒後關閉本機；按 Ctrl+C 可中止。",flush=True)
    if stop_event is not None:
        if stop_event.wait(60):
            print("使用者已停止共享；取消本次關機要求。")
            return
    else:
        time.sleep(60)
    system=platform.system()
    try:
        if system=="Windows":
            subprocess.run(["shutdown.exe","/s","/t","0"],check=True,timeout=10)
        elif system=="Darwin":
            subprocess.run(["/usr/bin/osascript","-e",
                'tell application "System Events" to shut down'],check=True,timeout=12)
        elif system=="Linux":
            subprocess.run(["systemctl","poweroff"],check=True,timeout=12)
        else:
            print("系統不支援遠端電源關閉")
    except (OSError,subprocess.SubprocessError):
        print("系統拒絕關機；不提升權限也不繞過系統保護。")


def run(*, server=None, token=None, stop_event=None, allow_power_off=None):
    """Run opt-in node service; an interactive dashboard may stop it cleanly."""
    server=_server() if server is None else server
    token=_token() if token is None else token
    # Explicit settings always come from an already validated, local pairing.
    if not isinstance(server,str) or not server.startswith("https://"):
        raise ValueError("INVALID_SLIME_HTTPS_SERVER")
    if not isinstance(token,str) or not 32<=len(token)<=256:
        raise ValueError("INVALID_SLIME_DEVICE_TOKEN")
    can_power=(os.getenv("SLIME_ALLOW_POWER_OFF")=="1" if allow_power_off is None
               else allow_power_off is True)
    def pause(seconds):
        if stop_event is None:
            time.sleep(seconds)
            return False
        return stop_event.wait(seconds)
    print("Slime Model Runner started (outbound HTTPS + local Ollama only).")
    last_register=0
    last_model_scan=0
    # Spread cache checks across the fleet to avoid reconnect bursts.
    gecko_next=time.monotonic()+secrets.randbelow(900) if os.getenv("GECKO_FLEET_NODE")=="true" else None
    while True:
        if stop_event is not None and stop_event.is_set():
            print("Slime 已停止共享（本機請求）。")
            return
        try:
            # Heartbeats and model capabilities are always self-reported; Server
            # Owner policy must grant inference separately.
            state=_heartbeat(server,token)
            if gecko_next is not None and time.monotonic()>=gecko_next:
                gecko_next=time.monotonic()+1800+secrets.randbelow(600)
                from gecko_update import sync_best_effort
                threading.Thread(target=sync_best_effort,args=(server,token),
                                 daemon=True,name="GeckoReleasePrefetch").start()
            if can_power:
                _handle_power(server,token,stop_event)
                if stop_event is not None and stop_event.is_set():
                    return
            if not state.get("owner_enabled") or not state.get("inference_enabled"):
                if last_register:
                    print("Slime 推論權限已關閉；仍可回報節點心跳。")
                last_register=0
                if pause(20): return
                continue
            now=time.monotonic()
            if now-last_register>=50:
                try:
                    models=_models()
                except (HTTPError,URLError,TimeoutError,OSError,ValueError,TypeError):
                    print("Ollama 本地模型尚未就緒；30 秒後重試，不影響 Slime 心跳。")
                    last_register=0
                    if pause(30): return
                    continue
                if not models:
                    print("Ollama 沒有已下載的模型；30 秒後重試，不輪詢遠端任務。")
                    last_register=0
                    time.sleep(30)
                    continue
                _register(server,token,models)
                last_register=now
                if models and now-last_model_scan>300:
                    print("已偵測本機 Ollama 模型數："+str(len(models)))
                    last_model_scan=now
            for _ in range(20):
                if stop_event is not None and stop_event.is_set():
                    return
                polled=_http("GET",server+"/v1/slime/node/runner/poll",authorization=token)
                job=polled.get("job")
                if not job:
                    if pause(3): return
                    continue
                payload={"job_id":job["id"],"ok":False}
                try:
                    payload.update(_execute(job["request"]))
                except (ValueError,TypeError,KeyError,HTTPError,URLError,TimeoutError):
                    print("Local Ollama inference failed (no sensitive content logged).")
                _http("POST",server+"/v1/slime/node/runner/result",
                      payload,authorization=token)
                # Duty-cycle moderation, not GPU power-limit control.
                duty=max(10,min(100,int(state.get("max_load_pct",100))))
                delay=round((100-duty)*0.3,1)
                if delay and pause(delay): return
                # A single local runner executes one job at a time by design.
        except KeyboardInterrupt:
            print("Runner stopped.")
            return
        except (ValueError,TypeError,KeyError,HTTPError,URLError,TimeoutError):
            print("Slime connection/consent unavailable; retrying without printing credentials.")
            if pause(5): return


if __name__=="__main__":
    try:run()
    except ValueError as e:
        print(str(e),file=sys.stderr)
        sys.exit(2)
