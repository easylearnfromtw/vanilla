import unittest
from public_origin import configured_public_origin,valid_ceres_webhook,backend_runtime_label

PATH='/v1/ceres/telegram/webhook'

class OriginTests(unittest.TestCase):
    def test_runtime_label_is_server_configured_and_legacy_compatible(self):
        self.assertEqual(backend_runtime_label({}),'railway-server')
        self.assertEqual(backend_runtime_label({'WEIGUO_RUNTIME_KIND':'self-hosted-server'}),'self-hosted-server')
        self.assertEqual(backend_runtime_label({'WEIGUO_RUNTIME_KIND':'arbitrary'}),'railway-server')
    def test_explicit_private_host_is_exact(self):
        env={'WEIGUO_PUBLIC_BASE_URL':'https://vanilla.example.com'}
        self.assertEqual(configured_public_origin(env),'https://vanilla.example.com')
        self.assertTrue(valid_ceres_webhook('https://vanilla.example.com'+PATH,env))
        for other in ['https://vanilla.example.com.evil.org','https://other.example.com','https://vanilla.example.com@evil.org']:
            self.assertFalse(valid_ceres_webhook(other+PATH,env))

    def test_rejects_ambiguous_origins_and_webhook_paths(self):
        for origin in ['http://vanilla.example.com','https://u:p@vanilla.example.com','https://vanilla.example.com:8443','https://vanilla.example.com/path','https://vanilla.example.com?q=1','https://127.0.0.1','https://localhost','https://vanilla.example.com#fragment','https://VANILLA.example.com']:
            self.assertIsNone(configured_public_origin({'WEIGUO_PUBLIC_BASE_URL':origin}),origin)
        env={'WEIGUO_PUBLIC_BASE_URL':'https://vanilla.example.com'}
        for suffix in [PATH+'?x=1',PATH+'#x',PATH+'/',PATH+'/../webhook']:
            self.assertFalse(valid_ceres_webhook('https://vanilla.example.com'+suffix,env))

    def test_legacy_railway_behavior_is_preserved_only_when_unconfigured(self):
        old='https://weiguo.up.railway.app'+PATH
        self.assertTrue(valid_ceres_webhook(old,{}))
        self.assertFalse(valid_ceres_webhook('https://other.example.com'+PATH,{}))
        self.assertFalse(valid_ceres_webhook(old,{'WEIGUO_PUBLIC_BASE_URL':'invalid'}))
        self.assertFalse(valid_ceres_webhook(old,{'WEIGUO_PUBLIC_BASE_URL':''}))

if __name__=='__main__':unittest.main()
