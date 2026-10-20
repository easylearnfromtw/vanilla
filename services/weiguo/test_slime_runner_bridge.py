"""Offline integration tests for consented local Slime/Ollama token metering."""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

import slime
from ceres_gateway import _session
from slime_runner_bridge import Registration,Result,register,poll,complete,catalog,dispatch
from vanilla_public_api import (ProjectCreate,KeyCreate,Completion,new_project,issue_key,
                                 models,chat,client_usage)
import slime_runner_agent as agent

OWNER_CHAT=7681209
SUB="owner-model-sub-152"
NODEID="aabbccddeeff001122334455"


class LocalModelRunnerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        directory=tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        env=patch.dict(os.environ,{
            "CERES_DB_PATH":directory.name+"/weiguo.db",
            "SLIME_DB_PATH":directory.name+"/slime.db",
            "SLIME_ENABLED":"true","VANILLA_SLIME_RUNNER_ENABLED":"true",
            "VANILLA_PUBLIC_API_ENABLED":"true",
            "VANILLA_INFERENCE_MODE":"slime_pull",
            "VANILLA_INFERENCE_DEFAULT_MODEL":"local-v1:3b",
        })
        env.start();self.addCleanup(env.stop)
        for target,result in [("vanilla_public_api._verify",OWNER_CHAT),
                              ("vanilla_public_api.owner_subject",SUB)]:
            pass
        verify=patch("vanilla_public_api._verify",return_value=OWNER_CHAT)
        verify.start();self.addCleanup(verify.stop)
        owner=patch("ceres_admin_bot.owner_subject",return_value=SUB)
        owner.start();self.addCleanup(owner.stop)
        self.node_token=secrets.token_urlsafe(32)
        with slime._db() as db:
            db.execute("""INSERT INTO nodes
              (id,owner,token_digest,label,role,last_seen,share_enabled,owner_enabled)
              VALUES(?,?,?,?,?,?,1,1)""",
              (NODEID,SUB,slime._digest(self.node_token),"Owned desktop","friend",time.time()))
        project=await new_project(ProjectCreate(init_data="signed_init_from_owner_very_long",label="Owner test"))
        key=await issue_key(KeyCreate(init_data="signed_init_from_owner_very_long",
             project_id=project["id"],label="local-key",models=["vanilla-default"],
             daily_tokens=10000,monthly_tokens=100000,rpm=15,max_output_tokens=256))
        self.secret=key["api_key"]

    def _auth(self):
        return "Bearer "+self.node_token

    def _heartbeat(self):
        slime.heartbeat(slime.Heartbeat(capabilities=slime.Caps(cpu=4,ram_gb=8),
                                      share_enabled=True),authorization=self._auth())

    def _approve(self):
        return slime.inference_policy(NODEID,slime.Policy(enabled=True),
                        user=SimpleNamespace(sub=SUB,role="owner"))

    async def test_no_runner_visibility_before_owner_approval(self):
        self._heartbeat()
        with self.assertRaises(HTTPException) as err:
            register(Registration(models=["local-v1:3b"]),authorization=self._auth())
        self.assertEqual(err.exception.status_code,403)
        with self.assertRaises(HTTPException) as err:
            await models(authorization="Bearer "+self.secret)
        self.assertEqual(err.exception.status_code,503)

    async def test_approval_runner_poll_end_to_end_and_exact_token_usage(self):
        self._approve()
        self._heartbeat()
        reg=register(Registration(models=["local-v1:3b"]),authorization=self._auth())
        self.assertTrue(reg["ok"])
        available=await models(authorization="Bearer "+self.secret)
        self.assertEqual(available["data"][0]["id"],"vanilla-default")
        with self.assertRaises(HTTPException) as no_auth:
            poll(authorization="Bearer "+"a"*45)
        self.assertEqual(no_auth.exception.status_code,401)

        async def runner():
            for _ in range(65):
                task=poll(authorization=self._auth())["job"]
                if task:
                    self.assertEqual(task["request"]["max_tokens"],64)
                    self.assertEqual(task["model"],"local-v1:3b")
                    self.assertEqual(task["request"]["messages"][0]["content"],"Hello")
                    self.assertNotIn(self.secret,json.dumps(task))
                    return complete(Result(job_id=task["id"],ok=True,text="Hi from 3050",
                                           prompt_tokens=11,completion_tokens=6),
                                    authorization=self._auth())
                await asyncio.sleep(.02)
            self.fail("Runner never saw the queued request")
        worker=asyncio.create_task(runner())
        result=await chat(Completion(model="vanilla-default",max_tokens=64,
                           messages=[{"role":"user","content":"Hello"}]),
                          authorization="Bearer "+self.secret)
        self.assertTrue((await worker)["accepted"])
        self.assertEqual(result["choices"][0]["message"]["content"],"Hi from 3050")
        self.assertEqual(result["usage"]["prompt_tokens"],11)
        self.assertEqual(result["usage"]["completion_tokens"],6)
        self.assertEqual((await client_usage(authorization="Bearer "+self.secret))["todayChargedTokens"],17)
        with _session() as db:
            row=db.execute("SELECT state,request_json FROM slime_runner_jobs").fetchone()
            self.assertEqual(row["state"],"done")
            self.assertEqual(row["request_json"],"{}")  # prompt is purged after result

    async def test_owner_can_revoke_node_inference_and_catalog_disappears(self):
        self._approve()
        self._heartbeat()
        register(Registration(models=["local-v1:3b"]),authorization=self._auth())
        slime.inference_policy(NODEID,slime.Policy(enabled=False),
                               user=SimpleNamespace(sub=SUB,role="owner"))
        with self.assertRaises(HTTPException) as disabled:
            poll(authorization=self._auth())
        self.assertEqual(disabled.exception.status_code,403)
        with self.assertRaises(HTTPException):
            await models(authorization="Bearer "+self.secret)

    async def test_runner_validates_output_limit_and_exact_counts(self):
        given={"model":"local-v1:3b",
               "messages":[{"role":"user","content":"Hello"}],
               "max_tokens":48,"temperature":.4}
        def fake(method,url,body=None,**kw):
            self.assertEqual(url,"http://127.0.0.1:11434/api/chat")
            self.assertEqual(body["options"]["num_predict"],48)
            self.assertEqual(body["options"]["num_ctx"],4096)
            return {"message":{"content":"local answer"},"prompt_eval_count":9,"eval_count":3}
        with patch.object(agent,"_http",side_effect=fake):
            result=agent._execute(given)
        self.assertEqual(result["prompt_tokens"],9)
        self.assertEqual(result["completion_tokens"],3)
        with patch.object(agent,"_http",return_value={
            "message":{"content":"out of budget"},"prompt_eval_count":9,"eval_count":49}):
            with self.assertRaises(ValueError):
                agent._execute(given)

    async def test_cross_owner_and_replay_jobs_are_rejected(self):
        self._approve();self._heartbeat()
        register(Registration(models=["local-v1:3b"]),authorization=self._auth())
        with slime._db() as db:
            db.execute("INSERT INTO nodes "
                       "(id,owner,token_digest,label,role,last_seen,share_enabled,owner_enabled,inference_enabled)"
                       "VALUES(?,?,?,?,?,?,1,1,1)",
                       ("feedbeef0011223344556677","other-owner",slime._digest("Z"*40),
                        "other PC","owner",time.time()))
        with self.assertRaises(HTTPException):
            register(Registration(models=["local-v1:3b"]),
                     authorization="Bearer "+"Z"*40)  # not this Owner's approved node
        # Missing/fabricated result IDs cannot be replayed or used to alter charging.
        with self.assertRaises(HTTPException) as invalid:
            complete(Result(job_id="0"*32,ok=True,text="fake",
                            prompt_tokens=1,completion_tokens=1),authorization=self._auth())
        self.assertEqual(invalid.exception.status_code,409)


if __name__=="__main__":
    unittest.main()
