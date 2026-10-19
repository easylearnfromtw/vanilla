"""HTTP acceptance tests for the production family-gateway route boundaries.

Google network calls and browser execution are mocked, but FastAPI middleware,
headers, authorization dependencies and SQL task ownership are exercised.
"""
from __future__ import annotations

import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
import auth
import app as gateway


SUB_A = "123456789012345678901"
SUB_B = "223456789012345678901"
SUB_VIEW = "323456789012345678901"


class FamilyGatewayEndpointTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        settings = {
            "WEIGUO_TASK_DB": str(Path(temp.name) / "tasks.sqlite3"),
            "WEIGUO_GOOGLE_CLIENT_ID": "test-client.apps.googleusercontent.com",
            "WEIGUO_SESSION_SECRET": "independent-long-family-secret-private-00001",
            "WEIGUO_ADMIN_TOKEN": "separate-operator-token-that-is-secret-00002",
            "WEIGUO_FAMILY_ACL_JSON": json.dumps({
                SUB_A: {"member": "A", "role": "owner"},
                SUB_B: {"member": "B", "role": "member"},
                SUB_VIEW: {"member": "View", "role": "viewer"},
            }),
            "WEIGUO_ALLOWED_HOSTS": "example.org",
        }
        env = patch.dict(os.environ, settings)
        env.start()
        self.addCleanup(env.stop)
        # No external DNS, browser launches or Google credentials in unit tests.
        validate = patch.object(gateway, "validate_url", side_effect=lambda url, *_args, **_kwargs: url)
        validate.start()
        self.addCleanup(validate.stop)
        browser = patch.object(gateway, "run_background_job", new_callable=AsyncMock)
        browser.start()
        self.addCleanup(browser.stop)
        class HTTPClient:
            """Test real ASGI routes without Starlette's optional httpx2 dependency."""
            @staticmethod
            def request(method, path, **kwargs):
                async def invoke():
                    async with httpx.AsyncClient(
                        transport=httpx.ASGITransport(app=gateway.app),
                        base_url="http://weiguo.test"
                    ) as client:
                        return await client.request(method, path, **kwargs)
                return asyncio.run(invoke())

            def get(self, path, **kwargs):
                return self.request("GET", path, **kwargs)

            def post(self, path, **kwargs):
                return self.request("POST", path, **kwargs)

        self.client = HTTPClient()
        self.job = {"start_url": "https://example.org/", "steps": [{"action": "extract"}]}

    def token_for(self, subject: str) -> dict[str, str]:
        claims = {"sub": subject, "email": "member@example.org",
                  "email_verified": True, "iss": "https://accounts.google.com"}
        with patch.object(auth.id_token, "verify_oauth2_token", return_value=claims):
            reply = self.client.post("/v1/auth/google", json={"credential": "X" * 200})
        self.assertEqual(reply.status_code, 200, reply.text)
        self.assertEqual(reply.json()["expiresIn"], 900)
        return {"Authorization": "Bearer " + reply.json()["token"]}

    def test_authentication_and_task_owner_boundaries(self):
        self.assertEqual(self.client.post("/v1/family/tasks", json=self.job).status_code, 401)
        alice = self.token_for(SUB_A)
        bob = self.token_for(SUB_B)
        submission = self.client.post("/v1/family/tasks", json=self.job, headers=alice)
        self.assertEqual(submission.status_code, 202, submission.text)
        task_id = submission.json()["id"]
        self.assertEqual(self.client.get("/v1/family/tasks/" + task_id, headers=alice).status_code, 200)
        self.assertEqual(self.client.get("/v1/family/tasks/" + task_id, headers=bob).status_code, 404)
        self.assertEqual(self.client.get("/v1/family/tasks/" + task_id).status_code, 401)
        # Family token is never accepted by the privileged operator endpoint.
        self.assertEqual(self.client.post("/v1/execute", json=self.job, headers=alice).status_code, 401)

    def test_viewer_can_check_identity_but_cannot_launch_browser(self):
        viewer = self.token_for(SUB_VIEW)
        self.assertEqual(self.client.get("/v1/auth/me", headers=viewer).json()["role"], "viewer")
        self.assertEqual(self.client.post("/v1/family/tasks", json=self.job, headers=viewer).status_code, 403)

    def test_mutations_and_arbitrary_commands_denied(self):
        alice = self.token_for(SUB_A)
        for step in ({"action": "click", "selector": "#checkout"},
                     {"action": "fill", "selector": "input", "text": "user"},
                     {"action": "eval", "code": "alert(1)"}):
            payload = {"start_url": self.job["start_url"], "steps": [step]}
            with self.subTest(step=step):
                self.assertEqual(self.client.post("/v1/family/tasks", json=payload, headers=alice).status_code, 400)

    def test_fresh_server_acl_revokes_existing_family_token(self):
        alice = self.token_for(SUB_A)
        first = self.client.post("/v1/family/tasks", json=self.job, headers=alice)
        self.assertEqual(first.status_code, 202, first.text)
        task_id = first.json()["id"]
        os.environ["WEIGUO_FAMILY_ACL_JSON"] = json.dumps({
            SUB_B: {"member": "B", "role": "member"},
        })
        self.assertEqual(self.client.get("/v1/family/tasks/" + task_id, headers=alice).status_code, 403)

    def test_independent_per_member_rate_limit(self):
        alice = self.token_for(SUB_A)
        for _ in range(6):
            response = self.client.post("/v1/family/tasks", json=self.job, headers=alice)
            self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(self.client.post("/v1/family/tasks", json=self.job, headers=alice).status_code, 429)
        bob = self.token_for(SUB_B)
        self.assertEqual(self.client.post("/v1/family/tasks", json=self.job, headers=bob).status_code, 202)

    def test_cors_source_validation(self):
        with patch.dict(os.environ, {"WEIGUO_CORS_ORIGINS": "https://easylearnfromtw.github.io"}):
            self.assertEqual(gateway.allowed_origins(), ["https://easylearnfromtw.github.io"])
        for origin in ("*", "http://easylearnfromtw.github.io",
                       "https://easylearnfromtw.github.io/vanilla",
                       "https://easylearnfromtw.github.io.evil.example"):
            with self.subTest(origin=origin), patch.dict(os.environ, {"WEIGUO_CORS_ORIGINS": origin}):
                with self.assertRaises(RuntimeError):
                    gateway.allowed_origins()


if __name__ == "__main__":
    unittest.main()
