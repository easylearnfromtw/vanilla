"""Gecko consent, Telegram Owner decision and replay resistance regression tests."""
from __future__ import annotations
import os
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException

import slime
from gecko_approvals import (GeckoRequest,GeckoCheck,request_owner_approval,
                             check_owner_approval,pending_requests,decide_request)
from gecko_lan import _same_lan,_page,_download_ready
from pathlib import Path


OWNER="123456789012345678901"
TOKEN="Q"*48
NODE="a"*24


class GeckoApprovalTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        patcher=patch.dict(os.environ,{
            "SLIME_ENABLED":"true","SLIME_DB_PATH":temp.name+"/slime.sqlite"})
        patcher.start();self.addCleanup(patcher.stop)
        with slime._db() as db:
            db.execute("""INSERT INTO nodes
                (id,owner,token_digest,label,role,last_seen,
                 gecko_enabled,owner_enabled,share_enabled)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (NODE,OWNER,slime._digest(TOKEN),"My Owner PC","owner",
                 time.time(),1,1,1))
        self.authorization="Bearer "+TOKEN

    def start(self,purpose):
        return request_owner_approval(
            GeckoRequest(purpose=purpose,device_label="Consent PC"),
            authorization=self.authorization)["requestId"]

    def check(self,rid):
        return check_owner_approval(GeckoCheck(request_id=rid),
                                    authorization=self.authorization)

    def test_self_confirmed_download_does_not_need_telegram_join_code(self):
        self.assertTrue(_same_lan("192.168.1.52","192.168.1.18"))
        self.assertFalse(_same_lan("192.168.2.52","192.168.1.18"))
        page=_page("Trusted Host",None,"csrf-demo").decode("utf8")
        self.assertIn("由這台電腦確認下載",page)
        self.assertIn("請 Telegram Owner 核准",page)
        self.assertIn("csrf-demo",page)
        self.assertNotIn('href="/file/Slime-Friend.exe"',page)
        ready=_download_ready("Trusted Host","onlyafterconsent",None,
                              Path("/nonexistent")).decode("utf8")
        self.assertIn("已獲得下載授權",ready)
        self.assertIn("github.com",ready)

    def test_telegram_download_requires_owner_and_consumes_once(self):
        rid=self.start("download")
        self.assertEqual(self.check(rid)["status"],"pending")
        self.assertEqual(len(pending_requests(OWNER)),1)
        with self.assertRaises(HTTPException) as wrong:
            decide_request("987654321098765432109",rid,True)
        self.assertEqual(wrong.exception.status_code,409)
        result=decide_request(OWNER,rid,True)
        self.assertEqual(result["purpose"],"download")
        self.assertEqual(self.check(rid)["status"],"approved")
        with self.assertRaises(HTTPException) as again:
            self.check(rid)
        self.assertEqual(again.exception.status_code,409)

    def test_telegram_reject_is_deny_and_not_reusable(self):
        rid=self.start("join")
        decide_request(OWNER,rid,False)
        self.assertEqual(self.check(rid)["status"],"rejected")
        with self.assertRaises(HTTPException):
            decide_request(OWNER,rid,True)

    def test_telegram_join_issues_friend_only_ticket(self):
        rid=self.start("join")
        decide_request(OWNER,rid,True)
        result=self.check(rid)
        self.assertEqual(result["status"],"approved")
        node=slime._redeem_short_pair(code=result["ticket"],label="Neighbor Laptop",
                   role="friend",client_address="192.168.1.22")
        self.assertTrue(node["token"])
        self.assertFalse(node["inference_enabled"])
        with slime._db() as db:
            joined=db.execute("SELECT * FROM nodes WHERE id=?",(node["node_id"],)).fetchone()
            self.assertEqual(joined["role"],"friend")
            self.assertEqual(joined["shutdown_opt_in"],0)
            self.assertEqual(joined["inference_enabled"],0)
        with self.assertRaises(HTTPException):
            self.check(rid)

    def test_cannot_enable_new_gecko_pairing_after_owner_pause(self):
        rid=self.start("download")
        with slime._db() as db:
            db.execute("UPDATE nodes SET gecko_enabled=0 WHERE id=?",(NODE,))
        with self.assertRaises(HTTPException):
            decide_request(OWNER,rid,True)
        with self.assertRaises(HTTPException):
            self.check(rid)

    def test_rogue_device_without_bearer_cannot_create_pending_request(self):
        with self.assertRaises(HTTPException) as exc:
            request_owner_approval(GeckoRequest(purpose="download",device_label="Bad"),
                                   authorization=None)
        self.assertEqual(exc.exception.status_code,401)


if __name__=="__main__":
    unittest.main()
