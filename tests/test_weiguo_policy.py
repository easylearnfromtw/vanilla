import os
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services' / 'weiguo'))
from security import validate_target, guard_steps

class WeiGuoPolicy(unittest.TestCase):
    def test_exact_allowlist(self):
        self.assertEqual(validate_target('https://example.com/a', {'example.com'}), 'https://example.com/a')
        for uri in ('http://example.com', 'https://example.com.evil.com', 'https://127.0.0.1/', 'https://example.com:8322', 'https://user@example.com'):
            with self.subTest(uri=uri), self.assertRaises(ValueError):
                validate_target(uri, {'example.com'})
    def test_no_wildcard(self):
        with self.assertRaises(ValueError):
            validate_target('https://example.com', set())
    def test_read_only(self):
        self.assertEqual(guard_steps([{'action':'extract','value':''}]), [{'action':'extract','value':''}])
        for action in ('execute_js', 'submit', 'post', 'upload', 'download', 'password'):
            with self.assertRaises(ValueError):
                guard_steps([{'action':action,'value':''}])
    def test_sensitive_input_rejected(self):
        with self.assertRaises(ValueError):
            guard_steps([{'action':'search','value':'credit card number'}])

if __name__=='__main__':
    unittest.main()