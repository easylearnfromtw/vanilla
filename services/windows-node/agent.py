"""Vanilla Windows Node: paired localhost-only Ollama proxy, no arbitrary execution."""
import ctypes, json, os, secrets, subprocess, threading, tkinter as tk
from pathlib import Path
from tkinter import ttk
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
PORT=18765
OLLAMA="http://127.0.0.1:11434"
ORIGINS={"https://easylearnfromtw.github.io","http://localhost:5173","http://127.0.0.1:5173"}
CONFIG=Path(os.environ.get("LOCALAPPDATA",str(Path.home())))/"VanillaNode"/"agent.json"
BUSY=0
LOCK=threading.Lock()
def identity():
 CONFIG.parent.mkdir(parents=True,exist_ok=True)
 if CONFIG.exists():
  data=json.loads(CONFIG.read_text(encoding="utf-8"))
  if len(data.get("token",""))>=48:return data
 data={"token":secrets.token_urlsafe(48),"id":secrets.token_hex(12)}
 with open(CONFIG,"x",encoding="utf-8") as f:json.dump(data,f)
 return data
def ram():
 if os.name!="nt":return None
 class MEM(ctypes.Structure):
  _fields_=[("length",ctypes.c_ulong),("load",ctypes.c_ulong),("total",ctypes.c_ulonglong),("free",ctypes.c_ulonglong),("pageTotal",ctypes.c_ulonglong),("pageFree",ctypes.c_ulonglong),("virtualTotal",ctypes.c_ulonglong),("virtualFree",ctypes.c_ulonglong),("extended",ctypes.c_ulonglong)]
 m=MEM();m.length=ctypes.sizeof(m)
 return round(m.free/(1024**3),2) if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)) else None
def vram():
 try:
  s=subprocess.check_output(["nvidia-smi","--query-gpu=memory.free","--format=csv,noheader,nounits"],timeout=3,text=True,stderr=subprocess.DEVNULL)
  v=[float(x.strip())/1024 for x in s.splitlines() if x.strip()]
  return round(max(v),2) if v else None
 except (OSError,ValueError,subprocess.SubprocessError):return None
def power():
 if os.name!="nt":return "unknown"
 class P(ctypes.Structure):
  _fields_=[("ac",ctypes.c_ubyte),("flag",ctypes.c_ubyte),("pct",ctypes.c_ubyte),("reserved",ctypes.c_ubyte),("life",ctypes.c_ulong),("full",ctypes.c_ulong)]
 p=P()
 if not ctypes.windll.kernel32.GetSystemPowerStatus(ctypes.byref(p)):return "unknown"
 return "ac" if p.ac==1 else "battery" if p.ac==0 else "unknown"
def models():
 try:
  with urlopen(OLLAMA+"/api/tags",timeout=2) as r:d=json.loads(r.read(1024*1024))
  return [m["name"] for m in d.get("models",[]) if isinstance(m,dict) and isinstance(m.get("name"),str)][:100]
 except (OSError,ValueError):return []
class API(BaseHTTPRequestHandler):
 def log_message(self,*_):pass
 def origin(self):return self.headers.get("Origin","")
 def common(self,mime="application/json"):
  self.send_header("Content-Type",mime)
  self.send_header("Cache-Control","no-store")
  self.send_header("Vary","Origin")
  if self.origin() in ORIGINS:
   self.send_header("Access-Control-Allow-Origin",self.origin())
   self.send_header("Access-Control-Allow-Private-Network","true")
   self.send_header("Access-Control-Allow-Headers","Authorization, Content-Type")
   self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS")
 def reply(self,status,data):
  b=json.dumps(data,ensure_ascii=False).encode()
  self.send_response(status);self.common();self.send_header("Content-Length",str(len(b)))
  self.end_headers();self.wfile.write(b)
 def verified(self):
  if self.origin() and self.origin() not in ORIGINS:self.reply(403,{"error":"untrusted origin"});return False
  auth=self.headers.get("Authorization","")
  if not auth.startswith("Bearer ") or not secrets.compare_digest(auth[7:],self.server.token):
   self.reply(401,{"error":"pairing required"});return False
  return True
 def do_OPTIONS(self):
  if self.origin() not in ORIGINS:self.reply(403,{"error":"untrusted origin"});return
  self.send_response(204);self.common();self.end_headers()
 def do_GET(self):
  if self.path=="/v1/health":self.reply(200,{"service":"vanilla-node"});return
  if not self.verified():return
  if self.path=="/v1/status":
   with LOCK:busy=BUSY
   found=models()
   self.reply(200,{"id":self.server.node_id,"models":found,"availableRamGB":ram(),"availableVramGB":vram(),"activeJobs":busy,"maxConcurrentJobs":1,"queueDepth":0,"power":power(),"health":"healthy" if found else "degraded"})
   return
  if self.path=="/api/tags":self.proxy("GET");return
  self.reply(404,{"error":"unknown endpoint"})
 def do_POST(self):
  global BUSY
  if not self.verified():return
  if self.path!="/api/chat":self.reply(404,{"error":"unknown endpoint"});return
  size=self.headers.get("Content-Length","")
  if not size.isdecimal() or int(size)>2097152:self.reply(413,{"error":"invalid size"});return
  try:
   body=self.rfile.read(int(size));req=json.loads(body)
   if not isinstance(req,dict) or not isinstance(req.get("model"),str) or req["model"] not in models() or not isinstance(req.get("messages"),list):
    self.reply(400,{"error":"model missing or invalid messages"});return
  except ValueError:self.reply(400,{"error":"invalid JSON"});return
  with LOCK:
   if BUSY>=1:self.reply(429,{"error":"node busy"});return
   BUSY+=1
  try:self.proxy("POST",body)
  finally:
   with LOCK:BUSY-=1
 def proxy(self,method,body=None):
  path="/api/chat" if method=="POST" else "/api/tags"
  try:
   with urlopen(Request(OLLAMA+path,method=method,data=body,headers={"Content-Type":"application/json"}),timeout=240) as result:
    self.send_response(200);self.common("application/x-ndjson" if method=="POST" else "application/json")
    self.send_header("Connection","close");self.end_headers()
    while True:
     chunk=result.read(8192)
     if not chunk:break
     self.wfile.write(chunk);self.wfile.flush()
    self.close_connection=True
  except (HTTPError,URLError,OSError):
   try:self.reply(502,{"error":"Ollama unavailable"})
   except OSError:pass
def run():
 d=identity();server=ThreadingHTTPServer(("127.0.0.1",PORT),API)
 server.token=d["token"];server.node_id=d["id"]
 threading.Thread(target=server.serve_forever,daemon=True).start()
 root=tk.Tk();root.title("Vanilla · Windows 運算節點");root.geometry("560x290")
 ttk.Label(root,text="Detroit Windows Node",font=("Segoe UI",19,"bold")).pack(pady=(20,8))
 ttk.Label(root,text="本機節點已啟動：127.0.0.1:18765").pack(pady=5)
 ttk.Label(root,text="在 Vanilla 網站 → 運算節點，貼上配對權杖。").pack(pady=5)
 ttk.Entry(root,show="●",width=66,textvariable=tk.StringVar(value=d["token"])).pack(pady=5)
 def copy():root.clipboard_clear();root.clipboard_append(d["token"])
 ttk.Button(root,text="複製配對權杖",command=copy).pack(pady=6)
 ttk.Label(root,text="跨裝置需要 Tailscale Serve 私人 HTTPS；請勿公開到網際網路。").pack(pady=6)
 def close():server.shutdown();root.destroy()
 root.protocol("WM_DELETE_WINDOW",close);root.mainloop()
if __name__=="__main__":run()
