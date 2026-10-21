import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi import HTTPException
import ceres_api_access as access
import vanilla_public_api as gateway


class GatewayWhitelistTests(unittest.IsolatedAsyncioTestCase):
    async def test_issuance_requires_owner_approval(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ, {'CERES_DB_PATH': folder + '/api.sqlite3', 'VANILLA_API_REQUIRE_WHITELIST': 'true'}):
                with patch.object(gateway, '_verify', return_value=12345):
                    request = gateway.KeyCreate(init_data='x' * 30, project_id='a' * 16, label='Test key', models=['vanilla-default'], daily_tokens=1000, monthly_tokens=5000, rpm=1)
                    with self.assertRaises(HTTPException) as exc:
                        await gateway.issue_key(request)
                    self.assertEqual(exc.exception.status_code, 403)

    def test_registry_credentials_not_gateway_keys(self):
        with patch.dict(os.environ, {'VANILLA_PUBLIC_API_ENABLED': 'true'}):
            with self.assertRaises(HTTPException) as exc:
                gateway._key_from_header('Bearer vna_not_a_gateway_key')
            self.assertEqual(exc.exception.status_code, 401)


if __name__ == '__main__':
    unittest.main()
