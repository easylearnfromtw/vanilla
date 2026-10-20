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
import os
import platform
import re
import sys
import time
from urllib.parse import urlsplit
from urllib.request import Request,build_opener,HTTPRedirectHandler,ProxyHandler
from urllib.error import HTTPError,URLError

_LOCAL="http://127.0.0.1:11434"
_MODEL=re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$")


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        return None


_OPENER=build_opener(ProxyHandler({}),_NoRedirect())


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
    with _OPENER.open(request,timeout=timeout) as response:
        data=response.read(524288)
    return json.loads(data.decode("utf-8"))


def _models():
    result=_http("GET",_LOCAL+"/api/tags")
    items=result.get("models",[]) if isinstance(result,dict) else []
    return sorted({x["name"] for x in items
                   if isinstance(x,dict) and isinstance(x.get("name"),str)
                   and _MODEL.fullmatch(x["name"])})[:40]


def _heartbeat(server,token):
    _http("POST",server+"/v1/slime/node/heartbeat",{
        "capabilities":{"cpu":os.cpu_count() or 1,"ram_gb":0,"gpu":"","os":platform.system()},
        "share_enabled":True},authorization=token)


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


def run():
    server=_server()
    token=_token()
    print("Slime Model Runner started (outbound HTTPS + local Ollama only).")
    last_register=0
    while True:
        try:
            # Heartbeats and model capabilities are always self-reported; Server
            # Owner policy must grant inference separately.
            _heartbeat(server,token)
            now=time.monotonic()
            if now-last_register>=50:
                _register(server,token,_models())
                last_register=now
            for _ in range(20):
                polled=_http("GET",server+"/v1/slime/node/runner/poll",authorization=token)
                job=polled.get("job")
                if not job:
                    time.sleep(2)
                    continue
                payload={"job_id":job["id"],"ok":False}
                try:
                    payload.update(_execute(job["request"]))
                except (ValueError,TypeError,KeyError,HTTPError,URLError,TimeoutError):
                    print("Local Ollama inference failed (no sensitive content logged).")
                _http("POST",server+"/v1/slime/node/runner/result",
                      payload,authorization=token)
                # A single local runner executes one job at a time by design.
        except KeyboardInterrupt:
            print("Runner stopped.")
            return
        except (ValueError,TypeError,KeyError,HTTPError,URLError,TimeoutError):
            print("Slime connection/consent unavailable; retrying without printing credentials.")
            time.sleep(5)


if __name__=="__main__":
    try:run()
    except ValueError as e:
        print(str(e),file=sys.stderr)
        sys.exit(2)
