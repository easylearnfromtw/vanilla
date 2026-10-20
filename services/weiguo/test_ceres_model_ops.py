"""Offline Ceres Owner Operations regression tests. No live provider calls."""
import asyncio
import json
import os
import tempfile
import time
import unittest
from unittest.mock import patch

from cryptography.fernet import Fernet
from fastapi import HTTPException
from ceres_admin_policy import store_provider_key
from ceres_model_catalog import discover, catalog
from ceres_model_ops import (probe,compare,record_usage,summary,diagnostics,dashboard,
                             preview,approve,failover_status,recommendations,
                             set_price,_limit,generate_with_failover)
from ceres_server_model import ModelSettings,ModelUnavailable


class CatalogClient:
    def __init__(self,**kw): pass
    async def __aenter__(self): return self
    async def __aexit__(self,*args): pass
    async def get(self,url,headers):
        self.url=url
        class Resp:
            status_code=200
            content=b"{}"
            def json(self):
                return {"models":[
                    {"name":"models/gemini-2.5-flash","supportedGenerationMethods":["generateContent"]},
                    {"name":"models/gemini-2.5-pro","supportedGenerationMethods":["generateContent"]}]}
        return Resp()


class ProbeClient:
    calls=[]
    def __init__(self,**kw):
        assert kw["follow_redirects"] is False
        assert kw["trust_env"] is False
        assert kw["timeout"]<=18
    async def __aenter__(self): return self
    async def __aexit__(self,*args): pass
    async def post(self,url,headers,json):
        self.calls.append((url,headers,json))
        class Resp:
            status_code=200
            content=b"{}"
            def json(self):
                return {"candidates":[{"content":{"parts":[{"text":"OK"}]}}],
                        "usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":3}}
        return Resp()


class OwnerOperationsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env=patch.dict(os.environ,{
            "CERES_DB_PATH":self.tmp.name+"/ops.sqlite",
            "WEIGUO_VAULT_KEY":Fernet.generate_key().decode(),
            "CERES_SERVER_MODEL_PROVIDER":"",
            "WEIGUO_GMAIL_ACL_ENFORCE":"false",
        })
        self.env.start();self.addCleanup(self.env.stop)
        store_provider_key("gemini","AIza"+"X"*40,123)
        with patch("ceres_model_catalog.httpx.AsyncClient",CatalogClient):
            await discover("gemini")

    async def test_probe_is_real_but_never_saves_text_or_tokens(self):
        ProbeClient.calls=[]
        with patch("ceres_model_ops.httpx.AsyncClient",ProbeClient):
            result=await probe("gemini","gemini-2.5-flash",123)
        self.assertTrue(result["ok"])
        self.assertTrue(result["testWasBillable"])
        self.assertEqual(result["inputTokens"],7)
        self.assertEqual(len(ProbeClient.calls),1)
        self.assertEqual(ProbeClient.calls[0][0],
                         "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent")
        self.assertEqual(recommendations("gemini")["observedFastest"],"gemini-2.5-flash")
        with open(self.tmp.name+"/ops.sqlite","rb") as f:
            data=f.read()
        self.assertNotIn(b"AIza",data)
        self.assertNotIn(b"Reply with OK",data)
        self.assertTrue(diagnostics()["modelChecks"][0]["ok"])

    async def test_usage_is_not_a_fabricated_bill(self):
        record_usage("gemini","gemini-2.5-flash","telegram_reply",11,5)
        first=summary()
        self.assertEqual(first["providers"][0]["calls"],1)
        self.assertEqual(first["providers"][0]["unpriced"],1)
        self.assertIsNone(first["providers"][0]["estimated_usd"])
        set_price("gemini","gemini-2.5-flash",1.5,10.0,123)
        record_usage("gemini","gemini-2.5-flash","telegram_reply",1000,1000)
        later=summary()
        self.assertEqual(later["providers"][0]["unpriced"],1)
        self.assertAlmostEqual(later["providers"][0]["estimated_usd"],0.0115)
        self.assertEqual(later["prices"][0]["source"],"owner_configured")

    async def test_plan_is_owner_confirmed_single_use_and_failover_off_by_default(self):
        self.assertFalse(failover_status()["gemini"])
        p=preview("Gemini 開啟備援",123)
        self.assertTrue(p["requiresConfirmation"])
        self.assertFalse(failover_status()["gemini"])
        self.assertTrue(approve(p["token"],123)["failover"])
        self.assertTrue(failover_status()["gemini"])
        with self.assertRaises(HTTPException):
            approve(p["token"],123)
        p=preview("Gemini 速度優先",123)
        with self.assertRaises(HTTPException):
            approve(p["token"],999)
        self.assertIn("selected",approve(p["token"],123))
        with self.assertRaises(HTTPException):
            preview("delete all user accounts",123)

    async def test_compare_requires_distinct_models_and_is_bounded(self):
        with self.assertRaises(HTTPException):
            await compare("gemini","gemini-2.5-flash","gemini-2.5-flash",123)
        with patch("ceres_model_ops.httpx.AsyncClient",ProbeClient):
            r=await compare("gemini","gemini-2.5-flash","gemini-2.5-pro",123)
        self.assertEqual(len(r["results"]),2)
        self.assertFalse(r["qualityAssessed"])
        self.assertEqual(summary()["providers"][0]["calls"],2)

    async def test_no_background_probe_or_silent_failover(self):
        # No provider requests are issued merely by loading the dashboard.
        with patch("ceres_model_ops.httpx.AsyncClient") as client:
            report=dashboard()
        client.assert_not_called()
        self.assertEqual(report["telegram"]["liveEndToEndNow"],"not_tested")
        settings=ModelSettings(provider="openai",
            base="https://generativelanguage.googleapis.com/v1beta/openai",
            model="gemini-2.5-flash",api_key="temporaryfakekey1234567890")
        with patch("ceres_server_model.generate_reply",side_effect=ModelUnavailable("provider-status")) as gen:
            with self.assertRaises(ModelUnavailable):
                await generate_with_failover(settings,"test",[],"")
        self.assertEqual(gen.await_count,1)


if __name__=="__main__":
    unittest.main()
