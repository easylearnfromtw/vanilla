"""Gecko Fleet security/scale admission tests — offline, no live cloud required."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from slime import _db, _digest
from gecko_fleet import (
    Enrollment,create_pool,enroll,revoke_pool,set_rollout,snapshot,desired,_tables
)

OWNER="101010101010101010101"
OTHER="202020202020202020202"


class GeckoFleetTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        env=patch.dict(os.environ,{
            "SLIME_ENABLED":"true","GECKO_FLEET_ENABLED":"true",
            "SLIME_DB_PATH":str(Path(temp.name)/"fleet.sqlite"),
        })
        env.start();self.addCleanup(env.stop)

    def issue(self,capacity=2):
        return create_pool(OWNER,"GPU Rack A",capacity,3600)

    def register(self,token,name):
        return enroll(Enrollment(token=token,label=name,device_consent=True))

    def test_owner_batch_one_time_token_not_exposed_by_snapshots(self):
        pool=self.issue()
        self.assertTrue(pool["enrollmentToken"].startswith("gck_"))
        with _db() as db:
            saved=db.execute("SELECT token_digest FROM gecko_fleet_pools WHERE id=?",
                             (pool["poolId"],)).fetchone()[0]
            self.assertEqual(saved,_digest(pool["enrollmentToken"]))
            self.assertNotEqual(saved,pool["enrollmentToken"])
        dashboard=snapshot(OWNER)
        self.assertEqual(dashboard["totalNodes"],0)
        self.assertNotIn(pool["enrollmentToken"],str(dashboard))
        self.assertEqual(snapshot(OTHER)["pools"],[])

    def test_bulk_admission_with_explicit_host_consent_and_max_quota(self):
        pool=self.issue(capacity=2)
        with self.assertRaises(HTTPException):
            enroll(Enrollment(token=pool["enrollmentToken"],label="No consent",device_consent=False))
        a=self.register(pool["enrollmentToken"],"GPU-01")
        b=self.register(pool["enrollmentToken"],"GPU-02")
        self.assertNotEqual(a["node_id"],b["node_id"])
        self.assertFalse(a["inference_enabled"])
        self.assertEqual(a["role"],"friend")
        with self.assertRaises(HTTPException) as full:
            self.register(pool["enrollmentToken"],"GPU-03")
        self.assertEqual(full.exception.status_code,403)
        with _db() as db:
            rows=db.execute("SELECT role,inference_enabled,shutdown_opt_in,geo_opt_in FROM nodes").fetchall()
            self.assertEqual(len(rows),2)
            self.assertTrue(all(r["role"]=="friend" and not r["inference_enabled"]
                                and not r["shutdown_opt_in"] and not r["geo_opt_in"]
                                for r in rows))
        snap=snapshot(OWNER)
        self.assertEqual(snap["totalNodes"],2)
        self.assertEqual(snap["pools"][0]["accepted"],2)

    def test_fleet_member_identity_and_staged_rollout_are_bound_to_bearer(self):
        pool=self.issue()
        first=self.register(pool["enrollmentToken"],"Host A")
        set_rollout(OWNER,pool["poolId"],"slime-v20261021-reviewed",100)
        result=desired(authorization="Bearer "+first["token"])
        self.assertTrue(result["inCanary"])
        self.assertEqual(result["desiredVersion"],"slime-v20261021-reviewed")
        self.assertFalse(result["autoInstall"])
        self.assertFalse(result["commandExecution"])
        set_rollout(OWNER,pool["poolId"],"slime-v20261021-reviewed",0)
        result=desired(authorization="Bearer "+first["token"])
        self.assertFalse(result["inCanary"])
        with self.assertRaises(HTTPException):
            desired(authorization="Bearer "+("x"*48))

    def test_owner_pool_revoke_stops_new_hosts_but_keeps_existing_access(self):
        pool=self.issue()
        a=self.register(pool["enrollmentToken"],"Host A")
        self.assertTrue(revoke_pool(OWNER,pool["poolId"])["revoked"])
        with self.assertRaises(HTTPException) as denied:
            self.register(pool["enrollmentToken"],"Host B")
        self.assertEqual(denied.exception.status_code,403)
        result=desired(authorization="Bearer "+a["token"])
        self.assertFalse(result["inCanary"])
        self.assertEqual(snapshot(OWNER)["totalNodes"],1)

    def test_expiry_quota_and_cross_owner_controls(self):
        pool=self.issue()
        with _db() as db:
            db.execute("UPDATE gecko_fleet_pools SET expires_at=0 WHERE id=?",
                       (pool["poolId"],))
        with self.assertRaises(HTTPException):
            self.register(pool["enrollmentToken"],"Expired Host")
        with self.assertRaises(HTTPException) as denied:
            revoke_pool(OTHER,pool["poolId"])
        self.assertEqual(denied.exception.status_code,404)
        with self.assertRaises(HTTPException):
            set_rollout(OWNER,pool["poolId"],"http://not-an-approved-tag",25)
        with patch.dict(os.environ,{"GECKO_FLEET_ENABLED":"false"}):
            with self.assertRaises(HTTPException) as disabled:
                self.issue()
            self.assertEqual(disabled.exception.status_code,503)


if __name__=="__main__":
    unittest.main()
