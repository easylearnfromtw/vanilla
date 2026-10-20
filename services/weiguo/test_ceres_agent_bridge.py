"""Ceres phone-local bridge: auth, whitelist, dedupe, leases and one-shot delivery."""
import asyncio
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from app import app
from auth import FamilyIdentity, family_reader
from ceres_gateway import _session

OWNER="123456789012345678901"
OTHER="223456789012345678901"
CHAT=123456789
SECRET="S"*45
TOKEN="12345678:"+("b"*36)

class CeresForegroundTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        env=patch.dict(os.environ,{
            "CERES_DB_PATH":temp.name+"/ceres.sqlite",
            "CERES_ENABLED":"true",
            "CERES_OUTBOUND_ENABLED":"true",
            "CERES_LOCAL_BRIDGE_ENABLED":"true",
            "CERES_TELEGRAM_WEBHOOK_SECRET":SECRET,
            "CERES_TELEGRAM_CHAT_IDS":str(CHAT),
            "CERES_TELEGRAM_BOT_TOKEN":TOKEN,
            "CERES_FAMILY_LINKS_JSON":'{"'+str(CHAT)+'":"'+OWNER+'"}',
            "WEIGUO_FAMILY_ACL_JSON":'{"'+OWNER+'":{"member":"owner","role":"owner"}}',
        })
        env.start()
        self.addCleanup(env.stop)
        app.dependency_overrides[family_reader]=lambda:FamilyIdentity(OWNER,"owner","owner","unit@example.com")
        self.addCleanup(app.dependency_overrides.pop,family_reader,None)

    def request(self, method, path, **kwargs):
        async def call():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                         base_url="https://test.example") as client:
                return await client.request(method,path,**kwargs)
        return asyncio.run(call())

    def webhook(self, update=10, user=CHAT, text="你好"):
        payload={"update_id":update,"message":{"chat":{"type":"private","id":user},
                 "from":{"id":user,"is_bot":False},"text":text}}
        return self.request("POST","/v1/ceres/telegram/webhook",json=payload,
                            headers={"X-Telegram-Bot-Api-Secret-Token":SECRET})

    def claim(self):
        return self.request("POST","/v1/family/ceres/bridge/claim",json={})

    def test_queued_only_after_valid_signed_unique_telegram_update(self):
        self.assertTrue(self.webhook().json()["accepted"])
        self.assertFalse(self.webhook().json()["accepted"])
        j=self.claim()
        self.assertEqual(j.status_code,200,j.text)
        self.assertEqual(j.json()["job"]["text"],"你好")
        self.assertIsNone(self.claim().json()["job"])
        self.assertEqual(self.request("GET","/v1/family/ceres/bridge/status").json()["alwaysOn"],False)

    def test_bridge_disabled_even_though_inbox_available(self):
        with patch.dict(os.environ,{"CERES_LOCAL_BRIDGE_ENABLED":"false"}):
            self.assertTrue(self.webhook().json()["accepted"])
            self.assertEqual(self.claim().status_code,503)
            self.assertFalse(self.request("GET","/v1/family/ceres/bridge/status").json()["enabled"])

    def test_unlinked_family_identity_must_not_claim(self):
        self.assertTrue(self.webhook().json()["accepted"])
        app.dependency_overrides[family_reader]=lambda:FamilyIdentity(OTHER,"other","owner","other@example.com")
        self.assertEqual(self.claim().status_code,403)

    def test_manual_skip_never_delivers(self):
        self.assertTrue(self.webhook().json()["accepted"])
        job=self.claim().json()["job"]
        path="/v1/family/ceres/bridge/events/"+str(job["eventId"])
        r=self.request("POST",path+"/skip",json={"lease":job["lease"]})
        self.assertTrue(r.json()["skipped"])
        self.assertEqual(self.request("POST",path+"/complete",
                            json={"lease":job["lease"],"text":"你好","tool":"merlin"}).status_code,409)

    def test_verified_send_is_one_shot_and_deduplicated(self):
        self.assertTrue(self.webhook().json()["accepted"])
        job=self.claim().json()["job"]
        path="/v1/family/ceres/bridge/events/"+str(job["eventId"])
        with patch("ceres_agent_delivery.deliver",new_callable=AsyncMock,return_value=True) as sender:
            result=self.request("POST",path+"/complete",
                              json={"lease":job["lease"],"text":"收到","tool":"merlin"})
            self.assertEqual(result.status_code,200,result.text)
            self.assertTrue(result.json()["automatic"])
            self.assertEqual(self.request("POST",path+"/complete",
                             json={"lease":job["lease"],"text":"重複","tool":"merlin"}).status_code,409)
            sender.assert_awaited_once()
        with _session() as db:
            self.assertEqual(db.execute("SELECT status FROM ceres_outbox WHERE event_id=?",
                                        (job["eventId"],)).fetchone()[0],"sent")

    def test_unknown_delivery_is_never_retried(self):
        self.assertTrue(self.webhook().json()["accepted"])
        job=self.claim().json()["job"]
        path="/v1/family/ceres/bridge/events/"+str(job["eventId"])
        with patch("ceres_agent_delivery.deliver",new_callable=AsyncMock,return_value=False) as sender:
            self.assertEqual(self.request("POST",path+"/complete",
              json={"lease":job["lease"],"text":"內容","tool":"merlin"}).status_code,502)
            self.assertEqual(self.request("POST",path+"/complete",
              json={"lease":job["lease"],"text":"再試","tool":"merlin"}).status_code,409)
            sender.assert_awaited_once()

    def test_expired_lease_and_invalid_tool_rejected(self):
        self.assertTrue(self.webhook().json()["accepted"])
        job=self.claim().json()["job"]
        with _session() as db:
            db.execute("UPDATE ceres_agent_jobs SET claimed_at=? WHERE event_id=?",
                       (1,job["eventId"]))
        path="/v1/family/ceres/bridge/events/"+str(job["eventId"])+"/complete"
        self.assertEqual(self.request("POST",path,
          json={"lease":job["lease"],"text":"hi","tool":"merlin"}).status_code,409)
        self.assertEqual(self.request("POST",path,
          json={"lease":job["lease"],"text":"hi","tool":"shell"}).status_code,422)

if __name__=="__main__":
    unittest.main()
