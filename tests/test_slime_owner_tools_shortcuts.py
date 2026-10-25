"""Owner-only launcher regression: no accidental Friend shortcut packaging."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
DEPLOY=ROOT/"deployment"/"slime"
WORKFLOW=(ROOT/".github"/"workflows"/"slime-release.yml").read_text(encoding="utf8")

class OwnerToolsLauncherTests(unittest.TestCase):
 def test_windows_shortcut_calls_owner_exe_with_tools_no_shell_fetch(self):
  cmd=(DEPLOY/"Slime-Owner-Tools.cmd").read_text(encoding="utf8")
  self.assertIn('"%~dp0Slime-Owner.exe" --tools',cmd)
  self.assertNotIn("Slime-Friend",cmd)
  self.assertNotIn("powershell -enc",cmd.lower())
  self.assertIn("Slime-Owner-Tools.cmd",WORKFLOW)
  self.assertIn("dist/Slime-Owner-Tools.cmd",WORKFLOW)
 def test_macos_shortcut_only_added_to_owner_zip(self):
  src=(DEPLOY/"Slime-Owner-Tools.command").read_text(encoding="utf8")
  self.assertIn("exec python3 slime_desktop.py --tools",src)
  self.assertIn("Slime-Owner-Tools.command",WORKFLOW)
  self.assertIn('if [ "$role" = "Owner" ]; then',WORKFLOW)
  self.assertIn("Owner tools shortcut leaked into Friend macOS package",WORKFLOW)
 def test_linux_shortcut_exclusively_in_owner_archive(self):
  src=(DEPLOY/"launch-owner-tools.sh").read_text(encoding="utf8")
  self.assertIn("exec python3 slime_desktop.py --tools",src)
  self.assertIn('"tmp-$role/start-slime-tools.sh"',WORKFLOW)
  self.assertIn("Owner tools shortcut leaked into Friend Linux package",WORKFLOW)
 def test_release_still_contains_main_sandbox_toolkit_and_three_os_gates(self):
  self.assertIn("Slime-Sandbox-Toolkit.zip",WORKFLOW)
  self.assertIn("python3 deployment/slime/build-unified-toolkit.py",WORKFLOW)
  self.assertIn("needs: [windows,macos,linux]",WORKFLOW)
  self.assertIn("github.ref == 'refs/heads/main'",WORKFLOW)
  self.assertIn("sha256sum Slime-* > SHA256SUMS.txt",WORKFLOW)
 def test_documentation_does_not_claim_qwen_training_or_silent_install(self):
  doc=(ROOT/"docs"/"SLIME_UNIFIED_SANDBOX_RELEASE.md").read_text(encoding="utf8")
  self.assertIn("17 項",doc)
  self.assertIn("並不代表已靜默安裝",doc) if "並不代表已靜默安裝" in doc else self.assertIn("不代表已靜默安裝",doc)
  self.assertIn("Qwen3",doc)
  self.assertIn("Slime-Owner-Tools.cmd",doc)

if __name__=="__main__":unittest.main()
