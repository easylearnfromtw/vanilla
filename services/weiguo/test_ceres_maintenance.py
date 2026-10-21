"""Ceres Owner maintenance: authorization, persistence, no-spend tasks and runtime packaging."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, AsyncMock

from ceres_maintenance import (setting,request_change,approve,audit_log,workflow_plan,
                               run_workflow,jobs,budget_state,model_call_allowed,
                               overview,version,watch_tick,_tables)
from ceres_gateway import _session
from ceres_command_center import command, callback, _menu, _ops_menu

CHAT=888123456
OTHER=888123457
SUB="123456789012345678901"


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        env=patch.dict(os.environ,{
            "CERES_DB_PATH":temp.name+"/test.sqlite3",
            "CERES_TELEGRAM_CHAT_IDS":str(CHAT),
            "CERES_FAMILY_LINKS_JSON":json.dumps({str(CHAT):SUB}),
            "WEIGUO_FAMILY_ACL_JSON":json.dumps({SUB:{"role":"owner","member":"Tester"}}),
            "CERES_MAINTENANCE_ENABLED":"false",
        })
        env.start()
        self.addCleanup(env.stop)

    def test_owner_previews_and_confirmations_are_short_lived_single_use(self):
        self.assertEqual(setting(CHAT,"notifications"),"off")
        token=request_change(CHAT,"notifications","on")
        self.assertEqual(setting(CHAT,"notifications"),"off")
        with self.assertRaises(PermissionError):
            approve(OTHER,token)
        self.assertEqual(approve(CHAT,token),"主動異常通知已更新：on")
        self.assertEqual(setting(CHAT,"notifications"),"on")
        with self.assertRaises(ValueError):
            approve(CHAT,token)
        self.assertEqual(audit_log(CHAT)[-1]["action"],"approve_notifications")

    def test_budget_validation_and_unknown_price_never_claims_full_control(self):
        for value in ("-1","999999","abc","NaN"):
            with self.subTest(value=value),self.assertRaises(ValueError):
                request_change(CHAT,"budget",value)
        token=request_change(CHAT,"budget","5.50")
        approve(CHAT,token)
        with patch("ceres_maintenance._known_usage",return_value=(6.20,2,1)):
            result=budget_state(CHAT)
            self.assertFalse(result["hardStopEligible"])
            self.assertTrue(model_call_allowed(CHAT))
        with patch("ceres_maintenance._known_usage",return_value=(6.20,0,1)):
            result=budget_state(CHAT)
            self.assertTrue(result["hardStopEligible"])
            self.assertTrue(result["overLimit"])
            self.assertFalse(model_call_allowed(CHAT))
        self.assertTrue(model_call_allowed(OTHER))

    def test_diana_plan_only_has_fixed_readonly_tools(self):
        plan=workflow_plan(CHAT,"巡檢")
        self.assertEqual([v["tool"] for v in plan["steps"]],["health","models","nodes"])
        self.assertTrue(all(v["mode"]=="read_only" for v in plan["steps"]))
        with self.assertRaises(ValueError):
            workflow_plan(CHAT,"刪除所有資料")
        with self.assertRaises(PermissionError):
            workflow_plan(OTHER,"巡檢")

    def test_jobs_are_owner_scoped_and_no_remote_operations(self):
        fake={"issues":[],"agentReady":True,"modelProbeSuccess":2,
              "telegram":{"lastVerifiedReplyAt":None}}
        with patch("ceres_maintenance.overview",return_value=fake),\
             patch("ceres_model_ops.diagnostics",return_value={"modelChecks":[]}),\
             patch("ceres_maintenance.node_snapshot",return_value="0 台節點"):
            result=run_workflow(CHAT,"巡檢")
        self.assertEqual(result["steps"],3)
        self.assertEqual(result["state"],"completed")
        self.assertEqual(jobs(CHAT)[0]["id"],result["id"])
        with self.assertRaises(PermissionError):
            jobs(OTHER)

    def test_version_does_not_invent_live_deployment_or_rollback(self):
        with patch.dict(os.environ,{"RAILWAY_GIT_COMMIT_SHA":"","RAILWAY_DEPLOYMENT_ID":""}):
            r=version(CHAT)
        self.assertEqual(r["commit"],"unknown")
        self.assertFalse(r["rollbackSupported"])

    def test_monitor_baseline_deduplicates_incidents(self):
        state={"issues":["agent_not_ready"],"agentReady":False}
        with patch("ceres_maintenance.overview",return_value=state),\
             patch("ceres_maintenance.budget_state",return_value={"overLimit":False}):
            first=asyncio.run(watch_tick(CHAT))
            second=asyncio.run(watch_tick(CHAT))
        self.assertEqual(first,[])
        self.assertEqual(second,[])
        with _session() as db:
            _tables(db)
            rows=db.execute("SELECT COUNT(*) FROM ceres_maint_events").fetchone()[0]
        self.assertEqual(rows,1)

    def test_native_telegram_cards_are_owner_only_and_confirm_callback(self):
        with patch("ceres_maintenance.overview",return_value={
                 "issues":[],"agentReady":True,"modelProbeSuccess":2,
                 "telegram":{"lastVerifiedReplyAt":None}
             }),patch("ceres_command_center.say",new_callable=AsyncMock) as send:
            asyncio.run(command(CHAT,"/hub health"))
            self.assertIn("系統巡檢",send.await_args.args[1])
            send.reset_mock()
            asyncio.run(command(OTHER,"/hub health"))
            send.assert_not_awaited()
        menu={x["callback_data"] for row in _ops_menu() for x in row}
        self.assertIn("hub:operations",{x["callback_data"] for row in _menu() for x in row})
        self.assertIn("hub:health",menu)
        self.assertIn("hub:jobs",menu)
        self.assertIn("hub:approvals",menu)

    def test_packaged_into_both_railway_dockerfiles(self):
        root=Path(__file__).parent
        for name in ("Dockerfile","Dockerfile.pdfcraft"):
            with self.subTest(name=name):
                content=(root/name).read_text()
                self.assertTrue(any(
                    line.startswith("COPY ") and line.endswith(" ./") and
                    "ceres_maintenance.py" in line.split()
                    for line in content.splitlines()),
                    "Ceres maintenance must be included in the Docker module list")
                self.assertIn("import ceres_command_center, ceres_model_ops, ceres_model_ops_routes, ceres_maintenance",content)


if __name__=="__main__":
    unittest.main()
