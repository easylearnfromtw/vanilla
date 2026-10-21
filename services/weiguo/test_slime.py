"""Slime lifecycle tests. No external devices, APIs, credentials or cloud required."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, parse_qs

from fastapi import HTTPException
from starlette.requests import Request
from auth import FamilyIdentity
from slime import (
    Caps, Heartbeat, JoinRequest, PairRequest, Policy, RouteRequest, _db,
    _digest, heartbeat, issue_invite, join, pair, leave, list_nodes,
    policy, revoke, slime_status, suggest_route
)

OWNER = FamilyIdentity(sub="12345678901234567890", member="Owner",
                       role="owner", email="owner@example.test")
OTHER = FamilyIdentity(sub="09876543210987654321", member="Other",
                       role="owner", email="other@example.test")


class SlimeLifecycle(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            "SLIME_ENABLED": "true",
            "SLIME_DB_PATH": str(Path(self.tmp.name) / "slime.db"),
            "SLIME_PUBLIC_API_ORIGIN": "https://example.org",
            "SLIME_PAIRING_PAGE_URL": "https://example.org/slime/"
        })
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def pairing(self):
        invite = issue_invite(OWNER)["link"]
        self.assertTrue(invite.startswith("https://example.org/slime/#slime="))
        token = parse_qs(urlsplit(invite).fragment)["slime"][0]
        request=Request({"type":"http","client":("198.51.100.25",443),"headers":[]})
        return pair(PairRequest(code=token, label="Test Windows", role="friend"),request), token

    def test_pairing_heartbeat_and_owner_opt_out(self):
        self.assertFalse(slime_status(OWNER)["inference_enabled"])
        device, invitation = self.pairing()
        with self.assertRaises(HTTPException):
            pair(PairRequest(code=invitation, label="Replay", role="friend"),Request({"type":"http","client":("198.51.100.25",443),"headers":[]}))
        headers = "Bearer " + device["token"]
        before = list_nodes(OWNER)["nodes"][0]
        self.assertTrue(before["online"])
        self.assertEqual(before["ram_gb"], 0)
        heartbeat(Heartbeat(capabilities=Caps(cpu=8, ram_gb=16, gpu="RTX 3050", os="Windows"),
                            share_enabled=True), authorization=headers)
        nodes = list_nodes(OWNER)["nodes"]
        self.assertTrue(nodes[0]["schedulable"])
        self.assertEqual(nodes[0]["gpu"], "RTX 3050")
        self.assertEqual(list_nodes(OTHER)["nodes"], [])
        preview = suggest_route(RouteRequest(workload="model-shard", min_ram_gb=12), OWNER)
        self.assertFalse(preview["executed"])
        self.assertEqual(len(preview["candidate_nodes"]), 1)
        policy(device["node_id"], Policy(enabled=False), OWNER)
        self.assertFalse(list_nodes(OWNER)["nodes"][0]["schedulable"])
        self.assertEqual(suggest_route(RouteRequest(workload="tools"), OWNER)["candidate_nodes"], [])
        policy(device["node_id"], Policy(enabled=True), OWNER)
        heartbeat(Heartbeat(capabilities=Caps(cpu=8, ram_gb=16),
                            share_enabled=False), authorization=headers)
        self.assertFalse(list_nodes(OWNER)["nodes"][0]["schedulable"])
        leave(authorization=headers)
        self.assertEqual(list_nodes(OWNER)["nodes"], [])
        with self.assertRaises(HTTPException):
            heartbeat(Heartbeat(capabilities=Caps()), authorization=headers)

    def test_timeout_and_revocation(self):
        d, _ = self.pairing()
        with _db() as c:
            c.execute("UPDATE nodes SET last_seen=0 WHERE id=?", (d["node_id"],))
        n = list_nodes(OWNER)["nodes"][0]
        self.assertFalse(n["online"])
        self.assertFalse(n["schedulable"])
        self.assertEqual(suggest_route(RouteRequest(workload="tools"), OWNER)["candidate_nodes"], [])
        with self.assertRaises(HTTPException):
            policy(d["node_id"], Policy(enabled=False), OTHER)
        revoke(d["node_id"], OWNER)
        with self.assertRaises(HTTPException):
            heartbeat(Heartbeat(capabilities=Caps()), authorization="Bearer "+d["token"])

    def test_disabled_by_default_and_invalid_origin(self):
        with patch.dict(os.environ, {"SLIME_ENABLED": "false"}):
            with self.assertRaises(HTTPException):
                issue_invite(OWNER)
        with patch.dict(os.environ, {"SLIME_PUBLIC_API_ORIGIN": "http://example.org"}):
            with self.assertRaises(HTTPException):
                issue_invite(OWNER)


if __name__ == "__main__":
    unittest.main()
