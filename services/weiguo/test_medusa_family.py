"""Actual ASGI authorization tests for Medusa family execution.

No Judge0/privileged containers are launched. Tests verify the *real* HTTP
boundary and mock only the isolated executor (never the identity gateway).
"""
from __future__ import annotations

import asyncio
import json
import os
import unittest
from unittest.mock import patch, AsyncMock

import httpx
import auth
import app as gateway
import medusa_family as family


_OWNER = "123456789012345678901"
_MEMBER = "223456789012345678901"
_VIEWER = "323456789012345678901"


class MedusaFamilyTests(unittest.TestCase):
    def setUp(self):
        values = {
            "WEIGUO_GOOGLE_CLIENT_ID": "medusa-test.apps.googleusercontent.com",
            "WEIGUO_SESSION_SECRET": "medusa-family-session-secret-long-001",
            "WEIGUO_ADMIN_TOKEN": "medusa-operator-secret-completely-different-002",
            "WEIGUO_FAMILY_ACL_JSON": json.dumps({
                _OWNER: {"member": "Owner", "role": "owner"},
                _MEMBER: {"member": "Member", "role": "member"},
                _VIEWER: {"member": "Viewer", "role": "viewer"},
            }),
            "MEDUSA_FAMILY_ENABLED": "false",
            "MEDUSA_FAMILY_OWNER_SUBS": "",
            "MEDUSA_ENABLED": "false",
        }
        env = patch.dict(os.environ, values)
        env.start()
        self.addCleanup(env.stop)
        family._RECENT.clear()

    def request(self, method, path, **kwargs):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),
                                         base_url="http://gateway.test") as client:
                return await client.request(method, path, **kwargs)
        return asyncio.run(run())

    def token_for(self, sub):
        claims = {"sub": sub, "email": "owner@example.test",
                  "email_verified": True, "iss": "https://accounts.google.com"}
        with patch.object(auth.id_token, "verify_oauth2_token", return_value=claims):
            result = self.request("POST", "/v1/auth/google",
                                  json={"credential": "X" * 200})
        self.assertEqual(result.status_code, 200, result.text)
        return {"Authorization": "Bearer " + result.json()["token"]}

    def test_owner_permission_is_server_side_and_off_by_default(self):
        body = {"source_code": "print(42)", "stdin": "", "approved": True}
        path = "/v1/family/medusa/run"
        self.assertEqual(self.request("POST", path, json=body).status_code, 401)
        owner = self.token_for(_OWNER)
        member = self.token_for(_MEMBER)
        viewer = self.token_for(_VIEWER)
        self.assertEqual(self.request("POST", path, json=body, headers=member).status_code, 403)
        self.assertEqual(self.request("POST", path, json=body, headers=viewer).status_code, 403)
        self.assertEqual(self.request("POST", path, json=body, headers=owner).status_code, 403)
        self.assertFalse(self.request("GET", "/v1/family/medusa/status", headers=owner).json()["enabled"])

    def test_allowlisted_owner_still_needs_consent_and_valid_executor(self):
        owner = self.token_for(_OWNER)
        os.environ["MEDUSA_FAMILY_ENABLED"] = "true"
        os.environ["MEDUSA_FAMILY_OWNER_SUBS"] = _OWNER
        path = "/v1/family/medusa/run"
        body = {"source_code": "print(42)", "stdin": "", "approved": True}
        self.assertEqual(self.request("POST", path, json={**body, "approved": False}, headers=owner).status_code, 403)
        # The separately deployed Judge0 does not exist: fail closed.
        self.assertEqual(self.request("POST", path, json=body, headers=owner).status_code, 503)
        self.assertEqual(self.request("POST", path, json={**body, "source_code":"a" * 16001},
                                      headers=owner).status_code, 422)

    def test_real_authenticated_http_route_observes_quota_and_returns_results(self):
        owner = self.token_for(_OWNER)
        os.environ["MEDUSA_FAMILY_ENABLED"] = "true"
        os.environ["MEDUSA_FAMILY_OWNER_SUBS"] = _OWNER
        body = {"source_code":"print(42)", "stdin":"", "approved":True}
        result = {"engine":"medusa", "backend":"judge0", "finished":True,
                  "accepted":True, "status":"Accepted", "status_id":3,
                  "stdout":"42\\n", "stderr":"", "compile_output":""}
        with patch.object(family, "validated_config", return_value=("http://judge0:2358", 71)), patch.object(
            family, "execute_medusa", new_callable=AsyncMock, return_value=result
        ) as execute:
            for _ in range(3):
                res = self.request("POST", "/v1/family/medusa/run", headers=owner, json=body)
                self.assertEqual(res.status_code, 200, res.text)
                self.assertEqual(res.json()["stdout"], "42\\n")
                self.assertEqual(res.headers.get("cache-control"), "no-store, private")
            self.assertEqual(execute.await_count, 3)
            self.assertEqual(self.request("POST", "/v1/family/medusa/run",
                                          headers=owner, json=body).status_code, 429)


if __name__ == "__main__":
    unittest.main()
