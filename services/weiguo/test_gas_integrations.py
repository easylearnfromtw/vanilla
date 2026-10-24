"""Opt-in GAS integration acceptance: never reaches real cloud accounts."""
from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from auth import FamilyIdentity

import gas_relay
import scouts_search
import canva_adapter
import notion_schedule
import ceres_server_model
import ceres_agent_delivery


OWNER = FamilyIdentity("123456789012345678901", "Owner", "owner", "owner@example.test")
SOURCE = "7595cbce-7702-4bda-a514-fd09f48e8411"


class GasIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "VANILLA_GAS_PROXY_PROVIDERS": "gemini,openai,deepseek,telegram,canva,notion,brave,tavily",
            "WEIGUO_CANVA_ENABLED": "true",
            "WEIGUO_NOTION_ENABLED": "true",
            "WEIGUO_NOTION_DATA_SOURCE_ID": SOURCE,
            "WEIGUO_SESSION_SECRET": "session-secret-not-provider-key-test-xxxxxx",
            "CERES_SERVER_MODEL_PROVIDER": "gemini",
            "CERES_SERVER_MODEL_NAME": "gemini-test",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        canva_adapter._recent.clear()
        canva_adapter._jobs.clear()

    def test_explicit_cutover_flag(self):
        self.assertTrue(gas_relay.gas_provider_enabled("gemini"))
        self.assertTrue(gas_relay.gas_provider_enabled("tavily"))
        self.assertFalse(gas_relay.gas_provider_enabled("github"))
        self.assertFalse(gas_relay.gas_provider_enabled("anything"))
        with patch.dict(os.environ, {"VANILLA_GAS_PROXY_PROVIDERS": ""}):
            self.assertFalse(gas_relay.gas_provider_enabled("gemini"))

    async def test_trusted_service_operation_rejects_arbitrary_method(self):
        with patch.object(gas_relay, "_relay", new_callable=AsyncMock) as relay:
            with self.assertRaises(HTTPException) as exc:
                await gas_relay.gas_service_call("telegram", "anything",
                   {"chat_id": "123456789"})
            self.assertEqual(exc.exception.status_code, 400)
            relay.assert_not_awaited()

    async def test_scouts_brave_search_uses_gas_without_env_key(self):
        with patch.object(scouts_search, "gas_service_call", new_callable=AsyncMock,
                          return_value={"ok": True, "results":[{
                              "title": "TW News", "url": "https://mohw.gov.tw/",
                              "description": "Information"}]}) as call:
            hits=await scouts_search.provider_search("Brave", "TW news", "台灣")
        self.assertEqual(hits[0]["provider"], "Brave")
        self.assertEqual(hits[0]["snippet"], "Information")
        self.assertEqual(call.await_args.args[0:2], ("brave", "search"))

    async def test_canva_generator_gas_path_preserves_owner_job_scope(self):
        fake={"job":{"id":"00000000-0000-4000-8000-000000000007","status":"in_progress"}}
        with patch.object(canva_adapter, "gas_service_call", new_callable=AsyncMock,
                          return_value={"ok":True, "data":fake}) as call:
            result=await canva_adapter.generate(canva_adapter.GenerationRequest(
              kind="image",prompt="A minimal architectual poster",
              approved_cloud_send=True), OWNER)
        self.assertEqual(result["status"], "in_progress")
        self.assertEqual(call.await_args.args[0:2], ("canva","image_generate"))
        self.assertNotIn("token",str(result).lower())
        self.assertIn(result["id"],canva_adapter._jobs)

    async def test_notion_task_query_uses_scoped_owner_digest(self):
        with patch.object(notion_schedule, "gas_service_call", new_callable=AsyncMock,
                          return_value={"ok":True,"data":{"results":[],"has_more":False}}) as call:
            value=await notion_schedule.list_tasks(OWNER)
        self.assertEqual(value["tasks"],[])
        self.assertEqual(call.await_args.args[:2],("notion","query_tasks"))
        self.assertEqual(call.await_args.args[2]["owner_tag"],
                         notion_schedule._owner(OWNER.sub))

    async def test_ceres_model_reply_needs_no_local_provider_key(self):
        with patch.object(ceres_server_model, "selected_model", return_value=None), \
             patch.object(ceres_server_model,"provider_enabled",return_value=True), \
             patch.object(ceres_server_model,"gas_service_call",
                          new_callable=AsyncMock,return_value={"ok":True,"text":"OK","usage":{}}) as call:
            cfg=ceres_server_model.model_settings()
            self.assertIsNotNone(cfg)
            self.assertEqual(cfg.provider,"gas")
            self.assertEqual(cfg.remote_provider,"gemini")
            answer=await ceres_server_model.generate_reply(cfg,"Hello")
        self.assertEqual(answer,"OK")
        self.assertEqual(call.await_args.args[0:2],("gemini","chat"))

    async def test_telegram_delivery_proxies_only_preapproved_recipient(self):
        with patch.object(ceres_agent_delivery,"gas_service_call",new_callable=AsyncMock,
                          return_value={"ok":True,"accepted":True}) as call:
            ok=await ceres_agent_delivery.deliver(123456789,"Hello","")
        self.assertTrue(ok)
        self.assertEqual(call.await_args.args[:2],("telegram","send_message"))
        self.assertEqual(call.await_args.args[2]["chat_id"],123456789)

    async def test_telegram_rejects_gas_delivery_failure_without_retry(self):
        with patch.object(ceres_agent_delivery,"gas_service_call",new_callable=AsyncMock,
                          side_effect=HTTPException(503,"proxy unavailable")) as call:
            ok=await ceres_agent_delivery.deliver(123456789,"Hello","")
        self.assertFalse(ok)
        self.assertEqual(call.await_count,1)


if __name__=="__main__":
    unittest.main()
