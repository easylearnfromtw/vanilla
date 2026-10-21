"""Slime real pairing and consented node operations: hermetic tests."""
from __future__ import annotations
import os
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException, Request
import slime
from slime import Caps,Heartbeat,PairRequest,issue_short_pair,pair,heartbeat,power_poll
from slime_ops import score,valid_public_ip


class SlimeOpsTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        env={"SLIME_ENABLED":"true","SLIME_DB_PATH":self.tmp.name+"/slime.sqlite3",
             "SLIME_PUBLIC_API_ORIGIN":"https://example.org",
             "SLIME_PAIRING_PAGE_URL":"https://example.org/slime/"}
        self.env=patch.dict(os.environ,env)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.owner="1234567890123"

    def enroll(self,geo=False,power=False):
        code=issue_short_pair(self.owner)["code"]
        request=Request({"type":"http","client":("8.8.8.8",443),"headers":[]})
        result=pair(PairRequest(code=code,label="Ops PC",role="owner",
                                geo_opt_in=geo,shutdown_opt_in=power),request)
        return result

    def test_score_is_estimate_within_range(self):
        self.assertEqual(score(0,0,""),100)
        self.assertTrue(1<=score(64,2048,"RTX 4090")<=10000)
        self.assertGreater(score(16,64,"RTX 3050"),score(16,64,""))
        self.assertEqual(valid_public_ip("127.0.0.1"),"")
        self.assertEqual(valid_public_ip("192.168.1.1"),"")
        self.assertEqual(valid_public_ip("8.8.8.8"),"8.8.8.8")

    def test_first_authenticated_heartbeat_queues_exactly_one_notice(self):
        result=self.enroll()
        token="Bearer "+result["token"]
        bg=BackgroundTasks()
        state=heartbeat(Heartbeat(capabilities=Caps(cpu=8,ram_gb=16,gpu="RTX 3050",
                      os="Windows",gpu_temp_c=63,gpu_util_pct=15)),
                      authorization=token,background_tasks=bg)
        self.assertTrue(state["ok"])
        self.assertEqual(len(bg.tasks),1)
        self.assertEqual(heartbeat(Heartbeat(capabilities=Caps(cpu=8,gpu_temp_c=63)),
                      authorization=token,background_tasks=bg)["ok"],True)
        self.assertEqual(len(bg.tasks),1)
        with slime._db() as db:
            node=db.execute("SELECT * FROM nodes WHERE id=?",(result["node_id"],)).fetchone()
        self.assertEqual(node["pair_number"],1)
        self.assertEqual(node["geo_opt_in"],0)
        self.assertEqual(node["public_ip"],"")
        self.assertEqual(node["gpu_temp_c"],63)

    def test_claimed_public_ip_is_only_stored_with_consent(self):
        token=issue_short_pair(self.owner)["code"]
        request=Request({"type":"http","client":("127.0.0.1",443),"headers":[]})
        node=pair(PairRequest(code=token,label="Public IP opt-in",
                              role="owner",geo_opt_in=True,public_ip="8.8.4.4"),request)
        with slime._db() as db:
            row=db.execute("SELECT public_ip FROM nodes WHERE id=?",
                           (node["node_id"],)).fetchone()
        self.assertEqual(row["public_ip"],"8.8.4.4")
        token=issue_short_pair(self.owner)["code"]
        node=pair(PairRequest(code=token,label="Without consent",
                              role="owner",geo_opt_in=False,public_ip="8.8.8.8"),request)
        with slime._db() as db:
            row=db.execute("SELECT public_ip FROM nodes WHERE id=?",
                           (node["node_id"],)).fetchone()
        self.assertEqual(row["public_ip"],"")

    def test_location_and_shutdown_are_opt_in_only(self):
        no=self.enroll()
        with slime._db() as db:
            db.execute("UPDATE nodes SET pending_power_off=? WHERE id=?",
                       (time.time()+90,no["node_id"]))
        self.assertIsNone(power_poll(authorization="Bearer "+no["token"])["command"])
        yes=self.enroll(geo=True,power=True)
        with slime._db() as db:
            node=db.execute("SELECT * FROM nodes WHERE id=?",(yes["node_id"],)).fetchone()
            self.assertEqual(node["public_ip"],"8.8.8.8")
            self.assertEqual(node["shutdown_opt_in"],1)
            db.execute("UPDATE nodes SET pending_power_off=? WHERE id=?",
                       (time.time()+90,yes["node_id"]))
        self.assertEqual(power_poll(authorization="Bearer "+yes["token"])["command"],"shutdown")
        self.assertIsNone(power_poll(authorization="Bearer "+yes["token"])["command"])
        with self.assertRaises(HTTPException):
            power_poll(authorization="Bearer invalid")

    def test_overheat_prevents_new_inference(self):
        result=self.enroll()
        with slime._db() as db:
            db.execute("UPDATE nodes SET inference_enabled=1,max_load_pct=25 WHERE id=?",
                       (result["node_id"],))
        state=heartbeat(Heartbeat(capabilities=Caps(gpu_temp_c=91)),
                      authorization="Bearer "+result["token"])
        self.assertTrue(state["thermal_paused"])
        self.assertFalse(state["inference_enabled"])
        self.assertEqual(state["max_load_pct"],25)
        state=heartbeat(Heartbeat(capabilities=Caps(gpu_temp_c=64)),
                      authorization="Bearer "+result["token"])
        self.assertFalse(state["thermal_paused"])
        self.assertTrue(state["inference_enabled"])


if __name__=="__main__":
    unittest.main()
