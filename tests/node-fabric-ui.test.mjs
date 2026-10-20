import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("Detroit exposes the Slime studio tab, while preserving existing node manager",()=>{
 const studio=read("src/detroit/DetroitStudio.tsx");
 assert.match(studio,/Slime 下載/);
 assert.match(studio,/tab==='slime'/);
 const slime=read("src/slime/SlimePanel.tsx");
 assert.match(slime,/Slime-Owner|Slime-Friend/);
 assert.doesNotMatch(slime,/createSlimeInvite|revokeSlimeNode|setSlimeNodeEnabled|previewSlimeRoute|LegacyWindowsNodes/);
 assert.doesNotMatch(studio,/CeresPanel/);
 assert.match(read("src/App.tsx"),/\|"nodes"/);
});
test("separate downloads are local files and never advertise live 30B compute",()=>{
 const panel=read("src/detroit/NodeFabricPanel.tsx");
 assert.match(panel,/vanilla-owner\.py/);
 assert.match(panel,/vanilla-friend\.py/);
 assert.match(panel,/inference|30B|推論/);
 assert.match(panel,/目前尚不會分配 GPU 任務/);
 assert.match(panel,/download=\{current\.filename\}/);
});
test("owner and friend have explicit scopes with no remote-shell execution",()=>{
 const owner=read("public/node-fabric/vanilla-owner.py");
 const friend=read("public/node-fabric/vanilla-friend.py");
 assert.match(owner,/127\.0\.0\.1/);
 assert.match(owner,/rotate-invite/);
 assert.match(friend,/--consent/);
 assert.match(friend,/Ctrl\+C/);
 assert.doesNotMatch(owner,/shell=True/);
 assert.doesNotMatch(friend,/shell=True/);
});
