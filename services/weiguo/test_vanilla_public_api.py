"""Offline contract and security regression tests for the owned-model API."""
from __future__ import annotations

import asyncio
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch, AsyncMock

from fastapi import HTTPException

from vanilla_public_api import (
    _origin,_reserve,_finish,_key_from_header,_fetch_catalog,admin_router,
    _owner_projects,issue_key,new_project,revoke_key,owner_status,models,chat,
    Completion,ProjectCreate,ProjectToggle,project_toggle,KeyCreate,KeyRevoke,Owner,_session,client_usage
)
from vanilla_api_console import PAGE,api_console

CHAT=987654321


class MockReply:
    status_code=200
    content=b'{"data":[]}'
    def __init__(self,payload,status_code=200):
        import json
        self.payload=payload
        self.content=json.dumps(payload).encode()
        self.status_code=status_code
    def json(self):return self.payload


class MockInference:
    versions=["owner-model-v1"]
    generations=0
    calls=[]
    def __init__(self,**kwargs):
        assert kwargs.get("follow_redirects") is False
        assert kwargs.get("trust_env") is False
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass
    async def get(self,url,headers):
        assert url=="https://models.example.org/v1/models"
        assert headers["Authorization"]=="Bearer "+"T"*36
        return MockReply({"data":[{"id":m} for m in self.versions]})
    async def post(self,url,json,headers):
        self.calls.append((url,json,headers))
        assert url=="https://models.example.org/v1/chat/completions"
        assert headers["Authorization"]=="Bearer "+"T"*36
        self.generations+=1
        return MockReply({"choices":[{"message":{"role":"assistant","content":"Local answer."}}],
                          "usage":{"prompt_tokens":12,"completion_tokens":4}})


class OwnedModelAPITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.db=tmp.name+"/ceres.sqlite"
        env=patch.dict(os.environ,{
            "CERES_DB_PATH":self.db,
            "VANILLA_PUBLIC_API_ENABLED":"true",
            "VANILLA_INFERENCE_BASE_URL":"https://models.example.org/v1",
            "VANILLA_INFERENCE_ALLOWED_HOST":"models.example.org",
            "VANILLA_INFERENCE_SERVICE_KEY":"T"*36,
            "VANILLA_INFERENCE_DEFAULT_MODEL":"owner-model-v1",
        })
        env.start();self.addCleanup(env.stop)
        self.signer=patch("vanilla_public_api._verify",return_value=CHAT)
        self.signer.start();self.addCleanup(self.signer.stop)
        MockInference.versions=["owner-model-v1"];MockInference.generations=0
        MockInference.calls=[]
        self.http=patch("vanilla_public_api.httpx.AsyncClient",MockInference)
        self.http.start();self.addCleanup(self.http.stop)
        from ceres_api_access import _db as access_db
        with access_db() as access:
            access.execute("INSERT INTO api_access(user_id,approved) VALUES(?,1)",(CHAT,))
        self.project=await new_project(ProjectCreate(init_data="signedtelegramdata987654321",label="Friend workspace"))
        self.default_key=await issue_key(KeyCreate(init_data="signedtelegramdata987654321",
            project_id=self.project["id"],label="app-test",models=["vanilla-default"],
            daily_tokens=2000,monthly_tokens=10000,rpm=8,
            max_output_tokens=128,expires_days=30))
        self.token=self.default_key["api_key"]

    async def test_api_key_is_random_stored_only_as_digest(self):
        self.assertTrue(self.token.startswith("vnl_"))
        self.assertEqual(_key_from_header("Bearer "+self.token)["project_id"],self.project["id"])
        with open(self.db,"rb") as f:data=f.read()
        self.assertNotIn(self.token.encode(),data)
        self.assertIn(hashlib.sha256(self.token.encode()).hexdigest().encode(),data)
        self.assertNotIn(("T"*36).encode(),data)
        self.assertTrue(self.default_key["shown_once"])
        with self.assertRaises(HTTPException) as err:
            _key_from_header("Bearer "+"vnl_"+"0"*20+"_"+"x"*43)
        self.assertEqual(err.exception.status_code,401)

    async def test_real_model_catalog_and_auto_stable_alias(self):
        listing=await models(authorization="Bearer "+self.token)
        self.assertEqual([x["id"] for x in listing["data"]],["vanilla-default"])
        MockInference.versions=["owner-model-v2"]
        os.environ["VANILLA_INFERENCE_DEFAULT_MODEL"]="owner-model-v2"
        with _session() as db:
            db.execute("UPDATE vanilla_api_catalog SET refreshed_at=? WHERE marker=1",
                       (int(time.time())-1000,))
        listed=await models(authorization="Bearer "+self.token)
        self.assertEqual(listed["data"][0]["id"],"vanilla-default")
        result=await chat(Completion(model="vanilla-default",messages=[{
            "role":"user","content":"hi"}],max_tokens=40),authorization="Bearer "+self.token)
        self.assertEqual(result["choices"][0]["message"]["content"],"Local answer.")
        self.assertEqual(MockInference.calls[-1][1]["model"],"owner-model-v2")
        self.assertEqual(result["usage"]["total_tokens"],16)

    async def test_cannot_use_ungranted_actual_model(self):
        with self.assertRaises(HTTPException) as error:
            await chat(Completion(model="owner-model-v1",messages=[{"role":"user","content":"hi"}]),
                       authorization="Bearer "+self.token)
        self.assertEqual(error.exception.status_code,403)
        self.assertEqual(MockInference.generations,0)

    async def test_project_emergency_switch_disables_all_client_keys(self):
        status=await project_toggle(ProjectToggle(
            init_data="signedtelegramdata987654321",project_id=self.project["id"],enabled=False))
        self.assertFalse(status["enabled"])
        with self.assertRaises(HTTPException) as blocked:
            _key_from_header("Bearer "+self.token)
        self.assertEqual(blocked.exception.status_code,401)
        await project_toggle(ProjectToggle(
            init_data="signedtelegramdata987654321",project_id=self.project["id"],enabled=True))
        self.assertEqual(_key_from_header("Bearer "+self.token)["project_id"],self.project["id"])
        with _session() as db:
            rows=db.execute("SELECT operation FROM vanilla_api_audit").fetchall()
        self.assertIn("project_disabled",[row["operation"] for row in rows])

    async def test_streaming_must_fail_before_invoking_runtime(self):
        with self.assertRaises(HTTPException) as err:
            await chat(Completion(model="vanilla-default",messages=[{"role":"user","content":"x"}],
                                  stream=True),authorization="Bearer "+self.token)
        self.assertEqual(err.exception.status_code,422)
        self.assertEqual(MockInference.generations,0)

    async def test_multiple_requests_meter_exact_returned_usage_and_budget(self):
        for _ in range(3):
            await chat(Completion(model="vanilla-default",messages=[{"role":"user","content":"Hello"}],
                                  max_tokens=60),authorization="Bearer "+self.token)
        with _session() as db:
            a=db.execute("SELECT COUNT(*) n,SUM(charged_tokens) units FROM vanilla_api_usage").fetchone()
        self.assertEqual(a["n"],3)
        self.assertEqual(a["units"],48)
        # Reservation is protected across concurrent requests, not only in-memory.
        k=_key_from_header("Bearer "+self.token)
        job1=_reserve(k,"owner-model-v1",200)
        job2=_reserve(k,"owner-model-v1",200)
        with self.assertRaises(HTTPException) as err:
            _reserve(k,"owner-model-v1",200)
        self.assertEqual(err.exception.status_code,429)
        _finish(k["id"],job1,200,status="success",usage={"prompt_tokens":10,"completion_tokens":10})
        _finish(k["id"],job2,200,status="success",usage={"prompt_tokens":10,"completion_tokens":10})

    async def test_revocation_and_disabled_runtime_fail_closed(self):
        await revoke_key(KeyRevoke(init_data="signedtelegramdata987654321",
                                   key_id=self.default_key["id"]))
        with self.assertRaises(HTTPException) as rev:
            _key_from_header("Bearer "+self.token)
        self.assertEqual(rev.exception.status_code,401)
        with patch.dict(os.environ,{"VANILLA_PUBLIC_API_ENABLED":"false"}):
            with self.assertRaises(HTTPException) as disabled:
                _key_from_header("Bearer "+self.token)
            self.assertEqual(disabled.exception.status_code,503)
        with patch.dict(os.environ,{"VANILLA_INFERENCE_BASE_URL":"http://127.0.0.1:11434"}):
            with self.assertRaises(HTTPException):
                _origin()

    async def test_owner_bound_project_isolation(self):
        from ceres_api_access import _db as access_db
        with access_db() as access:
            access.execute("INSERT INTO api_access(user_id,approved) VALUES(?,1)",(CHAT+1,))
        with patch("vanilla_public_api._verify",return_value=CHAT+1):
            values=_owner_projects(CHAT+1)
            self.assertEqual(values,[])
            with self.assertRaises(HTTPException) as err:
                await issue_key(KeyCreate(init_data="signedtelegramdata987654321",
                    project_id=self.project["id"],label="stolen",models=["*"],
                    daily_tokens=2000,monthly_tokens=3000,rpm=1))
            self.assertEqual(err.exception.status_code,404)

    async def test_budget_reservation_is_conservative_without_fabricated_usage(self):
        key=_key_from_header("Bearer "+self.token)
        job=_reserve(key,"owner-model-v1",600)
        _finish(key["id"],job,600,status="failed")
        with _session() as db:
            row=db.execute("SELECT charged_tokens,prompt_tokens,status FROM vanilla_api_usage "
                           "WHERE id=?",(job,)).fetchone()
        self.assertEqual(row["charged_tokens"],600)
        self.assertIsNone(row["prompt_tokens"])
        self.assertEqual(row["status"],"failed")

    async def test_no_api_key_after_expiry_and_restricted_project_limits(self):
        with _session() as db:
            db.execute("UPDATE vanilla_api_keys SET expires_at=1")
        with self.assertRaises(HTTPException):
            _key_from_header("Bearer "+self.token)
        with self.assertRaises(HTTPException):
            await issue_key(KeyCreate(init_data="signedtelegramdata987654321",
                project_id=self.project["id"],label="bad-model",models=["https://evil.example"],
                daily_tokens=2000,monthly_tokens=3000,rpm=1))

    async def test_client_self_service_kpi_has_only_own_key(self):
        await chat(Completion(model="vanilla-default",messages=[{"role":"user","content":"Hello"}],
                              max_tokens=64),authorization="Bearer "+self.token)
        data=await client_usage(authorization="Bearer "+self.token)
        self.assertEqual(data["project"],"Friend workspace")
        self.assertEqual(data["todayChargedTokens"],16)
        self.assertEqual(data["monthChargedTokens"],16)
        self.assertEqual(data["requestsThisMonth"],1)
        self.assertEqual(data["allowedModels"],["vanilla-default"])
        self.assertNotIn("api_key",data)

    async def test_api_service_page_is_tabbable_and_no_store(self):
        response=await api_console()
        self.assertEqual(response.headers["cache-control"],"no-store, private")
        self.assertIn("frame-ancestors 'none'",response.headers["content-security-policy"])
        self.assertIn('id="issuedKey"',PAGE)
        self.assertIn("api_key",PAGE)
        self.assertIn('role="tablist"',PAGE)
        self.assertIn('class="screen"',PAGE)
        self.assertIn("prefers-reduced-motion:reduce",PAGE)
        self.assertIn("vanilla-default",PAGE)
        self.assertNotIn("fonts.googleapis.com",PAGE)
        self.assertNotIn("innerHTML",PAGE)
        # Regression from earlier deploy: modules must be in all container images.
        root=Path(__file__).parent
        for path in ("Dockerfile","Dockerfile.pdfcraft"):
            content=(root/path).read_text(encoding="utf-8")
            self.assertIn("vanilla_public_api.py vanilla_api_console.py",content)
            self.assertIn("vanilla_public_api, vanilla_api_console",content)

    async def test_frontend_js_syntax_if_node_available(self):
        if not shutil.which("node"):
            self.skipTest("node not installed")
        script=PAGE.split('<script nonce="__NONCE__">',1)[1].split("</script>",1)[0]
        p=subprocess.run(["node","--check"],input=script,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stderr[:1000])


if __name__=="__main__":
    unittest.main()
