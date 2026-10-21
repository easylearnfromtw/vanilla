"""Slime Telegram Mini App: signed owner auth, independent UI and safe mutations."""
import asyncio
import hashlib
import hmac
import json
import os
import tempfile
import time
import unittest
from html.parser import HTMLParser
from urllib.parse import urlencode
from unittest.mock import patch

import httpx
from fastapi import HTTPException
from app import app
from ceres_slime_web import _PAGE, _owner, _tables, Owner, Plan, Confirm
from ceres_command_center import _menu, _nodes


CHAT=88334455
OTHER_CHAT=88334456
SUB="123456789012345678901"
TOKEN="123456789:"+"A"*40


class IdCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]
    def handle_starttag(self, tag, attrs):
        props=dict(attrs)
        if props.get("id"):
            self.ids.append(props["id"])


class SlimeTelegramMiniAppTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        settings={
            "CERES_DB_PATH":tmp.name+"/ceres.sqlite",
            "SLIME_DB_PATH":tmp.name+"/slime.sqlite",
            "SLIME_ENABLED":"true",
            "SLIME_PUBLIC_API_ORIGIN":"https://api.example.invalid",
            "SLIME_PAIRING_PAGE_URL":"https://public.example.invalid/slime/",
            "CERES_TELEGRAM_BOT_TOKEN":TOKEN,
            "CERES_TELEGRAM_CHAT_IDS":str(CHAT),
            "CERES_FAMILY_LINKS_JSON":json.dumps({str(CHAT):SUB}),
            "WEIGUO_FAMILY_ACL_JSON":json.dumps({SUB:{"role":"owner","member":"Tester"}}),
            "CERES_ADMIN_WEBAPP_URL":"https://api.example.invalid/v1/ceres/admin/webapp",
            "VANILLA_SLIME_RUNNER_ENABLED":"false",
            "VANILLA_PUBLIC_API_ENABLED":"false",
        }
        ctx=patch.dict(os.environ,settings)
        ctx.start()
        self.addCleanup(ctx.stop)

    def signed(self,chat=CHAT,elapsed=0):
        fields={"auth_date":str(int(time.time())-elapsed),
                "user":json.dumps({"id":chat,"first_name":"Test"},separators=(",",":")),
                "query_id":"AAAB"}
        source="\n".join(k+"="+v for k,v in sorted(fields.items()))
        secret=hmac.new(b"WebAppData",TOKEN.encode(),hashlib.sha256).digest()
        fields["hash"]=hmac.new(secret,source.encode(),hashlib.sha256).hexdigest()
        return urlencode(fields)

    def send(self,path,body=None):
        async def request():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                          base_url="https://api.example.invalid") as client:
                return await client.post("/v1/ceres/slime/"+path,json=body or {})
        return asyncio.run(request())

    def test_standalone_html_is_not_a_public_owner_console(self):
        p=IdCollector();p.feed(_PAGE)
        self.assertEqual(len(p.ids),len(set(p.ids)),"Duplicate DOM id")
        for value in ("overview","devices","pairing","auth-block","node-list",
                      "code","issue","copy-code","confirm-box","approve","cancel"):
            self.assertIn(value,p.ids)
        self.assertIn("window.Telegram?.WebApp",_PAGE)
        self.assertIn('aria-selected="true"',_PAGE)
        self.assertIn("prefers-reduced-motion:reduce",_PAGE)
        self.assertNotIn("https://t.me/SignWell_bot",_PAGE)
        self.assertNotIn("localStorage.",_PAGE)
        self.assertNotIn("sessionStorage.",_PAGE)
        self.assertNotIn("innerHTML=",_PAGE)
        # The public downloadable installer has no link BACK into owner controls.
        from pathlib import Path
        public=(Path(__file__).parents[2]/"public/slime/index.html").read_text("utf-8")
        self.assertNotIn("/v1/ceres/slime/webapp",public)
        self.assertNotIn("SignWell_bot",public)

    def test_get_page_no_store_and_post_requires_signed_initdata(self):
        async def get():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                          base_url="https://api.example.invalid") as client:
                return await client.get("/v1/ceres/slime/webapp")
        res=asyncio.run(get())
        self.assertEqual(res.status_code,200,res.text[:100])
        self.assertIn("frame-ancestors 'none'",res.headers["content-security-policy"])
        self.assertIn("https://telegram.org",res.headers["content-security-policy"])
        self.assertEqual(res.headers["cache-control"],"no-store, private")
        self.assertIn("no-referrer",res.headers["referrer-policy"])
        self.assertNotIn("__NONCE__",res.text)
        self.assertEqual(self.send("snapshot").status_code,422)
        expired=self.send("snapshot",{"init_data":self.signed(elapsed=310)})
        self.assertEqual(expired.status_code,401)
        outsider=self.send("snapshot",{"init_data":self.signed(OTHER_CHAT)})
        self.assertIn(outsider.status_code,(401,403))

    def test_owner_only_node_scope_pairing_and_approval_replay(self):
        auth=self.signed()
        before=self.send("snapshot",{"init_data":auth})
        self.assertEqual(before.status_code,200,before.text)
        self.assertEqual(before.json()["counts"]["total"],0)
        self.assertFalse(before.json()["service"]["message"].find("關閉")<0)
        invite=self.send("issue",{"init_data":auth})
        self.assertEqual(invite.status_code,200,invite.text)
        code=invite.json()["code"]
        self.assertRegex(code,r"^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$")
        self.assertEqual(invite.json()["link"],"https://public.example.invalid/slime/#slime="+code)
        qr=invite.json()["qr_data_uri"]
        if qr:
            import base64
            self.assertTrue(qr.startswith("data:image/png;base64,"))
            self.assertTrue(base64.b64decode(qr.split(",",1)[1]).startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertNotIn("token",invite.json())
        from slime import _redeem_short_pair
        device=_redeem_short_pair(code=code,role="friend",label="Owner Shared PC",
                                  client_address="192.0.2.101")
        node_id=device["node_id"]
        snap=self.send("snapshot",{"init_data":auth})
        self.assertEqual(snap.json()["counts"]["total"],1)
        self.assertEqual(snap.json()["counts"]["inferenceApproved"],0)
        self.assertNotIn(device["token"],snap.text)
        with self.assertRaises(HTTPException):
            _redeem_short_pair(code=code,role="friend",label="Replay",
                               client_address="192.0.2.101")
        for operation,enabled in (("node",False),("inference",True)):
            plan=self.send("plan",{"init_data":auth,"node_id":node_id,
                                   "operation":operation,"enabled":enabled})
            self.assertEqual(plan.status_code,200,plan.text)
            confirm=self.send("confirm",{"init_data":auth,"token":plan.json()["token"]})
            self.assertEqual(confirm.status_code,200,confirm.text)
            replay=self.send("confirm",{"init_data":auth,"token":plan.json()["token"]})
            self.assertEqual(replay.status_code,409)
        new=self.send("snapshot",{"init_data":auth})
        self.assertTrue(new.json()["nodes"][0]["inference_enabled"])
        self.assertFalse(new.json()["nodes"][0]["owner_enabled"])
        self.assertEqual(self.send("plan",{"init_data":auth,"node_id":"f"*24,
                         "operation":"revoke"}).status_code,404)
        destruction=self.send("plan",{"init_data":auth,"node_id":node_id,
                                     "operation":"revoke"})
        self.assertEqual(destruction.status_code,200)
        # Mini App confirmation without a Telegram-issued code must fail closed.
        missing=self.send("confirm",{"init_data":auth,"token":destruction.json()["token"]})
        self.assertEqual(missing.status_code,403)
        from slime_telegram import handle_slime
        import re
        message=handle_slime(CHAT,SUB,"移除 "+node_id)
        proof=re.search(r"確認 ([a-f0-9]{12})",message).group(1)
        result=self.send("confirm",{"init_data":auth,"token":destruction.json()["token"],"code":proof})
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(self.send("snapshot",{"init_data":auth}).json()["nodes"],[])

    def test_owner_hub_uses_web_app_not_public_download_link(self):
        buttons=_menu()
        entries=[b for row in buttons for b in row]
        private=[b for b in entries if b.get("text")=="◎ Slime 私人管理頁"]
        self.assertEqual(len(private),1)
        self.assertEqual(private[0]["web_app"]["url"],
                         "https://api.example.invalid/v1/ceres/slime/webapp")
        self.assertNotIn("callback_data",private[0])
        self.assertEqual(self.send("snapshot",{"init_data":"invalid"}).status_code,422)

    def test_per_hour_invite_limit_without_persisting_plain_codes(self):
        auth=self.signed()
        issued=[]
        for i in range(8):
            res=self.send("issue",{"init_data":auth})
            self.assertEqual(res.status_code,200,res.text)
            issued.append(res.json()["code"])
        ninth=self.send("issue",{"init_data":auth})
        self.assertEqual(ninth.status_code,429)
        with open(os.environ["SLIME_DB_PATH"],"rb") as fh:
            database=fh.read()
        for value in issued:
            self.assertNotIn(value.encode(),database)


if __name__=="__main__":
    unittest.main()
