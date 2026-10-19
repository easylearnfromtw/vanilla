"""Detroit Athena private antivirus gateway.

Run behind a private VPN / authorized backend. Default loopback binding, no browser CORS.
ClamAV INSTREAM scans bytes without opening or executing the uploaded file.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os
import socket
import struct
import time

MAX_BYTES = 15 * 1024 * 1024
HOST = os.getenv("ATHENA_BIND_HOST", "127.0.0.1")
PORT = int(os.getenv("ATHENA_PORT", "8788"))
CLAM_HOST = os.getenv("CLAM_HOST", "127.0.0.1")
CLAM_PORT = int(os.getenv("CLAM_PORT", "3310"))
TOKEN = os.getenv("ATHENA_SCAN_TOKEN", "")


def scan_stream(data: bytes) -> tuple[str, str]:
    """ClamAV zINSTREAM protocol; no filenames, shell, or file system execution."""
    with socket.create_connection((CLAM_HOST, CLAM_PORT), timeout=20) as conn:
        conn.settimeout(60)
        conn.sendall(b"zINSTREAM\0")
        for cursor in range(0, len(data), 64 * 1024):
            chunk = data[cursor:cursor + 64 * 1024]
            conn.sendall(struct.pack(">I", len(chunk)) + chunk)
        conn.sendall(b"\0\0\0\0")
        reply = bytearray()
        while len(reply) < 4096:
            part = conn.recv(1024)
            if not part:
                break
            reply.extend(part)
            if b"\0" in reply or b"\n" in reply:
                break
    message = reply.decode("utf-8", errors="replace").strip("\0\n\r ")
    if " FOUND" in message:
        return "infected", message[:180]
    if message.endswith(" OK"):
        return "clean", "ClamAV engine reports no known signatures"
    return "error", "ClamAV scan failed or signature database unavailable"


class Handler(BaseHTTPRequestHandler):
    server_version = "Detroit-Athena/0.2"

    def reply(self, code: int, value: dict):
        encoded = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        if self.path != "/v1/scan":
            return self.reply(404, {"error": "unknown route"})
        if len(TOKEN) < 32 or not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + TOKEN):
            return self.reply(401, {"error": "unauthorized"})
        if self.headers.get("Content-Type", "").split(";")[0] != "application/octet-stream":
            return self.reply(415, {"error": "application/octet-stream required"})
        raw_len = self.headers.get("Content-Length", "")
        if not raw_len.isdigit():
            return self.reply(411, {"error": "Content-Length required"})
        length = int(raw_len)
        if length == 0 or length > MAX_BYTES:
            return self.reply(413, {"error": "File size exceeds secure limit"})
        data = self.rfile.read(length)
        if len(data) != length:
            return self.reply(400, {"error": "short request body"})
        try:
            status, detail = scan_stream(data)
        except (OSError, socket.timeout):
            return self.reply(503, {"status": "error", "safe": False, "reason": "antivirus engine unavailable"})
        # Fail closed if signatures are unavailable, result unknown or a scan fails.
        self.reply(200 if status == "clean" else 422 if status == "infected" else 503,
                   {"status": status, "safe": status == "clean", "reason": detail})

    def do_GET(self):
        if self.path != "/health":
            return self.reply(404, {"error": "unknown route"})
        # Health is not a successful scan result.
        self.reply(200, {"service": "athena-private-antivirus", "engine": "ClamAV", "scanReady": bool(TOKEN and len(TOKEN) >= 32)})

    def log_message(self, format, *args):
        # Avoid logging URLs, file content or credential-bearing request headers.
        pass


if __name__ == "__main__":
    if len(TOKEN) < 32:
        raise SystemExit("ATHENA_SCAN_TOKEN needs at least 32 characters")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()