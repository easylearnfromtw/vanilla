"""Offline integration tests for the owner and contributor registration-only prototype."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
from http.server import ThreadingHTTPServer
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

BASE = Path(__file__).resolve().parents[1] / "public" / "node-fabric"


def module(filename, name):
    spec = importlib.util.spec_from_file_location(name, BASE / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


owner = module("vanilla-owner.py", "vanilla_owner")
friend = module("vanilla-friend.py", "vanilla_friend")


class NodeFabricTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "owner.json"
        owner.init(self.path)
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), owner.handler_for(self.path))
        self.thread = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:" + str(self.srv.server_port)

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.thread.join(timeout=3)
        self.temp.cleanup()

    def test_consent_and_endpoint_policies(self):
        self.assertEqual(friend.safe_url(self.base), self.base)
        for url in ("http://public.example", "https://u:p@example.com", "https://example.com/path"):
            with self.assertRaises(ValueError):
                friend.safe_url(url)
        with urlopen(self.base + "/public-health") as res:
            health = json.load(res)
        self.assertFalse(health["inference_enabled"])
        with self.assertRaises(HTTPError) as ctx:
            urlopen(self.base + "/api/nodes")
        self.assertEqual(ctx.exception.code, 403)

    def test_join_heartbeat_leave_and_revocation(self):
        conf = owner.load(self.path)
        with self.assertRaises(RuntimeError):
            friend.post(self.base, "/api/join", {"pair_token": "wrong"})
        response = friend.post(self.base, "/api/join", {
            "pair_token": conf["pair_token"], "label": "Test contribution",
            "capabilities": {"os": "Linux", "cpu_cores": 2, "private_path": "/home/me"},
            "limits": {"cpu": 30, "gpu": 20}})
        self.assertIn("node_token", response)
        node_id = response["node_id"]
        self.assertFalse(response["mode"] == "inference-enabled")
        self.assertTrue(friend.post(self.base, "/api/heartbeat", {
            "node_id": node_id, "capabilities": {"os": "Linux"},
            "limits": {"cpu": 30}}, response["node_token"])["ok"])
        req = Request(self.base + "/api/nodes",
                      headers={"Authorization": "Bearer " + conf["owner_token"]})
        with urlopen(req) as res:
            nodes = json.load(res)["nodes"]
        self.assertEqual(len(nodes), 1)
        self.assertTrue(nodes[0]["online"])
        self.assertNotIn("private_path", nodes[0]["capabilities"])
        self.assertNotIn("token", nodes[0])
        self.assertTrue(friend.post(self.base, "/api/leave",
                                    {"node_id": node_id}, response["node_token"])["removed"])
        with self.assertRaises(RuntimeError):
            friend.post(self.base, "/api/heartbeat",
                        {"node_id": node_id}, response["node_token"])


if __name__ == "__main__":
    unittest.main()
