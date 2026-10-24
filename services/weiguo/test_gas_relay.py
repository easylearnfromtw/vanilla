"""GAS API Vault signing and server-side authorization tests (no live network)."""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gas_relay


class VaultProtocolTests(unittest.TestCase):
    def test_fixed_url_and_secret_required(self):
        with patch.dict(os.environ, {"VANILLA_GAS_WEB_APP_URL": "https://evil.invalid/x",
                                      "VANILLA_GAS_RELAY_SECRET": "x" * 40}):
            with self.assertRaises(HTTPException):
                gas_relay._settings()
        with patch.dict(os.environ, {"VANILLA_GAS_WEB_APP_URL":
                                      "https://script.google.com/macros/s/abcd1234/exec",
                                      "VANILLA_GAS_RELAY_SECRET": "x" * 40}):
            self.assertEqual(gas_relay._settings()[1], "x" * 40)

    def test_envelope_matches_gas_wire_protocol(self):
        body = {"action": "relay", "provider": "gemini",
                "operation": "chat", "payload": {"messages": [
                    {"role": "user", "content": "繁體中文 ✅"}]},
                "approved_cloud_send": True}
        secret = "h" * 48
        packet = gas_relay._envelope(body, secret, timestamp=1750000000,
                                    nonce="N" * 24)
        self.assertEqual(set(packet), {"v", "ts", "nonce", "client", "data", "sig"})
        decoded = json.loads(base64.urlsafe_b64decode(
            packet["data"] + "=" * (-len(packet["data"]) % 4)))
        self.assertEqual(decoded, body)
        signed = "\n".join(["v1", str(packet["ts"]), packet["nonce"],
                             "weiguo", packet["data"]])
        self.assertEqual(packet["sig"], hmac.new(secret.encode(), signed.encode(),
                                               hashlib.sha256).hexdigest())
        self.assertNotIn(secret, json.dumps(packet))

    def test_envelope_enforces_payload_bound(self):
        with self.assertRaises(HTTPException) as exc:
            gas_relay._envelope({"huge": "x" * 55000}, "x" * 48)
        self.assertEqual(exc.exception.status_code, 413)

    def test_exact_operation_allowlist(self):
        self.assertEqual(set(gas_relay._ALLOWED),
                         {"gemini","openai","deepseek","anthropic","openrouter",
                          "telegram","canva","notion","brave","tavily","github"})
        for methods in gas_relay._ALLOWED.values():
            self.assertNotIn("proxy", methods)
            self.assertNotIn("fetch_url", methods)


class RelayAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_rejects_unknown_operation_before_signing(self):
        req = gas_relay.VaultRequest(provider="gemini", operation="arbitrary",
                                     approved_cloud_send=True)
        with patch.object(gas_relay, "_relay", new_callable=AsyncMock) as call:
            with self.assertRaises(HTTPException) as exc:
                await gas_relay.vault_relay(req, SimpleNamespace(role="owner"))
            self.assertEqual(exc.exception.status_code, 400)
            call.assert_not_awaited()

    async def test_rejects_without_explicit_consent(self):
        req = gas_relay.VaultRequest(provider="gemini", operation="chat",
                                     approved_cloud_send=False)
        with patch.object(gas_relay, "_relay", new_callable=AsyncMock) as call:
            with self.assertRaises(HTTPException) as exc:
                await gas_relay.vault_relay(req, SimpleNamespace(role="owner"))
            self.assertEqual(exc.exception.status_code, 403)
            call.assert_not_awaited()

    async def test_telegram_is_owner_only(self):
        req = gas_relay.VaultRequest(provider="telegram", operation="send_message",
                                     approved_cloud_send=True,
                                     payload={"chat_id": "12345", "text": "hi"})
        with patch.object(gas_relay, "_relay", new_callable=AsyncMock) as call:
            with self.assertRaises(HTTPException) as exc:
                await gas_relay.vault_relay(req, SimpleNamespace(role="member"))
            self.assertEqual(exc.exception.status_code, 403)
            call.assert_not_awaited()

    async def test_accepted_request_contains_no_credentials(self):
        req = gas_relay.VaultRequest(provider="gemini", operation="chat",
                                     approved_cloud_send=True, model="gemini-demo",
                                     payload={"messages":[{"role":"user","content":"Hello"}]})
        with patch.object(gas_relay, "_relay", new_callable=AsyncMock,
                          return_value={"ok":True,"text":"OK"}) as call:
            result = await gas_relay.vault_relay(req, SimpleNamespace(role="member"))
        self.assertEqual(result["text"], "OK")
        supplied = call.await_args.args[0]
        self.assertEqual(supplied["provider"], "gemini")
        self.assertEqual(supplied["model"], "gemini-demo")
        self.assertNotIn("key", supplied)
        self.assertNotIn("url", supplied)

    async def test_status_owner_only(self):
        with patch.object(gas_relay, "_relay", new_callable=AsyncMock) as call:
            with self.assertRaises(HTTPException) as exc:
                await gas_relay.vault_status(SimpleNamespace(role="member"))
            self.assertEqual(exc.exception.status_code, 403)
            call.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
