import test from "node:test";
import assert from "node:assert/strict";
import {DETROIT_ENGINES} from "../src/detroit/core.ts";
import {DETROIT_FACTORY_TOOLS} from "../src/detroit/factory.ts";
import {ORCHESTRA_TOOLS} from "../src/orchestra/core.ts";
import {DETROIT_CAPABILITIES,DetroitCapabilityBus,detroitAvailability} from "../src/detroit/capability-bus.ts";
import {planDianaNativeArtifact} from "../src/detroit/diana-auto.ts";

test("every installed Detroit specialist and Craft engine belongs to one capability bus",()=>{
 const ids=DETROIT_CAPABILITIES.map(x=>x.id);
 assert.equal(new Set(ids).size,ids.length,"duplicate capability ids");
 for(const item of [...DETROIT_ENGINES,...DETROIT_FACTORY_TOOLS,...ORCHESTRA_TOOLS]){
  assert.ok(ids.includes(item.id),"missing Detroit capability "+item.id);
 }
 for(const name of ["jensen-huang","gridcraft","victoria","medusa","quirinus","ceres","moli"])
  assert.ok(ids.includes(name),name);
 assert.ok(DETROIT_CAPABILITIES.every(x=>x.owner==="detroit"));
 assert.equal(DETROIT_CAPABILITIES.find(x=>x.id==="victoria")?.state,"local");
 assert.equal(detroitAvailability().find(x=>x.id==="victoria")?.state,"not-connected");
});

test("a tool without a real executor can never report completion",async()=>{
 const bus=new DetroitCapabilityBus();
 await assert.rejects(()=>bus.execute("medusa",{}, {privateMode:false,approved:true}),/尚未連接/);
 bus.register("victoria",async()=>({matches:[],context:""}));
 assert.equal(bus.isRunnable("victoria"),true);
 assert.throws(()=>bus.register("unknown-plugin",async()=>({})),/尚未實作/);
});

test("Detroit checks privacy, approval and runtime errors before issuing receipts",async()=>{
 const bus=new DetroitCapabilityBus();let calls=0;
 bus.register("scouts",async()=>{calls++;return {results:["verified"]};});
 bus.register("medusa",async()=>{calls++;return "executed";});
 await assert.rejects(()=>bus.execute("scouts",{}, {privateMode:true}),/私密模式/);
 await assert.rejects(()=>bus.execute("medusa",{}, {privateMode:false}),/需要明確授權/);
 assert.equal(calls,0);
 const receipt=await bus.execute("scouts",{}, {privateMode:false});
 assert.equal(receipt.status,"completed");
 assert.equal(calls,1);
 const approved=await bus.execute("medusa",{}, {privateMode:false,approved:true});
 assert.equal(approved.result,"executed");
 assert.throws(()=>bus.register("medusa",async()=>null),/重複註冊/);
});

test("artifact routing requires an affirmative request and never sends email",()=>{
 const a=planDianaNativeArtifact("幫我製作一份 PDF 報告");
 assert.equal(a?.capability,"retina");
 const b=planDianaNativeArtifact("請設計一份欣緯生醫電子報");
 assert.equal(b?.capability,"janus");
 if(b?.capability==="janus")assert.equal(b.brand,"欣緯生醫");
 for(const q of ["什麼是 PDF","請問如何製作電子報","引用：製作一份 PDF","幫我寄送電子報","不要下載PDF"]){
  assert.equal(planDianaNativeArtifact(q),null,q);
 }
});

test("Orchestra is registered as local Detroit-owned ability while native Craft stays gated",()=>{
 assert.equal(DETROIT_CAPABILITIES.find(c=>c.id==="orchestra")?.state,"local");
 assert.ok(ORCHESTRA_TOOLS.every(x=>DETROIT_CAPABILITIES.find(c=>c.id===x.id)?.state==="adapter"));
 const bus=new DetroitCapabilityBus();
 bus.register("orchestra",async()=>({filename:"verified.pdf"}));
 assert.equal(bus.isRunnable("orchestra"),true);
});
