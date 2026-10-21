import unittest
from fastapi import HTTPException
import ceres_api_access as api


class APIAccessTests(unittest.TestCase):
    def test_public_application_is_disabled(self):
        with self.assertRaises(HTTPException) as exc:
            api.request_access(api.UserRequest(user_id=123))
        self.assertEqual(exc.exception.status_code, 503)

    def test_inference_not_exposed(self):
        self.assertEqual(api.status()['inference'], 'disabled')

    def test_admin_auth_fails_closed(self):
        with self.assertRaises(HTTPException) as exc:
            api._admin(None)
        self.assertEqual(exc.exception.status_code, 403)


if __name__ == '__main__':
    unittest.main()
