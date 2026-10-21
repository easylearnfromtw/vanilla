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
                           balance, GoogleCredential, _google, _owner_chat)
from vanilla_public_api import (_reserve, _finish, _key_from_header)


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
        from slime_rewards import _google as verify
        with patch("slime_rewards._google",side_effect=None):
            with patch("slime_rewards.id_token.verify_oauth2_token",
                       return_value={"sub":GOOGLE,"email_verified":False,"iss":"accounts.google.com"}):
                with self.assertRaises(HTTPException):
                    verify("x"*120)

    def test_feature_flag_fails_closed(self):
        with patch.dict(os.environ,{"SLIME_REWARDS_ENABLED":"false"}):
            with self.assertRaises(HTTPException):
                self.ticket()


if __name__=="__main__":
    unittest.main()
