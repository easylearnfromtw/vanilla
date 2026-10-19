import test from "node:test";
import assert from "node:assert/strict";
import {launchReadiness,launchCounts} from "../src/release/readiness.ts";
const blank={online:false,webGPU:false,localModelLoaded:false,indexedDB:false,cloudProvidersConfigured:false,
 driveAuthorized:false,analyticsClientConfigured:false,analyticsAuthorized:false,ollamaConfigured:false,
 webSearchConfigured:false,webSearchTokenConfigured:false,noodlesEnabled:false};
const get=(rows,id)=>rows.find(row=>row.id===id);
test("a published frontend cannot claim third-party APIs or unfinished CREAM and mobile agents are live",()=>{
 const rows=launchReadiness(blank);
 for(const id of ["local","models","ollama","drive","ga4","web"])assert.equal(get(rows,id).status,"setup",id);
 for(const id of ["cream-advanced","noodles-advanced","phone","family","travel"])assert.equal(get(rows,id).status,"planned",id);
 assert.equal(get(rows,"cream").status,"ready");
 assert.equal(get(rows,"chat").status,"ready");
 assert.equal(get(rows,"studio").status,"limited");
 const counts=launchCounts(rows);
 assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),rows.length);
});
test("runtime changes statuses without pretending the remote services responded",()=>{
 const rows=launchReadiness({...blank,online:true,indexedDB:true,cloudProvidersConfigured:true,
  ollamaConfigured:true,webSearchConfigured:true,webSearchTokenConfigured:true,
  driveAuthorized:true,analyticsClientConfigured:true,analyticsAuthorized:true,
  localModelLoaded:true,webGPU:true,noodlesEnabled:true});
 assert.equal(get(rows,"local").status,"ready");
 assert.equal(get(rows,"library").status,"ready");
 assert.equal(get(rows,"noodles").status,"ready");
 assert.equal(get(rows,"ga4").status,"limited");
 assert.equal(get(rows,"web").status,"limited");
 assert.equal(get(rows,"ollama").status,"limited");
 assert.equal(get(rows,"drive").status,"limited");
 assert.equal(get(rows,"models").status,"limited");
 assert.match(get(rows,"ga4").description,/測試/);
 assert.match(get(rows,"web").description,/測試/);
});
test("serverless backends and third-party training do not magically turn on when online",()=>{
 const online=launchReadiness({...blank,online:true,webSearchConfigured:false,webSearchTokenConfigured:false});
 assert.equal(get(online,"web").status,"setup");
 assert.equal(get(online,"noodles-advanced").status,"planned");
 assert.equal(get(online,"public-search").status,"limited");
});
