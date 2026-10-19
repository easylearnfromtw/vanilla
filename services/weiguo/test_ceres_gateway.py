import hashlib
import hmac
import json
import unittest
from ceres_gateway import verify_signature, validate_event

EVENT = {"platform": "line", "messageId": "m1", "tenantId": "family", "senderId": "u1",
         "conversationId": "chat", "text": "hello"}

class CeresGatewayTests(unittest.TestCase):
    def test_hmac_auth(self):
        body = json.dumps(EVENT).encode()
        ts = "1700000000"
        secret = "x" * 40
        sig = "sha256=" + hmac.new(secret.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
        self.assertTrue(verify_signature(body, ts, sig, secret, 1700000000))
        self.assertFalse(verify_signature(body + b" ", ts, sig, secret, 1700000000))
        self.assertFalse(verify_signature(body, ts, sig, secret, 1700000301))
        self.assertFalse(verify_signature(body, ts, sig, "short", 1700000000))
        self.assertFalse(verify_signature(body, "bad", sig, secret, 1700000000))

    def test_untrusted_message_schema(self):
        self.assertEqual(validate_event(EVENT)["platform"], "line")
        for bad in ({**EVENT, "platform": "other"}, {**EVENT, "run": True}, {**EVENT, "senderId": ""},
                    {**EVENT, "text": "x" * 4001}):
            with self.assertRaises(ValueError):
                validate_event(bad)
