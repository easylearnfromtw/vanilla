import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Slime download UI only links matching verified GitHub release assets",()=>{
 const panel=read("src/slime/SlimePanel.tsx");
 assert.match(panel,/\/releases\?per_page=20/);
 assert.match(panel,/Slime-Owner/);
 assert.match(panel,/Slime-Friend/);
 assert.match(panel,/trustedAsset/);
 assert.match(panel,/asset\.size>0/);
 assert.match(panel,/release\.draft\|\|release\.prerelease/);
 assert.match(panel,/startsWith\("https:\/\/github\.com\/easylearnfromtw\/vanilla\/releases\/download\/"/);
 assert.match(panel,/mobile/);
 assert.match(panel,/正在核對官方發行版本/);
 assert.match(panel,/尚未找到本次選擇的正式安裝檔/);
 assert.match(panel,/不會以其他系統版本或舊版檔案冒充可下載/);
 assert.doesNotMatch(panel,/createSlimeInvite|setSlimeNodeEnabled|revokeSlimeNode/);
});

test("one-time invite launches Slime automatically but never persists the URL secret",()=>{
 const app=read("src/App.tsx");
 const panel=read("src/slime/SlimePanel.tsx");
 assert.match(app,/^.*#slime=/m);
 assert.match(app,/nodes":"chat"/);
 assert.match(panel,/inviteFromURL/);
 assert.match(panel,/history\.replaceState/);
 assert.match(panel,/navigator\.clipboard\.writeText/);
 assert.doesNotMatch(panel,/localStorage\.setItem|sessionStorage\.setItem/);
});

test("standalone installer release workflow publishes exactly compatible asset filenames",()=>{
 const action=read(".github/workflows/slime-release.yml");
 assert.match(action,/workflow_dispatch/);
 assert.match(action,/tags: \['slime-v\*'\]/);
 assert.match(action,/Slime-Owner\.exe/);
 assert.match(action,/Slime-Friend\.exe/);
 assert.match(action,/Slime-\$\{role\}-macos\.zip/);
 assert.match(action,/Slime-\$\{role\}-linux\.tar\.gz/);
 assert.match(action,/SHA256SUMS\.txt/);
 assert.match(action,/gh release create/);
 assert.match(action,/if: startsWith\(github\.ref, 'refs\/tags\/slime-v'\)/);
});

test("desktop runner joins only after explicit consent and never opens remote shells",()=>{
 const agent=read("services/weiguo/slime_desktop.py");
 assert.match(agent,/if not _confirm/);
 assert.match(agent,/\/v1\/slime\/node\/join/);
 assert.match(agent,/\/v1\/slime\/node\/leave/);
 assert.match(agent,/os\.replace/);
 assert.match(agent,/SLIME_NODE_TOKEN/);
 assert.doesNotMatch(agent,/shell=True|subprocess\.Popen|eval\(/);
 const page=read("src/slime/slime.css");
 assert.match(page,/prefers-reduced-motion/);
 assert.match(page,/slime-step-number/);
});
