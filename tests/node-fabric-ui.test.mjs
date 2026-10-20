import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Detroit keeps Slime download-only tab; hides the Telegram management panel",()=>{
 const studio=read("src/detroit/DetroitStudio.tsx");
 assert.match(studio,/\['nodes','Slime 下載',Network\]/);
 assert.match(studio,/tab==='nodes'/);
 assert.doesNotMatch(studio,/CeresPanel/);
 assert.match(read("src/App.tsx"),/\|"nodes"/);
});

test("frontend has separate downloadable Slime roles, but no node administration",()=>{
 const ui=read("src/detroit/NodeFabricPanel.tsx");
 assert.match(ui,/slime-my-computer\.py/);
 assert.match(ui,/slime-friend\.py/);
 assert.match(ui,/download=\{item\.file\}/);
 assert.match(ui,/Telegram/);
 assert.doesNotMatch(ui,/(rotate-invite|revoke NODE_ID|workerEndpoint|owner_token)/);
 assert.match(ui,/沒有.*30B|沒有.*GPU|30B 模型/);
});

test("the two standalone node programs require friend consent and no arbitrary shell",()=>{
 for(const path of ["public/slime/slime-my-computer.py","public/slime/slime-friend.py"]){
  const source=read(path);
  assert.match(source,/--consent/);
  assert.match(source,/\/v1\/slime\/node\/heartbeat/);
  assert.match(source,/Ctrl\+C/);
  assert.doesNotMatch(source,/shell=True|eval\(|exec\(/);
 }
});
