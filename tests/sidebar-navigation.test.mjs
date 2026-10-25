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

test("霞海書院 has its own deep link and content pane without expanding five-item sidebar",()=>{
 const academy=readFileSync(new URL("../src/academy/XiahaiAcademy.tsx",import.meta.url),"utf8");
 assert.match(app,/get\("academy"\)==="xiahai"/);
 assert.match(app,/section==="xiahai"\?/);
 assert.match(app,/vanilla-open-xiahai/);
 assert.match(academy,/霞海書院/);
 assert.match(academy,/searchOpenAlexWorks/);
 const evidenceCard=readFileSync(new URL("../src/academy/EvidenceCard.tsx",import.meta.url),"utf8");
 assert.match(academy,/EvidenceCard/);
 assert.match(evidenceCard,/引自霞海書院 VANILLA Evidence/);
 assert.match(evidenceCard,/paper\.evidence\.id/);
 assert.match(academy,/不代表下載或閱讀論文全文/);
 assert.match(academy,/引用權重/);
 assert.match(academy,/arxiv.org\/search/);
});
