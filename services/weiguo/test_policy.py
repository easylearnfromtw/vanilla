import unittest
from unittest.mock import patch
from policy import PolicyError, validate_url, validate_steps, validate_tools_manifest

class BrowserPolicyTests(unittest.TestCase):
    def setUp(self):
        self.allow = {"example.org", "www.example.org"}
    def test_public_https_exact_hosts_only(self):
        self.assertEqual(validate_url("https://example.org/info",self.allow),"https://example.org/info")
        for url in ("http://example.org","https://evil.example.org","file:///etc/passwd","https://localhost", "https://example.org:8000","https://attacker@example.org"):
            with self.subTest(url=url):
                with self.assertRaises(PolicyError):validate_url(url,self.allow)
    def test_reject_private_and_rebinding_dns(self):
        with self.assertRaises(PolicyError):validate_url("https://127.0.0.1",{"127.0.0.1"})
        with patch("policy.socket.getaddrinfo",return_value=[(2,1,6,"",("10.0.0.5",443))]):
            with self.assertRaises(PolicyError):validate_url("https://example.org",self.allow,check_dns=True)
    def test_steps_default_readonly_and_guarded(self):
        self.assertEqual(validate_steps([{"action":"extract"}])[0]["action"],"extract")
        with self.assertRaises(PolicyError):validate_steps([{"action":"click","selector":"button"}],approved=False)
        with self.assertRaises(PolicyError):validate_steps([{"action":"fill","selector":"input","text":"hello"}],approved=True,allow_mutations=False)
        with self.assertRaises(PolicyError):validate_steps([{"action":"fill","selector":"input","text":"password"}],approved=True,allow_mutations=True)
        with self.assertRaises(PolicyError):validate_steps([{"action":"eval","code":"alert(1)"}],approved=True,allow_mutations=True)
        self.assertEqual(validate_steps([{"action":"scroll","pixels":300}]),[{"action":"scroll","pixels":300}])
    def test_tool_manifest_never_enables_execution(self):
        expected=validate_tools_manifest([{"id":"research-plugin","name":"Research","capabilities":["extract","research"],"enabled":True}])
        self.assertFalse(expected[0]["enabled"])
        with self.assertRaises(PolicyError):validate_tools_manifest([{"id":"mytool","capabilities":["execute-shell"]}])
        with self.assertRaises(PolicyError):validate_tools_manifest([{"id":"mytool","capabilities":["extract"]},{"id":"mytool","capabilities":["extract"]}])

if __name__ == "__main__":
    unittest.main()
