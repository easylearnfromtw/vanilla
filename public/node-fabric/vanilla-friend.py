#!/usr/bin/env python3
"""Vanilla Node Fabric friend agent: explicit opt-in, health check only.

No arbitrary remote code, model downloads, filesystem reads or inference.
Run explicitly after reviewing the source. Python 3.10+ standard library.
"""
import argparse
import json
import os
from pathlib import Path
import platform
import subprocess
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

CONFIG = Path.home() / ".vanilla" / "node-fabric-friend.json"


def store(value):
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        os.chmod(tmp, 0o600)
        json.dump(value, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG)


def load():
    with CONFIG.open(encoding="utf-8") as f:
        return json.load(f)


def safe_url(raw):
    parsed = urlsplit(raw.strip().rstrip("/"))
    if (not parsed.hostname or parsed.username or parsed.password or
            parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("請填入乾淨的 HTTPS 服務根網址")
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1")
    ):
        raise ValueError("不接受明文遠端 HTTP；請使用 HTTPS 或本機測試位址")
    return raw.strip().rstrip("/")


def capabilities():
    result = {"os": platform.system(), "cpu_cores": os.cpu_count() or 1}
    if platform.system() == "Linux":
        try:
            for line in Path("/proc/meminfo").read_text().splitlines():
                if line.startswith("MemTotal:"):
                    result["ram_gb"] = round(int(line.split()[1]) / 1024**2, 1)
                    break
        except (OSError, ValueError):
            pass
    elif platform.system() == "Darwin":
        try:
            size = subprocess.check_output(["sysctl", "-n", "hw.memsize"], timeout=2)
            result["ram_gb"] = round(int(size) / 1024**3, 1)
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
    elif platform.system() == "Windows":
        try:
            import ctypes
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
            info = MEMORYSTATUSEX()
            info.dwLength = ctypes.sizeof(info)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(info)):
                result["ram_gb"] = round(info.ullTotalPhys / 1024**3, 1)
        except (OSError, AttributeError):
            pass
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            timeout=3, stderr=subprocess.DEVNULL).decode("utf-8", errors="replace")
        if out.strip():
            result["gpu"] = out.splitlines()[0][:100]
    except (OSError, subprocess.SubprocessError):
        pass
    return result


def post(base, path, data, token=None):
    req = Request(base + path, method="POST",
                  data=json.dumps(data).encode("utf-8"),
                  headers={"Content-Type": "application/json",
                           **({"Authorization": "Bearer " + token} if token else {})})
    try:
        with urlopen(req, timeout=10) as res:
            return json.loads(res.read(8192))
    except HTTPError as e:
        raise RuntimeError(f"協調端拒絕請求：HTTP {e.code}") from e
    except URLError as e:
        raise RuntimeError("無法連線到協調端（檢查 HTTPS 或 Tailscale）") from e


def main():
    p = argparse.ArgumentParser(description="Vanilla Node Fabric / 朋友的電腦")
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("probe")
    join = sub.add_parser("join")
    join.add_argument("--url", required=True, help="Owner 的 HTTPS Node Fabric 位址")
    join.add_argument("--pair", required=True, help="Owner 提供的一次性邀請碼")
    join.add_argument("--label", default="朋友的電腦", help="僅會公開給 owner 的節點顯示名稱")
    join.add_argument("--cpu", type=int, default=30, help="未來可執行運算時的 CPU 上限（目前尚未啟用）")
    join.add_argument("--gpu", type=int, default=30, help="未來可執行運算時的 GPU 上限（目前尚未啟用）")
    join.add_argument("--consent", action="store_true", help="本人同意加入此協調端並回報有限硬體資訊")
    run = sub.add_parser("run")
    run.add_argument("--once", action="store_true")
    sub.add_parser("leave")
    args = p.parse_args()

    if args.command == "probe":
        print(json.dumps(capabilities(), ensure_ascii=False, indent=2))
        return
    if args.command == "join":
        if not args.consent:
            raise SystemExit("請先審閱原始碼；本人同意後才加上 --consent。")
        if not 0 <= args.cpu <= 100 or not 0 <= args.gpu <= 100:
            raise SystemExit("CPU/GPU 上限必須介於 0–100")
        if CONFIG.exists():
            raise SystemExit("此電腦已有配對；請先執行 leave，不會覆蓋原憑證。")
        base = safe_url(args.url)
        limits = {"cpu": args.cpu, "gpu": args.gpu}
        response = post(base, "/api/join", {
            "pair_token": args.pair, "label": args.label[:60],
            "capabilities": capabilities(), "limits": limits})
        store({"url": base, "node_id": response["node_id"],
               "node_token": response["node_token"], "limits": limits})
        print("加入成功。尚未啟用模型推論或任何遠端指令。執行 run 才會定期回報心跳。")
        return
    if not CONFIG.exists():
        raise SystemExit("尚未加入，請先執行 join。")
    s = load()
    base = safe_url(s["url"])
    if args.command == "leave":
        post(base, "/api/leave", {"node_id": s["node_id"]}, s["node_token"])
        CONFIG.unlink()
        print("已退出並註銷此節點憑證。")
        return
    print("已啟動自願心跳；僅傳送作業系統、CPU 核心數、總記憶體與可選 GPU 規格。Ctrl+C 停止。")
    try:
        while True:
            try:
                response = post(base, "/api/heartbeat", {
                    "node_id": s["node_id"], "capabilities": capabilities(),
                    "limits": s["limits"]}, s["node_token"])
                print("心跳成功；模型推論：未啟用" if not response.get("inference_enabled") else "連線正常")
            except (RuntimeError, TimeoutError) as e:
                print("連線問題："+str(e))
            if args.once:
                break
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n已停止共享連線。")


if __name__ == "__main__":
    main()
