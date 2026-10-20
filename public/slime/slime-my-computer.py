#!/usr/bin/env python3
"""Vanilla Slime opt-in node, ROLE-specific executable source, Python >=3.10.

Only registration and capability heartbeats; NEVER executes remote instructions.
All data flows are initiated by this program. Ctrl+C to stop; leave to revoke.
"""
import argparse
import ctypes
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROLE = "owner"
CONFIG = Path.home() / ".vanilla" / ("slime-" + ROLE + ".json")


def endpoint(value):
    p = urlsplit(value.rstrip("/"))
    if (p.scheme != "https" or not p.hostname or p.username or p.password
            or p.query or p.fragment or p.path not in ("", "/")):
        raise ValueError("必須使用乾淨且可信任的 HTTPS 衞國後端根網址")
    return value.rstrip("/")


def invite(value):
    raw = value.rsplit("#slime=", 1)[-1] if "#slime=" in value else value
    if not 24 <= len(raw) <= 160 or not all(c.isalnum() or c in "_-" for c in raw):
        raise ValueError("邀請碼格式不正確；請從 Owner 私下取得未過期的邀請")
    return raw


def write(data):
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    if CONFIG.exists():
        raise RuntimeError("裝置已配對；要重新加入請先執行 leave")
    tmp = CONFIG.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        os.chmod(tmp, 0o600)
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG)


def read():
    with CONFIG.open(encoding="utf-8") as f:
        return json.load(f)


def post(base, path, payload, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(base + path, data=json.dumps(payload).encode("utf-8"),
                  headers=headers, method="POST")
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read(8192))
    except HTTPError as error:
        raise RuntimeError("Slime 後端拒絕操作，HTTP " + str(error.code)) from None
    except URLError:
        raise RuntimeError("無法連線到 Slime HTTPS 後端") from None


def capabilities():
    data = {"cpu": os.cpu_count() or 1, "os": platform.system(), "ram_gb": 0.0, "gpu": ""}
    if sys.platform.startswith("linux"):
        try:
            for line in Path("/proc/meminfo").read_text().splitlines():
                if line.startswith("MemTotal:"):
                    data["ram_gb"] = round(int(line.split()[1]) / 1024**2, 1)
                    break
        except (OSError, ValueError):
            pass
    elif sys.platform == "darwin":
        try:
            data["ram_gb"] = round(int(subprocess.check_output(
                ["sysctl", "-n", "hw.memsize"], timeout=3)) / 1024**3, 1)
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    elif sys.platform.startswith("win"):
        try:
            class MEM(ctypes.Structure):
                _fields_ = [(k, ctypes.c_ulong if k in ("dwLength", "dwMemoryLoad")
                             else ctypes.c_ulonglong) for k in (
                    "dwLength", "dwMemoryLoad", "ullTotalPhys", "ullAvailPhys",
                    "ullTotalPageFile", "ullAvailPageFile", "ullTotalVirtual",
                    "ullAvailVirtual", "ullAvailExtendedVirtual")]
            m = MEM()
            m.dwLength = ctypes.sizeof(m)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
                data["ram_gb"] = round(m.ullTotalPhys / 1024**3, 1)
        except (OSError, AttributeError, ValueError):
            pass
    try:
        result = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            timeout=3, stderr=subprocess.DEVNULL).decode("utf-8", errors="replace")
        data["gpu"] = result.splitlines()[0][:150] if result.strip() else ""
    except (OSError, subprocess.SubprocessError, IndexError):
        pass
    return data


def main():
    parser = argparse.ArgumentParser(description="Vanilla Slime / owner 節點")
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("probe")
    join = sub.add_parser("join")
    join.add_argument("--url", required=True, help="Slime API HTTPS 根網址")
    join.add_argument("--invite", required=True, help="Telegram Owner 提供的邀請碼或網址")
    join.add_argument("--label", default=platform.node()[:48] or "owner-node")
    join.add_argument("--consent", action="store_true", help="本人同意分享硬體規格與可用狀態")
    run = sub.add_parser("run")
    run.add_argument("--once", action="store_true")
    sub.add_parser("leave")
    args = parser.parse_args()
    if args.action == "probe":
        print(json.dumps(capabilities(), ensure_ascii=False, indent=2))
        return
    if args.action == "join":
        if not args.consent:
            raise SystemExit("使用前請自行閱讀本程式；加入必須由裝置擁有者輸入 --consent")
        base = endpoint(args.url)
        code = invite(args.invite)
        if CONFIG.exists():
            raise SystemExit("已有 Slime 配對；先執行 leave 才能重新註冊。")
        data = post(base, "/v1/slime/node/join", {
            "invite": code, "role": ROLE, "label": args.label[:64]})
        write({"url": base, "token": data["token"], "node_id": data["node_id"]})
        print("已加入。現在僅支援設備註冊和健康心跳，不提供 GPU 計算。請自行執行 run。")
        return
    if not CONFIG.exists():
        raise SystemExit("尚未配對，請先 join。")
    state = read()
    base = endpoint(state["url"])
    if args.action == "leave":
        post(base, "/v1/slime/node/leave", {}, state["token"])
        CONFIG.unlink()
        print("節點已撤銷；本地配對憑證已移除。")
        return
    print("開始回報健康心跳（不傳送私人檔案或對話）。按 Ctrl+C 停止。")
    try:
        while True:
            try:
                result = post(base, "/v1/slime/node/heartbeat", {
                    "capabilities": capabilities(), "share_enabled": True}, state["token"])
                print("心跳成功；Owner 允許：" + ("是" if result.get("owner_enabled") else "否") +
                      "；遠端推論：" + ("尚未啟用" if not result.get("inference_enabled") else "可用"))
            except RuntimeError as exc:
                print(str(exc))
            if args.once:
                break
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n已停止回報。")

if __name__ == "__main__":
    main()
