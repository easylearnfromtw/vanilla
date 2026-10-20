#!/usr/bin/env python3
"""Vanilla Node Fabric owner coordinator (registration/heartbeat prototype only).

Python 3.10+; standard library. Does NOT dispatch inference or execute remote code.
Bind to localhost; publish to invited users only through an authenticated HTTPS
reverse proxy/private overlay (e.g. Tailscale Serve). Never expose its raw port.
"""
import argparse
import hmac
import json
import os
from pathlib import Path
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_CONFIG = Path.home() / ".vanilla" / "node-fabric-owner.json"
LOCK = threading.RLock()
MAX_NODES = 50
MAX_BODY = 8192


def save(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as f:
        os.chmod(temporary, 0o600)
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(temporary, path)


def load(path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def init(path):
    if path.exists():
        raise SystemExit("設定已存在；不覆蓋現有配對與密鑰。")
    state = {"version": 1, "owner_token": secrets.token_urlsafe(32),
             "pair_token": secrets.token_urlsafe(24), "nodes": {}}
    save(path, state)
    print(f"已建立 {path}\n邀請碼（只私下傳給朋友）：{state['pair_token']}")
    print("管理憑證僅儲存在本機設定檔，絕不可貼到網頁或傳給朋友。")


def authorized(given, expected):
    return bool(given) and hmac.compare_digest(str(given), str(expected))


def sanitize_capabilities(value):
    if not isinstance(value, dict):
        return {}
    return {key: value[key] for key in ("os", "cpu_cores", "ram_gb", "gpu")
            if key in value and isinstance(value[key], (str, int, float)) and len(str(value[key])) <= 150}


def sanitize_limits(value):
    if not isinstance(value, dict):
        return {}
    return {key: int(value[key]) for key in ("cpu", "gpu")
            if isinstance(value.get(key), int) and 0 <= value[key] <= 100}


def handler_for(path):
    class Handler(BaseHTTPRequestHandler):
        server_version = "VanillaNodeFabric/0.1"

        def send_json(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def bearer(self):
            header = self.headers.get("Authorization", "")
            return header[7:] if header.startswith("Bearer ") else ""

        def body_json(self):
            size_str = self.headers.get("Content-Length", "")
            try:
                size = int(size_str)
                if size < 1 or size > MAX_BODY:
                    raise ValueError()
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise ValueError()
                return data
            except (ValueError, json.JSONDecodeError):
                return None

        def do_GET(self):
            if self.path == "/public-health":
                return self.send_json(200, {"ok": True, "mode": "heartbeat-only",
                                           "inference_enabled": False})
            if self.path != "/api/nodes":
                return self.send_json(404, {"error": "not_found"})
            with LOCK:
                s = load(path)
                if not authorized(self.bearer(), s["owner_token"]):
                    return self.send_json(403, {"error": "forbidden"})
                now = time.time()
                nodes = [{"id": key, "label": value["label"],
                          "online": now - value["last_seen"] < 150,
                          "last_seen": value["last_seen"], "capabilities": value["capabilities"],
                          "limits": value["limits"]} for key, value in s["nodes"].items()]
            self.send_json(200, {"nodes": nodes, "inference_enabled": False})

        def do_POST(self):
            if self.path not in ("/api/join", "/api/heartbeat", "/api/leave"):
                return self.send_json(404, {"error": "not_found"})
            data = self.body_json()
            if data is None:
                return self.send_json(400, {"error": "invalid_body"})
            with LOCK:
                s = load(path)
                if self.path == "/api/join":
                    if not authorized(data.get("pair_token"), s["pair_token"]):
                        return self.send_json(403, {"error": "invalid_invite"})
                    if len(s["nodes"]) >= MAX_NODES:
                        return self.send_json(429, {"error": "capacity_reached"})
                    node_id = secrets.token_hex(12)
                    token = secrets.token_urlsafe(32)
                    label = str(data.get("label", "朋友節點")).strip()[:60] or "朋友節點"
                    s["nodes"][node_id] = {
                        "label": label, "token": token,
                        "last_seen": time.time(),
                        "capabilities": sanitize_capabilities(data.get("capabilities")),
                        "limits": sanitize_limits(data.get("limits"))}
                    save(path, s)
                    return self.send_json(201, {"node_id": node_id, "node_token": token,
                                                "mode": "heartbeat-only"})
                node_id = str(data.get("node_id", ""))
                node = s["nodes"].get(node_id)
                if not node or not authorized(self.bearer(), node["token"]):
                    return self.send_json(403, {"error": "invalid_node"})
                if self.path == "/api/leave":
                    del s["nodes"][node_id]
                    save(path, s)
                    return self.send_json(200, {"removed": True})
                node["last_seen"] = time.time()
                node["capabilities"] = sanitize_capabilities(data.get("capabilities"))
                node["limits"] = sanitize_limits(data.get("limits"))
                save(path, s)
                self.send_json(200, {"ok": True, "inference_enabled": False})

        def log_message(self, fmt, *args):
            # Paths and status only; never log credentials or request bodies.
            if os.environ.get("VANILLA_NODE_DEBUG") == "1":
                super().log_message(fmt, *args)
    return Handler


def main():
    p = argparse.ArgumentParser(description="Vanilla Node Fabric / 我的電腦")
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8765)
    rotate = sub.add_parser("rotate-invite")
    sub.add_parser("invite")
    sub.add_parser("nodes")
    revoke = sub.add_parser("revoke")
    revoke.add_argument("node_id")
    args = p.parse_args()
    path = args.config
    if args.command == "init":
        return init(path)
    if not path.exists():
        raise SystemExit("請先執行 init。")
    if args.command == "serve":
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(path))
        print(f"Node Fabric 監聽 127.0.0.1:{args.port}（僅心跳與裝置註冊；未執行推論）")
        print("跨網路請使用 HTTPS 私人網路代理，不要直接開放 HTTP 連接埠。")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            server.server_close()
        return
    with LOCK:
        s = load(path)
        if args.command == "invite":
            print(s["pair_token"])
        elif args.command == "rotate-invite":
            s["pair_token"] = secrets.token_urlsafe(24)
            save(path, s)
            print("已撤銷舊邀請碼，新邀請碼："+s["pair_token"])
        elif args.command == "nodes":
            now = time.time()
            for key, node in s["nodes"].items():
                print(key, node["label"], "online" if now - node["last_seen"] < 150 else "offline")
            print(f"共 {len(s['nodes'])} 個節點；目前不支援分散式模型推論。")
        elif args.command == "revoke":
            if args.node_id not in s["nodes"]:
                raise SystemExit("找不到指定節點")
            del s["nodes"][args.node_id]
            save(path, s)
            print("節點已撤銷；無法再次通過身分驗證。")


if __name__ == "__main__":
    main()
