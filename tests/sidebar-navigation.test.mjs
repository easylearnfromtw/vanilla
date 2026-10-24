import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");

test("desktop sidebar exposes exactly the five requested destinations, in order",()=>{
 const section=app.split("const items:NavItem[]=[")[1]?.split("];")[0];
 assert.ok(section,"Five-item navigation list exists");
 const entries=[...section.matchAll(/\{id:"([^"]+)",label:"([^"]+)"/g)].map(([,id,label])=>({id,label}));
 assert.deepEqual(entries,[
  {id:"chat",label:"對話"},
  {id:"settings",label:"設定"},
  {id:"files",label:"雲端"},
  {id:"cream",label:"長期追蹤"},
  {id:"nodes",label:"Slime"}
 ]);
 const sidebar=app.split("<aside className=")[1]?.split("</aside>")[0];
 assert.ok(sidebar,"Desktop/mobile drawer exists");
 assert.match(sidebar,/items\.map\(navButton\)/);
 assert.doesNotMatch(sidebar,/tools\.map|features\.slice|recent-list|new-chat|nav-caption|sidebar-footer|RECENT|TOOLS/);
});
test("mobile tab bar uses identical five primary destinations",()=>{
 assert.match(app,/const tabs=items\.map\(\(\{id,label,icon\}\)=>\(\{id,label,icon\}\)\)/);
 assert.match(app,/<TabBar items=\{tabs\}/);
});
test("retired navigation entries remain tool-accessible rather than being deleted",()=>{
 assert.match(app,/const all=\[\.\.\.items,\.\.\.tools\]/);
 for(const id of ["detroit","orchestra","luna","email","builder","library","sheets","projects","weiguo"]){
  assert.match(app,new RegExp('\\{id:"'+id+'",label:'),"Section metadata retained for "+id);
 }
 assert.match(app,/\["vanilla-open-detroit"/);
 assert.match(app,/\["vanilla-open-builder"/);
 assert.match(app,/section==="cream"\?/);
 assert.match(app,/section==="files"\?/);
 assert.match(app,/href=\{BASE\+"slime\/"\}/);
 assert.match(app,/aria-label="新對話"/); // chat header retains the primary new-chat action
});
