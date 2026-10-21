"""Gecko verified download-only updater; no network or arbitrary command."""
from io import BytesIO
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import gecko_update as g


class GeckoUpdateTests(unittest.TestCase):
    def test_prefetch_is_hash_checked_and_never_runs_installer(self):
        payload=b"official tested installer bytes"*30
        expected=hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory() as d,patch.object(g,"_platform_asset",return_value="Slime-Friend-linux.tar.gz"),patch.object(
          g,"_verify_release",return_value=("https://github.com/easylearnfromtw/vanilla/releases/download/slime-vtest/Slime-Friend-linux.tar.gz",expected)),patch.object(
          g,"_idle_enough",return_value=True),patch.object(g,"urlopen",return_value=BytesIO(payload)):
            data=g.download_only("slime-vtest",cache_root=Path(d))
            self.assertTrue(data["cached"])
            self.assertIs(data["autoInstalled"],False)
            cached=Path(d)/"slime-vtest"/"Slime-Friend-linux.tar.gz"
            self.assertEqual(cached.read_bytes(),payload)
            self.assertFalse(list(cached.parent.glob("*.part")))
            same=g.download_only("slime-vtest",cache_root=Path(d))
            self.assertTrue(same["cached"])

    def test_hash_failure_cleans_partial_file(self):
        with tempfile.TemporaryDirectory() as d,patch.object(g,"_platform_asset",return_value="Slime-Friend.exe"),patch.object(
          g,"_verify_release",return_value=("https://github.com/easylearnfromtw/vanilla/releases/download/slime-vtest/Slime-Friend.exe","0"*64)),patch.object(
          g,"_idle_enough",return_value=True),patch.object(g,"urlopen",return_value=BytesIO(b"unexpected")):
            with self.assertRaises(ValueError):
                g.download_only("slime-vtest",cache_root=Path(d))
            folder=Path(d)/"slime-vtest"
            self.assertEqual(list(folder.iterdir()),[])

    def test_busy_host_skips_all_network(self):
        with patch.object(g,"_platform_asset",return_value="Slime-Friend.exe"),patch.object(
             g,"_idle_enough",return_value=False),patch.object(g,"urlopen") as network:
            self.assertEqual(g.download_only("slime-vtest")["skipped"],"busy")
            network.assert_not_called()

    def test_invalid_target_cannot_download(self):
        for bad in ["https://attacker.example/file","slime-vbad/../../etc","slime-@bad",""]:
            with self.assertRaises(ValueError):
                g._verify_release(bad,"Slime-Friend.exe")


if __name__=="__main__":
    unittest.main()
