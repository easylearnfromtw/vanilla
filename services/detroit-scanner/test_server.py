import io
import os
import struct
import unittest
from unittest.mock import patch

os.environ.setdefault("ATHENA_SCAN_TOKEN", "a" * 48)
from server import MAX_BYTES, scan_stream, Handler


class DummyConn:
    def __init__(self, reply):
        self.reply = reply
        self.writes = []
        self.calls = 0

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def settimeout(self, timeout):
        self.timeout = timeout

    def sendall(self, data):
        self.writes.append(data)

    def recv(self, amount):
        self.calls += 1
        return self.reply if self.calls == 1 else b""


class AthenaServerTests(unittest.TestCase):
    def test_clean_file_uses_clamav_instream_not_a_shell(self):
        conn = DummyConn(b"stream: OK\0")
        with patch("socket.create_connection", return_value=conn):
            status, detail = scan_stream(b"document bytes")
        self.assertEqual(status, "clean")
        self.assertEqual(conn.writes[0], b"zINSTREAM\0")
        self.assertEqual(conn.writes[1], struct.pack(">I", 14) + b"document bytes")
        self.assertEqual(conn.writes[-1], b"\0\0\0\0")

    def test_malware_detection_is_never_marked_safe(self):
        conn = DummyConn(b"stream: Known-Test.Signature FOUND\0")
        with patch("socket.create_connection", return_value=conn):
            status, detail = scan_stream(b"sample")
        self.assertEqual(status, "infected")
        self.assertIn("FOUND", detail)

    def test_invalid_or_missing_virus_db_result_fails_closed(self):
        conn = DummyConn(b"stream: ERROR\0")
        with patch("socket.create_connection", return_value=conn):
            status, detail = scan_stream(b"sample")
        self.assertEqual(status, "error")
        self.assertIn("unavailable", detail)

    def test_server_size_limit(self):
        self.assertLessEqual(MAX_BYTES, 16 * 1024 * 1024)


if __name__ == "__main__":
    unittest.main()