import unittest
from unittest.mock import patch
from fastapi import HTTPException
import vanilla_public_api as gateway


class InferenceReadinessTests(unittest.TestCase):
    def test_disabled_by_default(self):
        with patch.dict('os.environ', {'VANILLA_PUBLIC_API_ENABLED': 'false'}):
            state = gateway.inference_status()
            self.assertFalse(state['gateway_enabled'])
            self.assertFalse(state['inference_verified'])
            self.assertFalse(state['legacy_ceres_keys_supported'])
            with self.assertRaises(HTTPException) as err:
                gateway._key_from_header(None)
            self.assertEqual(err.exception.status_code, 503)

    def test_no_credentials_in_readiness(self):
        with patch.dict('os.environ', {'VANILLA_PUBLIC_API_ENABLED': 'false', 'VANILLA_INFERENCE_SERVICE_KEY': 'secret-example'}):
            state = gateway.inference_status()
            self.assertNotIn('secret-example', str(state))


if __name__ == '__main__':
    unittest.main()
