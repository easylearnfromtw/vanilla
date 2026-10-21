"""Google Slime onboarding rewards — offline atomic-accounting regression tests."""
from __future__ import annotations

import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from fastapi import HTTPException

import slime
from slime_rewards import (reward_ticket, claim, Claim, config, set_config,
                           balance, GoogleCredential, _google, _owner_chat, rotate_key)
from vanilla_public_api import (_reserve, _finish, _key_from_header, _session)


OWNER="123456789012345678901"
GOOGLE="887766554433221100"
CHAT=88334455
NODE="a"*24
NODE_TOKEN="T"*48


class SlimeRewardWalletTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        env=patch.dict(os.environ,{
            "CERES_DB_PATH":tmp.name+"/ceres.sqlite",
            "SLIME_DB_PATH":tmp.name+"/slime.sqlite",
            "SLIME_ENABLED":"true",
            "SLIME_REWARDS_ENABLED":"true",
            "VANILLA_PUBLIC_API_ENABLED":"true",
            "SLIME_PUBLIC_API_ORIGIN":"https://api.example.org",
            "WEIGUO_GOOGLE_CLIENT_ID":"1234-demo.apps.googleusercontent.com",
            "CERES_FAMILY_LINKS_JSON":'{"88334455":"'+OWNER+'"}',
            "WEIGUO_FAMILY_ACL_JSON":'{"'+OWNER+'":{"role":"owner"}}',
        })
        env.start();self.addCleanup(env.stop)
        with slime._db() as db:
            db.execute("INSERT INTO nodes(id,owner,token_digest,label,role,last_seen) VALUES(?,?,?,?,?,?)",
                       (NODE,OWNER,slime._digest(NODE_TOKEN),"Friend PC","friend",time.time()))
        identity=patch("slime_rewards._google",return_value=GOOGLE)
        identity.start();self.addCleanup(identity.stop)

    def ticket(self,node_token=NODE_TOKEN):
        result=reward_ticket(authorization="Bearer "+node_token)
        self.assertIn("#ticket=",result["url"])
        return result["url"].split("#ticket=",1)[1]

    def claim_reward(self,code):
        return claim(Claim(credential="x"*120,ticket=code))

    def test_default_reward_is_100k_claim_once_without_bearer_leak(self):
        self.assertEqual(config(OWNER)["amount"],100000)
        code=self.ticket()
        with self.assertRaises(HTTPException) as repeated:
            self.ticket()
        self.assertEqual(repeated.exception.status_code,429)
        output=self.claim_reward(code)
        self.assertEqual(output["rewardTokens"],100000)
        self.assertEqual(output["balance"],100000)
        self.assertTrue(output["apiKey"].startswith("vnl_"))
        self.assertNotIn(NODE_TOKEN,repr(output))
        self.assertNotIn(code,repr(output))
        with self.assertRaises(HTTPException):
            self.claim_reward(code)
        with self.assertRaises(HTTPException):
            self.ticket()
        with open(os.environ["CERES_DB_PATH"],"rb") as f:
            raw=f.read()
        self.assertNotIn(output["apiKey"].encode(),raw)
        self.assertNotIn(code.encode(),raw)

    def test_wallet_reserves_refunds_and_settles_provider_exact_usage_once(self):
        result=self.claim_reward(self.ticket())
        key=_key_from_header("Bearer "+result["apiKey"])
        job=_reserve(key,"fake-model",600)
        w=balance(GoogleCredential(credential="x"*120))
        self.assertEqual(w["balance"],99400)
        with self.assertRaises(HTTPException) as insufficient:
            _reserve(key,"fake-model",100000)
        self.assertEqual(insufficient.exception.status_code,429)
        _finish(key["id"],job,600,status="success",
                usage={"prompt_tokens":12,"completion_tokens":4})
        w=balance(GoogleCredential(credential="x"*120))
        self.assertEqual(w["balance"],99984)
        self.assertEqual(w["spent"],16)
        self.assertEqual(w["earned"],100000)
        _finish(key["id"],job,600,status="success",
                usage={"prompt_tokens":12,"completion_tokens":4})
        self.assertEqual(balance(GoogleCredential(credential="x"*120))["balance"],99984)
        self.assertEqual([x["kind"] for x in w["transactions"]].count("api_refund"),1)

    def test_conservative_reservation_is_labeled_estimate(self):
        result=self.claim_reward(self.ticket())
        key=_key_from_header("Bearer "+result["apiKey"])
        job=_reserve(key,"fake-model",800)
        _finish(key["id"],job,800,status="success",usage=None)
        wallet=balance(GoogleCredential(credential="x"*120))
        self.assertEqual(wallet["balance"],99200)
        self.assertEqual(wallet["usage"]["estimatedTokens"],800)
        self.assertEqual(wallet["usage"]["exactTokens"],0)

    def test_rotating_key_does_not_forfeit_old_inflight_refunds(self):
        result=self.claim_reward(self.ticket())
        old=_key_from_header("Bearer "+result["apiKey"])
        job=_reserve(old,"fake-model",900)
        replacement=rotate_key(GoogleCredential(credential="x"*120))
        with self.assertRaises(HTTPException):
            _key_from_header("Bearer "+result["apiKey"])
        self.assertTrue(_key_from_header("Bearer "+replacement["apiKey"]))
        _finish(old["id"],job,900,status="success",
                usage={"prompt_tokens":20,"completion_tokens":10})
        wallet=balance(GoogleCredential(credential="x"*120))
        self.assertEqual(wallet["balance"],99970)
        self.assertEqual(wallet["usage"]["exactTokens"],30)

    def test_crashed_job_recovers_all_reserved_tokens_once(self):
        reward=self.claim_reward(self.ticket())
        key=_key_from_header("Bearer "+reward["apiKey"])
        job=_reserve(key,"model-offline",2500)
        self.assertEqual(balance(GoogleCredential(credential="x"*120))["balance"],97500)
        with _session() as db:
            db.execute("UPDATE vanilla_api_usage SET created_at=? WHERE id=?",
                       (int(time.time())-1000,job))
        restored=balance(GoogleCredential(credential="x"*120))
        self.assertEqual(restored["balance"],100000)
        self.assertEqual(restored["spent"],0)
        with _session() as db:
            row=db.execute("SELECT status,charged_tokens FROM vanilla_api_usage WHERE id=?",
                           (job,)).fetchone()
            self.assertEqual((row["status"],row["charged_tokens"]),("failed",0))
            self.assertEqual(db.execute("SELECT COUNT(*) FROM slime_reward_ledger WHERE id=?",
                                        (job+":abandoned",)).fetchone()[0],1)
        # A late response, a duplicate status lookup, or new request must
        # never refund the same reservation for a second time.
        _finish(key["id"],job,2500,status="success",
                usage={"prompt_tokens":1,"completion_tokens":1})
        self.assertEqual(balance(GoogleCredential(credential="x"*120))["balance"],100000)
        followup=_reserve(key,"model-offline",100000)
        self.assertTrue(followup)
        _finish(key["id"],followup,100000,status="failed")
        self.assertEqual(balance(GoogleCredential(credential="x"*120))["balance"],100000)

    def test_crashed_job_recovers_before_new_quota_reservation(self):
        reward=self.claim_reward(self.ticket())
        key=_key_from_header("Bearer "+reward["apiKey"])
        job=_reserve(key,"model-offline",100000)
        with _session() as db:
            db.execute("UPDATE vanilla_api_usage SET created_at=? WHERE id=?",
                       (int(time.time())-1000,job))
        # The wallet has zero spendable credits until the next request
        # reconciles the old reservation under the write lock.
        next_job=_reserve(key,"model-offline",200)
        self.assertTrue(next_job)
        self.assertEqual(balance(GoogleCredential(credential="x"*120))["balance"],99800)
        _finish(key["id"],next_job,200,status="failed")
        self.assertEqual(balance(GoogleCredential(credential="x"*120))["balance"],100000)

    def test_failed_generation_refunds_reward_wallet_fully(self):
        result=self.claim_reward(self.ticket())
        key=_key_from_header("Bearer "+result["apiKey"])
        job=_reserve(key,"fake-model",700)
        _finish(key["id"],job,700,status="failed")
        w=balance(GoogleCredential(credential="x"*120))
        self.assertEqual(w["balance"],100000)
        self.assertEqual(w["spent"],0)

    def test_admin_config_changes_future_claim_only(self):
        self.assertEqual(set_config(OWNER,75000,True)["amount"],75000)
        r=self.claim_reward(self.ticket())
        self.assertEqual(r["rewardTokens"],75000)
        self.assertEqual(config(OWNER)["amount"],75000)
        set_config(OWNER,0,False)
        self.assertEqual(balance(GoogleCredential(credential="x"*120))["balance"],75000)

    def test_other_google_account_cannot_redeem_same_node(self):
        self.claim_reward(self.ticket())
        with slime._db() as db:
            db.execute("INSERT INTO nodes(id,owner,token_digest,label,role,last_seen) VALUES(?,?,?,?,?,?)",
                       ("b"*24,OWNER,slime._digest("Z"*48),"Second PC","friend",time.time()))
        new=self.ticket(node_token="Z"*48)
        with self.assertRaises(HTTPException) as duplicate:
            self.claim_reward(new)
        self.assertEqual(duplicate.exception.status_code,409)

    def test_ticket_invalid_after_device_revocation(self):
        token=self.ticket()
        with slime._db() as db:
            db.execute("DELETE FROM nodes WHERE id=?",(NODE,))
        with self.assertRaises(HTTPException):
            self.claim_reward(token)

    def test_invalid_google_claim_is_not_accepted(self):
        # The function imported at module import time is the original,
        # unlike the patched slime_rewards._google used by the claim fixture.
        with patch("slime_rewards.id_token.verify_oauth2_token",
                   return_value={"sub":GOOGLE,"email_verified":False,"iss":"accounts.google.com"}):
            with self.assertRaises(HTTPException):
                _google("x"*120)

    def test_feature_flag_fails_closed(self):
        with patch.dict(os.environ,{"SLIME_REWARDS_ENABLED":"false"}):
            with self.assertRaises(HTTPException):
                self.ticket()


if __name__=="__main__":
    unittest.main()
