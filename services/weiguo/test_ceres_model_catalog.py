"""Offline regression tests for Ceres owner-only automatic model discovery."""
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException

from ceres_admin_policy import store_provider_key
from ceres_model_catalog import (_clean_id, _parse, _pick, catalog, discover,
                                 select_mode, selected_model, clear_catalog)

class ModelCatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env=patch.dict(os.environ,{
            "CERES_DB_PATH":self.tmp.name+"/ceres.sqlite",
            "WEIGUO_VAULT_KEY":Fernet.generate_key().decode(),
            "WEIGUO_CANVA_ACCESS_TOKEN":"",
            "CERES_SERVER_MODEL_API_KEY":"",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_gemini_filters_non_generating_and_sensitive_models(self):
        result=_parse("gemini",{"models":[
            {"name":"models/gemini-2.5-flash","supportedGenerationMethods":["generateContent"],"inputTokenLimit":10000},
            {"name":"models/gemini-3-pro","supportedGenerationMethods":["generateContent"]},
            {"name":"models/gemini-embedding-001","supportedGenerationMethods":["embedContent"]},
            {"name":"models/gemini-2.5-flash","supportedGenerationMethods":["generateContent"]},
            {"name":"models/gemini-2.5-image","supportedGenerationMethods":["generateContent"]}]})
        self.assertEqual([m["id"] for m in result],["gemini-2.5-flash","gemini-3-pro"])

    def test_profiles_and_manual_no_invented_model(self):
        models=_parse("deepseek",{"data":[{"id":"deepseek-flash"},{"id":"deepseek-v4-pro"}]})
        self.assertEqual(_pick(models,"balanced",""),"deepseek-flash")
        self.assertEqual(_pick(models,"quality",""),"deepseek-v4-pro")
        self.assertEqual(_pick(models,"manual","does-not-exist"),"")
        self.assertIsNone(_clean_id("https://untrusted.example/","openai"))

    def test_unknown_provider_and_no_key_are_rejected(self):
        self.assertFalse(catalog("canva")["supported"])
        with self.assertRaises(HTTPException):
            select_mode("gemini","manual","gemini-fake",123)
        self.assertIsNone(selected_model("openai"))

class FakeResponse:
    status_code=200
    content=b'{"models":[]}'
    def json(self):
        return {"models":[
            {"name":"models/gemini-2.5-flash","supportedGenerationMethods":["generateContent"]},
            {"name":"models/gemini-3-pro","supportedGenerationMethods":["generateContent"]}]}

class FakeClient:
    def __init__(self, **kw):
        assert kw["follow_redirects"] is False
        assert kw["trust_env"] is False
        assert kw["timeout"]<=10
    async def __aenter__(self): return self
    async def __aexit__(self,*args): pass
    async def get(self,url,headers):
        assert url=="https://generativelanguage.googleapis.com/v1beta/models"
        assert headers["x-goog-api-key"]=="AIza"+"a"*40
        return FakeResponse()

class DiscoveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env=patch.dict(os.environ,{
            "CERES_DB_PATH":self.tmp.name+"/db.sqlite",
            "WEIGUO_VAULT_KEY":Fernet.generate_key().decode(),
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        store_provider_key("gemini","AIza"+"a"*40,123)

    async def test_discovery_status_and_manual_override(self):
        with patch("ceres_model_catalog.httpx.AsyncClient",FakeClient):
            item=await discover("gemini")
        self.assertEqual(item["selected"],"gemini-2.5-flash")
        item=select_mode("gemini","quality","",123)
        self.assertEqual(item["selected"],"gemini-3-pro")
        item=select_mode("gemini","manual","gemini-2.5-flash",123)
        self.assertEqual(item["selected"],"gemini-2.5-flash")
        with self.assertRaises(HTTPException):
            select_mode("gemini","manual","gemini-nonexistent",123)
        clear_catalog("gemini")
        self.assertIsNone(selected_model("gemini"))

if __name__=="__main__":
    unittest.main()
