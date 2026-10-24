import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createLuna,parseLuna,parseLunaLibrary,promptLuna,lunaStorageKey,moveLuna,duplicateLuna,orderLuna,LUNA_MAX_LAYERS} from "../src/luna/model.ts";
const file=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("LUNA templates produce original editable documents",()=>{
 for(const style of ["editorial","minimal","event"]){
  const doc=createLuna(style);
  assert.equal(doc.version,1);
  assert.ok(doc.layers.length>=4);
  assert.deepEqual(parseLuna(JSON.parse(JSON.stringify(doc))),doc);
  assert.equal(new Set(doc.layers.map(x=>x.id)).size,doc.layers.length);
  assert.ok(doc.layers.filter(x=>x.kind==="text").every(x=>!/LUNA\s*\/\s*VANILLA|VANILLA AI/i.test(x.text||"")),"preset exports should not include product branding as a watermark");
 }
});
test("offline prompt composition labels genuine deterministic templates",()=>{
 assert.equal(promptLuna("我要辦活動講座").background,"#1C2445");
 assert.equal(promptLuna("醫美診所品牌").background,"#F4F2EC");
 assert.match(file("src/luna/LunaStudio.tsx"),/套用本機模板/);
});
test("untrusted imported documents cannot embed external content or CSS",()=>{
 const d=createLuna(),l={...d.layers[0],kind:"image",image:"https://example.invalid/tracker"};
 assert.throws(()=>parseLuna({...d,layers:[l]}),/本機圖片/);
 assert.throws(()=>parseLuna({...d,layers:[{...l,image:"data:image/svg+xml;base64,PHN2Zz4="}]}),/本機圖片/);
 assert.throws(()=>parseLuna({...d,layers:Array.from({length:LUNA_MAX_LAYERS+1},()=>l)}),/圖層/);
 assert.equal(parseLuna({...d,background:"url(javascript:alert(1))"}).background,"#FFFFFF");
 const edge=parseLuna({...d,layers:[{...d.layers[0],x:.98,w:.9,y:.97,h:.6}]});
 assert.ok(edge.layers[0].x+edge.layers[0].w<=1);
 assert.ok(edge.layers[0].y+edge.layers[0].h<=1);
});
test("layers move inside bounds and duplicate safely",()=>{
 const d=createLuna(),l=d.layers[0],m=moveLuna(d,l.id,10,-2);
 assert.equal(m.layers[0].x,1-l.w);assert.equal(m.layers[0].y,0);
 const dup=duplicateLuna(m,l.id);
 assert.equal(dup.layers.length,m.layers.length+1);
 assert.notEqual(dup.layers[0].id,dup.layers[1].id);
 assert.notEqual(orderLuna(dup,l.id,1).layers[0].id,dup.layers[0].id);
});
test("saved collections reject invalid objects and isolate account storage",()=>{
 const d=createLuna(),library=parseLunaLibrary({projects:[d,{admin:"password"}],activeId:"unknown"});
 assert.equal(library.projects.length,1);
 assert.equal(library.activeId,d.id);
 assert.notEqual(lunaStorageKey("person-one"),lunaStorageKey("person-two"));
});
test("LUNA has no upstream administrator, login, or network requests",()=>{
 const sources=["src/luna/model.ts","src/luna/export.ts","src/luna/LunaStudio.tsx"].map(file);
 for(const source of sources){
  assert.doesNotMatch(source,/\bfetch\s*\(|\baxios\s*\(|Authorization\s*:|\/admin\/|https?:\/\//i);
  assert.doesNotMatch(source,/PASSWORD=|DEFAULT_ADMIN|setItem\(["'].*password/i);
 }
 const app=file("src/App.tsx"),detroit=file("src/detroit/DetroitStudio.tsx"),core=file("src/detroit/core.ts");
 assert.match(app,/vanilla-open-luna/);assert.match(app,/LunaStudio/);
 assert.match(detroit,/LUNA 設計/);assert.match(core,/id:"luna",label:"LUNA"/);
});
