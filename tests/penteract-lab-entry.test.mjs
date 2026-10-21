import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluatePenteractLabBatch} from "../src/detroit/penteract-lab-contract.ts";
import {PENTERACT_VERTICES,PENTERACT_EDGES,ROTATION_PLANES,rotate5D,distance5D} from "../src/detroit/penteract-5d.ts";

test("genuine R5 math has 32 vertices, 80 edges and length-preserving rotations",()=>{
 assert.equal(PENTERACT_VERTICES.length,32);
 assert.equal(PENTERACT_EDGES.length,80);
 assert.equal(ROTATION_PLANES.length,10);
 const a=PENTERACT_VERTICES[0],b=PENTERACT_VERTICES[31];
 assert.ok(Math.abs(distance5D(a,b)-distance5D(rotate5D(a,"xv",.72),rotate5D(b,"xv",.72)))<1e-9);
});

test("test gateway accepts bounded batch; returns no raw question or tool execution",()=>{
 const raw={version:1,cases:[
  {id:"finance_01",question:"分析 ETF 投資報酬",expectedCandidate:"finance"},
  {id:"unknown_01",question:"晚安",expectedCandidate:null}
 ]};
 const result=evaluatePenteractLabBatch(raw);
 assert.equal(result.contract,"atuber-5d-shadow-v1");
 assert.equal(result.mode,"local-readonly");
 assert.equal(result.authorized,false);
 assert.equal(result.toolsDispatched,false);
 assert.equal(result.modelInvoked,false);
 assert.equal(result.total,2);
 assert.equal(result.scored,2);
 assert.equal(result.rows[1].status,"abstain");
 assert.equal(result.rows[1].candidateId,null);
 assert.equal(result.rows[0].id,"finance_01");
 assert.equal(result.rows[1].match,true);
 assert.equal(JSON.stringify(result).includes("分析 ETF"),false);
 assert.equal(JSON.stringify(result).includes("晚安"),false);
});
test("gateway rejects malformed and excessive submissions before any routing",()=>{
 for(const bad of [
  {version:1,cases:[]}, {version:1,cases:Array.from({length:49},(_,i)=>({id:"c"+i,question:"hello"}))},
  {version:2,cases:[{id:"case1",question:"hello"}]},
  {version:1,cases:[{id:"../../secret",question:"hello"}]},
  {version:1,cases:[{id:"a",question:"hey",extra:"no"}]},
  {version:1,cases:[{id:"same",question:"hello"},{id:"same",question:"another"}]},
  {version:1,cases:[{id:"bad",question:"a".repeat(1025)}]},
  {version:1,cases:[{id:"bad",question:"hello",expectedCandidate:"admin"}]},
 ])assert.throws(()=>evaluatePenteractLabBatch(bad),/INVALID_5D/);
});
test("5D lab remains an explicit user-opened read-only studio tab and URL",()=>{
 const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
 const studio=readFileSync(new URL("../src/detroit/DetroitStudio.tsx",import.meta.url),"utf8");
 const bench=readFileSync(new URL("../src/detroit/PenteractLabTestBench.tsx",import.meta.url),"utf8");
 assert.match(app,/new URLSearchParams\(window.location.search\)\.get\("lab"\)==="5d"/);
 assert.match(studio,/October 5D · 測試/);
 assert.match(studio,/PenteractLabTestBench/);
 assert.match(bench,/window\.__vanilla5dLab\.evaluate\(request\)/);
 assert.match(bench,/data-testid="atuber-5d-run"/);
 assert.doesNotMatch(bench,/fetch\(|localStorage\.|sessionStorage\.|dispatchEvent\(/);
});
