"""Slime Desktop: a visible, voluntary node presence application.

Not a remote shell. No LLM execution, file access, auto-start, or remote
shutdown. Only self-reported hardware metadata and opt-in heartbeat.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import messagebox, ttk
from urllib.parse import urlsplit, parse_qs
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROLE = "owner" if "owner" in Path(sys.executable).stem.lower() else "friend"
APPDIR = Path.home() / ".vanilla" / "slime"
FILE = APPDIR / (ROLE + ".json")
COLOR = "#37634A"
HEARTBEAT_MS = 60_000


def invite_parts(raw: str):
    parsed = urlsplit(raw.strip())
    if (parsed.scheme != "https" or not parsed.hostname or
            parsed.username or parsed.password or parsed.query or
            parsed.path not in ("", "/") or parsed.port not in (None, 443)):
        raise ValueError("請貼上完整的 Slime HTTPS 邀請連結")
    values = parse_qs(parsed.fragment, strict_parsing=True)
    if sorted(values) != ["slime"] or len(values["slime"]) != 1:
        raise ValueError("這不是有效的 Slime 邀請連結")
    token = values["slime"][0]
    if not re.fullmatch(r"[a-zA-Z0-9_-]{32,160}", token):
        raise ValueError("邀請碼不正確")
    return "https://" + parsed.hostname, token


def request(base: str, route: str, data: dict, token: str | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(base + route, data=json.dumps(data).encode("utf-8"),
                  headers=headers, method="POST")
    try:
        with urlopen(req, timeout=12) as resp:
            return json.loads(resp.read(8192))
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise PermissionError("邀請已失效、使用完畢，或裝置權限已撤銷") from exc
        raise RuntimeError("Slime 服務暫時無法處理請求 (HTTP " + str(exc.code) + ")") from exc
    except (URLError, TimeoutError) as exc:
        raise ConnectionError("無法連上 Slime 服務，請確認網路連線") from exc


def specs():
    cpu = os.cpu_count() or 1
    ram = 0.0
    try:
        if sys.platform == "win32":
            import ctypes
            class Memory(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong),
                            ("total", ctypes.c_ulonglong), ("available", ctypes.c_ulonglong),
                            ("page_total", ctypes.c_ulonglong), ("page_available", ctypes.c_ulonglong),
                            ("virtual_total", ctypes.c_ulonglong), ("virtual_available", ctypes.c_ulonglong),
                            ("extended", ctypes.c_ulonglong)]
            m = Memory()
            m.length = ctypes.sizeof(m)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
                ram = round(m.total / 1024 ** 3, 1)
        elif sys.platform == "darwin":
            ram = round(int(subprocess.check_output(
                ["sysctl", "-n", "hw.memsize"], timeout=3)) / 1024 ** 3, 1)
        else:
            line = next((s for s in Path("/proc/meminfo").read_text().splitlines()
                         if s.startswith("MemTotal:")), "")
            if line:
                ram = round(int(line.split()[1]) / 1024 ** 2, 1)
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    gpu = ""
    try:
        gpu = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            stderr=subprocess.DEVNULL, timeout=3).decode("utf-8", "replace").splitlines()[0][:150]
    except (OSError, subprocess.SubprocessError, IndexError):
        pass
    return {"cpu": min(cpu, 512), "ram_gb": min(ram, 2048),
            "gpu": gpu, "os": platform.system()[:80]}


def save(payload: dict):
    APPDIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    tmp = FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        json.dump(payload, f)
    os.replace(tmp, FILE)


def load():
    try:
        data = json.loads(FILE.read_text(encoding="utf-8"))
        if all(isinstance(data.get(k), str) for k in ("base", "id", "token")):
            return data
    except (OSError, ValueError):
        pass
    return None


class SlimeApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Slime · " + ("我的電腦" if ROLE == "owner" else "朋友的電腦"))
        self.geometry("530x430")
        self.minsize(440, 380)
        self.configure(bg="#F5F7F3")
        self.profile = load()
        self.hardware = specs()
        self.running = False
        self.busy = False
        self.consent = tk.BooleanVar(value=False)
        self.sharing = tk.BooleanVar(value=True)
        self.invite = tk.StringVar()
        self.status = tk.StringVar(value="尚未連線")
        self.create_widgets()
        self.render()
        self.protocol("WM_DELETE_WINDOW", self.close)
        if self.profile:
            self.after(250, self.beat)

    def create_widgets(self):
        frame = ttk.Frame(self, padding=24)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="SLIME", font=("Arial", 24, "bold")).pack(anchor="w")
        ttk.Label(frame, text="讓閒置電腦安全地加入 Vanilla 運算網路",
                  wraplength=455).pack(anchor="w", pady=(4, 16))
        self.summary = ttk.Label(frame, text="", wraplength=455)
        self.summary.pack(anchor="w", pady=(0, 12))
        self.pair = ttk.Frame(frame)
        self.pair.pack(fill="x")
        ttk.Label(self.pair, text="從 Vanilla → Detroit → Slime 複製邀請連結").pack(anchor="w")
        ttk.Entry(self.pair, textvariable=self.invite, width=54).pack(fill="x", pady=8)
        ttk.Checkbutton(self.pair, text="我同意將裝置規格與連線狀態提供給邀請者",
                        variable=self.consent).pack(anchor="w", pady=6)
        self.join_button = ttk.Button(self.pair, text="連線並開始共享", command=self.join)
        self.join_button.pack(anchor="w", pady=(10, 0))
        self.connected = ttk.Frame(frame)
        self.connected.pack(fill="x", pady=8)
        ttk.Checkbutton(self.connected, text="允許此裝置出現在可用資源池",
                        variable=self.sharing, command=self.beat).pack(anchor="w", pady=10)
        ttk.Button(self.connected, text="退出並撤銷配對", command=self.leave).pack(anchor="w", pady=8)
        ttk.Separator(frame).pack(fill="x", pady=(16, 12))
        ttk.Label(frame, textvariable=self.status, wraplength=455).pack(anchor="w")
        ttk.Label(frame, text="不會存取私人檔案、執行遠端指令、控制電源或自動開機。"
                  "\n關閉本程式後會停止心跳，中央將自動停止派工。",
                  wraplength=455).pack(anchor="w", pady=(12, 0))

    def render(self):
        self.summary.configure(text=(
            f"{self.hardware['os']}　·　CPU {self.hardware['cpu']} 核心　"
            f"·　RAM {self.hardware['ram_gb']} GB\n"
            f"GPU：{self.hardware['gpu'] or '未偵測到 NVIDIA GPU'}"))
        if self.profile:
            self.pair.pack_forget()
            self.connected.pack(fill="x", pady=8)
        else:
            self.connected.pack_forget()
            self.pair.pack(fill="x")

    def async_call(self, action, success):
        if self.busy:
            return
        self.busy = True
        def work():
            try:
                result = action()
                self.after(0, lambda: self.finish(success, result, None))
            except Exception as exc:
                message = str(exc)
                self.after(0, lambda: self.finish(success, None, message))
        threading.Thread(target=work, daemon=True).start()

    def finish(self, callback, result, error):
        if not self.winfo_exists():
            return
        self.busy = False
        if error:
            self.status.set(error)
            return
        callback(result)

    def join(self):
        if not self.consent.get():
            messagebox.showinfo("需要本人同意", "請先同意共享有限硬體資訊。")
            return
        try:
            base, token = invite_parts(self.invite.get())
        except ValueError as error:
            self.status.set(str(error))
            return
        self.status.set("正在安全配對…")
        def action():
            response = request(base, "/v1/slime/node/join", {
                "invite": token,
                "label": platform.node()[:64] or "Slime 節點",
                "role": ROLE})
            return {"base": base, "id": response["node_id"], "token": response["token"]}
        def done(profile):
            self.profile = profile
            save(profile)
            self.invite.set("")
            self.status.set("已配對，正在回報裝置狀態…")
            self.render()
            self.beat()
        self.async_call(action, done)

    def beat(self):
        if not self.profile:
            return
        if getattr(sys, "frozen", False) and not Path(sys.executable).exists():
            self.status.set("程式已被移除，停止回報；中央稍後自動停用。")
            return
        profile = dict(self.profile)
        approved = bool(self.sharing.get())
        def action():
            return request(profile["base"], "/v1/slime/node/heartbeat", {
                "capabilities": self.hardware, "share_enabled": approved}, profile["token"])
        def done(response):
            self.status.set("已連線 · " + ("允許候選派工" if approved and response.get("owner_enabled") else "已暫停共享") +
                            " · 目前未啟用分散式模型運算")
        if not self.busy:
            self.async_call(action, done)
        self.after(HEARTBEAT_MS, self.beat)

    def leave(self):
        if not self.profile or self.busy:
            return
        if not messagebox.askyesno("退出 Slime", "確定退出此網路？中央會立即撤銷節點資格。"):
            return
        profile = dict(self.profile)
        def done(_):
            self.profile = None
            FILE.unlink(missing_ok=True)
            self.status.set("已退出並撤銷配對")
            self.render()
        self.async_call(lambda: request(profile["base"], "/v1/slime/node/leave", {}, profile["token"]), done)

    def close(self):
        self.profile = None
        self.destroy()


if __name__ == "__main__":
    app = SlimeApp()
    app.mainloop()
