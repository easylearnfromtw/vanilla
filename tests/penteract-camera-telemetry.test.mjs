import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PENTERACT_VERTICES,ROTATION_PLANES,project5D} from "../src/detroit/penteract-5d.ts";
import {orbitRotate3D,cameraProject3D,clampOrbitCamera,DEFAULT_ORBIT_CAMERA} from "../src/detroit/penteract-camera.ts";
import {auditObservedOctoberFunnel} from "../src/detroit/penteract-telemetry.ts";

test("3D orbit preserves Euclidean distances before perspective projection",()=>{
 const pts=[[0.15,-0.2,1.1],[-0.8,1.4,0.4]];
 const initial=Math.hypot(...pts[0].map((n,i)=>n-pts[1][i]));
 for(const yaw of [-3,-1.2,0,0.7,2.9])for(const pitch of [-1.2,0,1.2]){
  const config={yaw,pitch,zoom:1};
  const a=orbitRotate3D(pts[0],config),b=orbitRotate3D(pts[1],config);
  const actual=Math.hypot(...a.map((n,i)=>n-b[i]));
  assert.ok(Math.abs(actual-initial)<1e-12);
 }
});
test("Penteract projection is finite and selectable across all five-dimensional planes",()=>{
 for(const plane of ROTATION_PLANES){
  for(const p of PENTERACT_VERTICES){
   for(const config of [
    DEFAULT_ORBIT_CAMERA,{yaw:-Math.PI,pitch:-1.3,zoom:0.65},
    {yaw:Math.PI,pitch:1.3,zoom:1.5}
   ]){
    const pos=cameraProject3D(project5D(p,plane,0.73),config);
    assert.ok(Number.isFinite(pos.x)&&Number.isFinite(pos.y)&&Number.isFinite(pos.depth));
    assert.ok(pos.radius>0);
   }
  }
 }
 const p=[1,0.2,0.4];
 assert.notDeepEqual(cameraProject3D(p,{yaw:0,pitch:0,zoom:1}),
  cameraProject3D(p,{yaw:1.0,pitch:0.4,zoom:1}));
 assert.throws(()=>cameraProject3D([NaN,0,0],DEFAULT_ORBIT_CAMERA),/NONFINITE/);
});
test("Camera clamps hostile angles/zoom rather than leaking infinities",()=>{
 assert.deepEqual(clampOrbitCamera({yaw:Infinity,pitch:NaN,zoom:-10}),{
  yaw:DEFAULT_ORBIT_CAMERA.yaw,pitch:DEFAULT_ORBIT_CAMERA.pitch,zoom:0.65
 });
 const fixed=clampOrbitCamera({yaw:10,pitch:-10,zoom:100});
 assert.equal(fixed.yaw,Math.PI);assert.equal(fixed.pitch,-1.3);assert.equal(fixed.zoom,1.5);
});
test("October UI retains lazy, no-WebGL-on-load behavior with real 3D orbit controls",()=>{
 const panel=readFileSync(new URL("../src/detroit/PenteractFunnelPanel.tsx",import.meta.url),"utf8");
 assert.match(panel,/cameraProject3D\(project5D/);
 assert.match(panel,/3D camera horizontal orbit/);
 assert.match(panel,/3D camera vertical orbit/);
 assert.match(panel,/3D camera zoom/);
 assert.doesNotMatch(panel,/requestAnimationFrame|setInterval|new WebGLRenderer/);
});
test("Funnel telemetry never fabricates watts or percentages when Ollama counters missing",()=>{
 const missing=auditObservedOctoberFunnel([{stage:"answer",inputTokens:9,outputTokens:70,elapsedMs:800}]);
 assert.equal(missing.status,"no-understanding-pass");
 assert.equal(missing.understandingGeneratedSharePct,null);
 assert.equal(missing.targetMet,null);
 const incomplete=auditObservedOctoberFunnel([
  {stage:"understand",inputTokens:12,outputTokens:null,elapsedMs:500},
  {stage:"answer",inputTokens:13,outputTokens:100,elapsedMs:1000}]);
 assert.equal(incomplete.status,"incomplete");assert.equal(incomplete.targetMet,null);
 assert.equal(auditObservedOctoberFunnel([
  {stage:"understand",inputTokens:1,outputTokens:0,elapsedMs:0},
  {stage:"answer",inputTokens:2,outputTokens:0,elapsedMs:0}]).status,"incomplete");
});
test("Funnel accurately compares actual provider generation counters to an explicit target",()=>{
 const pass=auditObservedOctoberFunnel([
  {stage:"understand",inputTokens:80,outputTokens:110,elapsedMs:1900},
  {stage:"answer",inputTokens:160,outputTokens:65,elapsedMs:1000}
 ]);
 assert.equal(pass.status,"measured");
 assert.equal(pass.understandingGeneratedSharePct,63);
 assert.equal(pass.understandingElapsedSharePct,66);
 assert.equal(pass.targetGeneratedSharePct,55);
 assert.equal(pass.targetMet,true);
 assert.equal(pass.warning,"not-measured-watts");
 const miss=auditObservedOctoberFunnel([
  {stage:"understand",inputTokens:null,outputTokens:15,elapsedMs:300},
  {stage:"answer",inputTokens:null,outputTokens:85,elapsedMs:700}
 ]);
 assert.equal(miss.understandingGeneratedSharePct,15);
 assert.equal(miss.targetMet,false);
});
