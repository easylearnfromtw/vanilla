import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Windows scheduled startup requires explicit owner consent and no firewall bypass",()=>{
 const script=read("deployment/slime/install-windows-autostart.ps1");
 assert.match(script,/Read-Host/);
 assert.match(script,/Explicitly enable user-logon startup/);
 assert.match(script,/New-ScheduledTaskTrigger -AtLogOn/);
 assert.match(script,/Unregister-ScheduledTask/);
 assert.doesNotMatch(script,/Set-NetFirewallRule|New-NetFirewallRule|Set-MpPreference|DisableRealtimeMonitoring|ExecutionPolicy Bypass/);
});
test("Mac and Linux startup are visible opt-in per-user services",()=>{
 const mac=read("deployment/slime/install-macos-autostart.sh");
 const linux=read("deployment/slime/install-linux-autostart.sh");
 assert.match(mac,/launchctl bootstrap/);
 assert.match(mac,/launchctl bootout/);
 assert.match(mac,/Type YES/);
 assert.match(linux,/systemctl --user enable --now/);
 assert.match(linux,/systemctl --user disable --now/);
 assert.match(linux,/Type YES/);
 assert.doesNotMatch(linux,/enable-linger|iptables\s+-|ufw\s+disable/);
});
test("Friend Linux entrypoint sets role before exec and all installer platforms package the helpers",()=>{
 const friend=read("deployment/slime/launch-friend.sh");
 assert.match(friend,/export SLIME_INSTALL_ROLE=friend\nexec python3/);
 const workflow=read(".github/workflows/slime-release.yml");
 for(const filename of ["Slime-Windows-Autostart.ps1","install-macos-autostart.sh","install-linux-autostart.sh"]){
  assert.match(workflow,new RegExp(filename.replace(/\./g,"\\.")));
 }
 assert.match(workflow,/test_slime_desktop\.py/);
});
test("Ceres owner revocation requires device-bound Telegram proof in REST and Mini App",()=>{
 const source=read("services/weiguo/ceres_slime_web.py");
 assert.match(source,/Telegram 驗證後撤銷/);
 assert.match(source,/if not body\.code:/);
 assert.match(source,/from slime_revoke_gate import consume_revoke, RevokeDenied/);
 assert.match(source,/consume_revoke\(sub,row\["node_id"\],body\.code,chat\)/);
 assert.match(source,/Telegram 驗證成功，已撤銷節點憑證/);
 const commands=read("services/weiguo/slime_telegram.py");
 assert.match(commands,/_CONFIRM = re\.compile/);
 assert.match(commands,/consume_revoke/);
 const api=read("services/weiguo/slime.py");
 assert.match(api,/consume_revoke\(user\.sub, node_id, body\.code\)/);
});
