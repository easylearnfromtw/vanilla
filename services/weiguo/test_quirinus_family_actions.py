"""Real WeiGuo ASGI tests for family-approved Quirinus Actions broker."""
import asyncio
import json
import os
import unittest
from unittest.mock import patch, AsyncMock
import httpx
import auth
import app as gateway
import quirinus_family_actions as broker

OWNER = "123456789012345678901"
OTHER = "987654321098765432109"
MEMBER = "223456789012345678901"

class QuirinusFamilyActionsTests(unittest.TestCase):
    def setUp(self):
        values = {
            "WEIGUO_GOOGLE_CLIENT_ID": "test.apps.googleusercontent.com",
            "WEIGUO_SESSION_SECRET": "family-session-secret-1234567890-0001",
            "WEIGUO_ADMIN_TOKEN": "operator-session-secret-1234567890-0002",
            "WEIGUO_FAMILY_ACL_JSON": json.dumps({
                OWNER: {"member":"Owner","role":"owner"},
                OTHER: {"member":"Other","role":"owner"},
                MEMBER: {"member":"Member","role":"member"},
            }),
            "WEIGUO_PUBLIC_FAMILY_ONLY": "true",
            "QUIRINUS_FAMILY_DISPATCH_ENABLED": "false",
            "QUIRINUS_FAMILY_OWNER_SUBS": "",
            "QUIRINUS_GITHUB_ACTIONS_TOKEN": "",
        }
        env = patch.dict(os.environ, values)
        env.start()
        self.addCleanup(env.stop)
        broker._PENDING.clear()
        broker._RUNS.clear()
        broker._RATE.clear()

    def request(self, method, path, **kw):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),
                                         base_url="http://test") as client:
                return await client.request(method, path, **kw)
        return asyncio.run(run())

    def auth_headers(self, sub):
        claims = {"sub":sub,"email":"person@example.test",
                  "email_verified":True,"iss":"https://accounts.google.com"}
        with patch.object(auth.id_token, "verify_oauth2_token", return_value=claims):
            r = self.request("POST","/v1/auth/google",json={"credential":"X"*200})
        self.assertEqual(r.status_code,200,r.text)
        return {"Authorization":"Bearer "+r.json()["token"]}

    def enable(self):
        os.environ["QUIRINUS_FAMILY_DISPATCH_ENABLED"] = "true"
        os.environ["QUIRINUS_FAMILY_OWNER_SUBS"] = OWNER+","+OTHER
        os.environ["QUIRINUS_GITHUB_ACTIONS_TOKEN"] = "T"*40

    def test_default_off_and_family_boundary(self):
        self.assertEqual(self.request("POST","/v1/family/quirinus/prepare").status_code,401)
        self.assertEqual(self.request("POST","/v1/operator/quirinus/scan").status_code,404)
        owner=self.auth_headers(OWNER)
        self.assertEqual(self.request("POST","/v1/family/quirinus/prepare",headers=owner).status_code,403)
        self.enable()
        member=self.auth_headers(MEMBER)
        self.assertEqual(self.request("POST","/v1/family/quirinus/prepare",headers=member).status_code,403)
        self.assertTrue(self.request("GET","/v1/family/quirinus/status",headers=owner).json()["enabled"])

    def test_consent_and_one_use(self):
        self.enable()
        owner=self.auth_headers(OWNER)
        other=self.auth_headers(OTHER)
        p=self.request("POST","/v1/family/quirinus/prepare",headers=owner)
        self.assertEqual(p.status_code,200,p.text)
        token=p.json()["approvalToken"]
        with patch.object(broker,"_dispatch_github",new_callable=AsyncMock) as invoke:
            url="/v1/family/quirinus/execute"
            self.assertEqual(self.request("POST",url,headers=owner,json={
                "approval_token":token,"approved":False}).status_code,403)
            self.assertEqual(self.request("POST",url,headers=other,json={
                "approval_token":token,"approved":True}).status_code,403)
            self.assertEqual(self.request("POST",url,headers=owner,json={
                "approval_token":token,"approved":True}).status_code,403)
            fresh=self.request("POST","/v1/family/quirinus/prepare",headers=owner).json()["approvalToken"]
            ok=self.request("POST",url,headers=owner,json={
                "approval_token":fresh,"approved":True})
            self.assertEqual(ok.status_code,202,ok.text)
            self.assertEqual(ok.json()["ref"],"main")
            self.assertNotIn(fresh,ok.text)
            self.assertEqual(invoke.await_count,1)
            self.assertEqual(self.request("POST",url,headers=owner,json={
                "approval_token":fresh,"approved":True}).status_code,403)

    def test_owner_scoped_status_and_quota(self):
        self.enable()
        owner=self.auth_headers(OWNER)
        other=self.auth_headers(OTHER)
        mock_run={"status":"completed","conclusion":"success",
                  "url":"https://github.com/easylearnfromtw/vanilla/actions/runs/123","runId":123}
        with patch.object(broker,"_dispatch_github",new_callable=AsyncMock), \
             patch.object(broker,"_find_run",new_callable=AsyncMock,return_value=mock_run):
            for _ in range(2):
                token=self.request("POST","/v1/family/quirinus/prepare",headers=owner).json()["approvalToken"]
                result=self.request("POST","/v1/family/quirinus/execute",headers=owner,json={
                    "approval_token":token,"approved":True})
                rid=result.json()["requestId"]
                self.assertEqual(self.request("GET","/v1/family/quirinus/runs/"+rid,
                                              headers=other).status_code,404)
                self.assertEqual(self.request("GET","/v1/family/quirinus/runs/"+rid,
                                              headers=owner).json()["conclusion"],"success")
            self.assertEqual(self.request("POST","/v1/family/quirinus/prepare",
                                          headers=owner).status_code,429)

    def test_missing_or_reused_backend_secret_fails_closed(self):
        self.enable()
        os.environ["QUIRINUS_GITHUB_ACTIONS_TOKEN"] = os.environ["WEIGUO_ADMIN_TOKEN"]
        owner=self.auth_headers(OWNER)
        self.assertEqual(self.request("POST","/v1/family/quirinus/prepare",headers=owner).status_code,503)

if __name__=="__main__":
    unittest.main()
