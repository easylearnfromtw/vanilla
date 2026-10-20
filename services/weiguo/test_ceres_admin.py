"""Ceres Telegram admin policy regression tests. All network calls are mocked."""
import base64
import hashlib
import hmac
import json
import os
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.parse import urlencode

from cryptography.fernet import Fernet
from fastapi import HTTPException

from ceres_admin_policy import (grant,revoke,accounts,set_enforce,enforce,
 check_identity,store_provider_key,provider_key,provider_status,toggle_provider)
from ceres_admin_bot import owner_subject
from ceres_admin_web import _verify

class CeresAdminTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.chat=888123456
        self.sub="123456789012345678901"
        self.key=Fernet.generate_key().decode()
        env={
         "CERES_DB_PATH":self.tmp.name+"/database.sqlite",
         "WEIGUO_VAULT_KEY":self.key,
         "CERES_TELEGRAM_BOT_TOKEN":"123456789:"+"T"*38,
         "CERES_TELEGRAM_CHAT_IDS":str(self.chat),
         "CERES_FAMILY_LINKS_JSON":json.dumps({str(self.chat):self.sub}),
         "WEIGUO_FAMILY_ACL_JSON":json.dumps({self.sub:{"role":"owner","member":"Admin"}}),
         "WEIGUO_GMAIL_ACL_ENFORCE":"false",
        }
        self.patch=patch.dict(os.environ,env)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_allowlist_binds_google_subject_and_revokes(self):
        grant("Person@Gmail.com","owner",["chat","gemini"],self.chat)
        set_enforce(True,self.chat)
        self.assertTrue(enforce())
        check_identity(self.sub,"person@gmail.com",bind=True,scope="chat")
        check_identity(self.sub,"person@gmail.com",scope="gemini")
        with self.assertRaises(HTTPException):
            check_identity(self.sub,"person@gmail.com",scope="canva")
        with self.assertRaises(HTTPException):
            check_identity("9999999999","person@gmail.com",scope="chat")
        revoke("person@gmail.com",self.chat)
        with self.assertRaises(HTTPException):
            check_identity(self.sub,"person@gmail.com")
        self.assertEqual(accounts()[0]["enabled"],False)

    def test_vault_is_encrypted_and_honors_toggle(self):
        key="AIza"+"A"*40
        store_provider_key("gemini",key,self.chat)
        self.assertEqual(provider_key("gemini"),key)
        with open(self.tmp.name+"/database.sqlite","rb") as handle:
            self.assertNotIn(key.encode(),handle.read())
        toggle_provider("gemini",False,self.chat)
        self.assertIsNone(provider_key("gemini"))
        self.assertFalse(next(x for x in provider_status() if x["provider"]=="gemini")["enabled"])
        toggle_provider("gemini",True,self.chat)
        self.assertEqual(provider_key("gemini"),key)

    def test_only_linked_owner_can_manage(self):
        self.assertEqual(owner_subject(self.chat),self.sub)
        self.assertIsNone(owner_subject(self.chat+1))
        with patch.dict(os.environ,{"WEIGUO_FAMILY_ACL_JSON":json.dumps({self.sub:{"role":"member","member":"Family"}})}):
            self.assertIsNone(owner_subject(self.chat))

    def _init_data(self,chat=None,stamp=None):
        values={"auth_date":str(stamp or int(time.time())),
                "user":json.dumps({"id":chat or self.chat,"first_name":"x"},separators=(",",":"))}
        body="\n".join(k+"="+v for k,v in sorted(values.items()))
        token=os.environ["CERES_TELEGRAM_BOT_TOKEN"].encode()
        secret=hmac.new(b"WebAppData",token,hashlib.sha256).digest()
        values["hash"]=hmac.new(secret,body.encode(),hashlib.sha256).hexdigest()
        return urlencode(values)

    def test_signed_telegram_webapp_must_be_fresh_and_owner(self):
        self.assertEqual(_verify(self._init_data()),self.chat)
        with self.assertRaises(HTTPException):
            _verify(self._init_data(chat=self.chat+1))
        with self.assertRaises(HTTPException):
            _verify(self._init_data(stamp=int(time.time())-800))
        data=self._init_data()
        with self.assertRaises(HTTPException):
            _verify(data.replace("first_name", "other_name"))

if __name__=="__main__":
    unittest.main()
