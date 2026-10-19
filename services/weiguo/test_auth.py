"""No-network tests for Google OIDC family auth and task isolation."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

# Define CORS before app is constructed. Browser origins must not be wildcards.
os.environ.setdefault("WEIGUO_CORS_ORIGINS", "https://easylearnfromtw.github.io")
from fastapi import HTTPException
from fastapi.testclient import TestClient
import auth
import app as service
import tasks


ALICE = "123456789012345678901"
BOB = "223456789012345678901"
VIEWER = "323456789012345678901"
CLIENT_ID = "public-web-client-id.apps.googleusercontent.com"
SECRETS = {
    "WEIGUO_SESSION_SECRET": "independent-secret-that-remains-private-2345",
    "WEIGUO_ADMIN_TOKEN": "different-operator-token-with-32-chars",
    "WEIGUO_GOOGLE_CLIENT_ID": CLIENT_ID,
    "WEIGUO_FAMILY_ACL_JSON": json.dumps({
        ALICE: {"member": "Alice", "role": "owner"},
        BOB: {"member": "Bob", "role": "member"},
        VIEWER: {"member": "Visitor", "role": "viewer"},
    }),
    "WEIGUO_ALLOWED_HOSTS": "example.org",
}


def verified_claims(sub=ALICE, email="alice@example.org", **overrides):
    data = {"sub": sub, "email": email, "email_verified": True,
            "iss": "https://accounts.google.com"}
    data.update(overrides)
    return data


class GoogleFamilyAuthTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, SECRETS)
        self.env.start()
        self.addCleanup(self.env.stop)

    def issue(self, sub=ALICE, email="alice@example.org"):
        with patch.object(auth.id_token, "verify_oauth2_token", return_value=verified_claims(sub, email)) as verify:
            value, user = auth.google_login("X" * 200)
            self.assertEqual(verify.call_args.kwargs["audience"], CLIENT_ID)
            return value, user

    def test_authenticated_google_sub_maps_server_side_role(self):
        token, user = self.issue()
        self.assertEqual(user.member, "Alice")
        self.assertEqual(user.role, "owner")
        self.assertEqual(auth.verify_family_token(token).sub, ALICE)
        self.assertNotIn("independent-secret", token)

    def test_no_email_or_client_role_escalation(self):
        token, user = self.issue(BOB, "alice@example.org")
        self.assertEqual(user.member, "Bob")
        self.assertEqual(user.role, "member")
        self.assertEqual(auth.verify_family_token(token).role, "member")

    def test_google_invalid_claims_are_rejected(self):
        for changes in [
            {"email_verified": False},
            {"iss": "https://fake.google.com"},
            {"sub": "name-not-sub"},
            {"email": ""},
        ]:
            with self.subTest(changes=changes), patch.object(
                auth.id_token, "verify_oauth2_token",
                return_value=verified_claims(**changes)
            ), self.assertRaises(HTTPException):
                auth.google_login("X" * 200)
        with patch.object(auth.id_token, "verify_oauth2_token", side_effect=ValueError("wrong audience")), self.assertRaises(HTTPException) as caught:
            auth.google_login("X" * 200)
        self.assertEqual(caught.exception.status_code, 401)

    def test_unknown_sub_is_denied_even_with_known_email(self):
        with patch.object(auth.id_token, "verify_oauth2_token",
                          return_value=verified_claims("999999999999999999999", "alice@example.org")):
            with self.assertRaises(HTTPException) as caught:
                auth.google_login("X" * 200)
        self.assertEqual(caught.exception.status_code, 403)

    def test_tampered_and_expired_session_are_denied(self):
        token, _ = self.issue()
        with self.assertRaises(HTTPException) as tampered:
            auth.verify_family_token(token[:-3] + "123")
        self.assertEqual(tampered.exception.status_code, 401)
        with patch.object(auth.time, "time", return_value=auth.time.time() + auth.SESSION_SECONDS + 1):
            with self.assertRaises(HTTPException) as expired:
                auth.verify_family_token(token)
        self.assertEqual(expired.exception.status_code, 401)

    def test_revocation_applies_to_existing_session(self):
        token, _ = self.issue()
        self.assertEqual(auth.verify_family_token(token).member, "Alice")
        os.environ["WEIGUO_FAMILY_ACL_JSON"] = json.dumps({BOB: {"member": "Bob", "role": "member"}})
        with self.assertRaises(HTTPException) as caught:
            auth.verify_family_token(token)
        self.assertEqual(caught.exception.status_code, 403)

    def test_missing_independent_secret_fails_closed(self):
        os.environ["WEIGUO_SESSION_SECRET"] = os.environ["WEIGUO_ADMIN_TOKEN"]
        with self.assertRaises(HTTPException) as caught:
            self.issue()
        self.assertEqual(caught.exception.status_code, 503)

    def test_reader_roles_are_server_enforced(self):
        token, identity = self.issue(VIEWER, "visitor@example.org")
        self.assertEqual(identity.role, "viewer")
        self.assertEqual(auth.verify_family_token(token).role, "viewer")


class FamilyTaskApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        config = {**SECRETS, "WEIGUO_TASK_DB": str(Path(self.temp.name) / "audit.sqlite3")}
        self.env = patch.dict(os.environ, config)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.validator = patch.object(service, "validate_url", side_effect=lambda url, *args, **kwargs: url)
        self.validator.start()
        self.addCleanup(self.validator.stop)
        self.browser = patch.object(service, "run_background_job", new_callable=AsyncMock)
        self.browser.start()
        self.addCleanup(self.browser.stop)
        self.client = TestClient(service.app)
        self.addCleanup(self.client.close)

    def headers_for(self, sub, email="person@example.org"):
        with patch.object(auth.id_token, "verify_oauth2_token",
                          return_value=verified_claims(sub, email)):
            reply = self.client.post("/v1/auth/google", json={"credential": "X" * 200})
            self.assertEqual(reply.status_code, 200, reply.text)
        return {"Authorization": "Bearer " + reply.json()["token"]}

    def test_no_anonymous_submission_and_isolated_results(self):
        payload = {"start_url": "https://example.org/", "steps": [{"action": "extract"}]}
        self.assertEqual(self.client.post("/v1/family/tasks", json=payload).status_code, 401)
        alice = self.headers_for(ALICE)
        bob = self.headers_for(BOB)
        result = self.client.post("/v1/family/tasks", json=payload, headers=alice)
        self.assertEqual(result.status_code, 202, result.text)
        task_id = result.json()["id"]
        self.assertEqual(self.client.get("/v1/family/tasks/" + task_id, headers=alice).status_code, 200)
        self.assertEqual(self.client.get("/v1/family/tasks/" + task_id, headers=bob).status_code, 404)
        self.assertEqual(self.client.get("/v1/family/tasks/" + task_id).status_code, 401)

    def test_viewer_and_mutations_are_denied(self):
        viewer = self.headers_for(VIEWER)
        alice = self.headers_for(ALICE)
        payload = {"start_url": "https://example.org/", "steps": [{"action": "extract"}]}
        self.assertEqual(self.client.post("/v1/family/tasks", json=payload, headers=viewer).status_code, 403)
        payload["steps"] = [{"action": "click", "selector": "#checkout"}]
        self.assertEqual(self.client.post("/v1/family/tasks", json=payload, headers=alice).status_code, 400)
        payload["steps"] = [{"action": "fill", "selector": "input", "text": "hello"}]
        self.assertEqual(self.client.post("/v1/family/tasks", json=payload, headers=alice).status_code, 400)

    def test_per_subject_rate_limit(self):
        headers = self.headers_for(ALICE)
        payload = {"start_url": "https://example.org/", "steps": [{"action": "extract"}]}
        for _ in range(6):
            response = self.client.post("/v1/family/tasks", json=payload, headers=headers)
            self.assertEqual(response.status_code, 202, response.text)
        response = self.client.post("/v1/family/tasks", json=payload, headers=headers)
        self.assertEqual(response.status_code, 429)
        bob = self.headers_for(BOB)
        self.assertEqual(self.client.post("/v1/family/tasks", json=payload, headers=bob).status_code, 202)

    def test_revocation_blocks_task_lookup(self):
        alice = self.headers_for(ALICE)
        payload = {"start_url": "https://example.org/", "steps": [{"action": "extract"}]}
        task_id = self.client.post("/v1/family/tasks", json=payload, headers=alice).json()["id"]
        os.environ["WEIGUO_FAMILY_ACL_JSON"] = json.dumps({BOB: {"member": "Bob", "role": "member"}})
        self.assertEqual(self.client.get("/v1/family/tasks/" + task_id, headers=alice).status_code, 403)

    def test_cors_policy_rejects_malformed_origins(self):
        for bad in ("*", "http://easylearnfromtw.github.io",
                    "https://easylearnfromtw.github.io/vanilla",
                    "https://easylearnfromtw.github.io.evil.org"):
            with patch.dict(os.environ, {"WEIGUO_CORS_ORIGINS": bad}):
                with self.assertRaises(RuntimeError):
                    service.allowed_origins()
        with patch.dict(os.environ, {"WEIGUO_CORS_ORIGINS": "https://easylearnfromtw.github.io"}):
            self.assertEqual(service.allowed_origins(), ["https://easylearnfromtw.github.io"])


if __name__ == "__main__":
    unittest.main()
