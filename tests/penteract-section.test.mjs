import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {sectionPenteract5D,FIVE_SLICE_EDGES} from "../src/detroit/penteract-section.ts";
import {distance5D,project5D,ROTATION_PLANES,rotate5D} from "../src/detroit/penteract-5d.ts";
import {cameraProject3D,DEFAULT_ORBIT_CAMERA} from "../src/detroit/penteract-camera.ts";

test("Every intrinsic W/V slice is a genuine 3D cube embedded in R5",()=>{
 assert.equal(FIVE_SLICE_EDGES.length,12);
 assert.equal(new Set(FIVE_SLICE_EDGES.map(e=>e.join(":"))).size,12);
 for(const w of [-1,-0.5,0,0.37,1])for(const v of [-1,-0.27,0,0.91,1]){
  const cube=sectionPenteract5D({w,v});
  assert.equal(cube.dimension,3);
  assert.equal(cube.vertices.length,8);
  assert.equal(cube.edges.length,12);
  assert.equal(new Set(cube.vertices.map(p=>p.join(","))).size,8);
  for(const point of cube.vertices){
   assert.equal(point.length,5);
   assert.ok(point.slice(0,3).every(x=>x===1||x===-1));
   assert.equal(point[3],w);assert.equal(point[4],v);
  }
  const degrees=Array(8).fill(0);
  for(const [a,b] of cube.edges){
   assert.ok(a>=0&&a<b&&b<8);
   degrees[a]++;degrees[b]++;
   assert.equal(distance5D(cube.vertices[a],cube.vertices[b]),2);
  }
  assert.ok(degrees.every(d=>d===3));
 }
});
test("A section retains 3D adjacency and R5 distances under every 5D rotation",()=>{
 const cube=sectionPenteract5D({w:0.45,v:-0.7});
 for(const plane of ROTATION_PLANES){
  const points=cube.vertices.map(p=>rotate5D(p,plane,1.3));
  for(const [a,b] of cube.edges){
   assert.ok(Math.abs(distance5D(points[a],points[b])-2)<1e-12);
  }
  for(const point of cube.vertices){
   const screen=cameraProject3D(project5D(point,plane,0.4),DEFAULT_ORBIT_CAMERA);
   assert.ok(Number.isFinite(screen.x)&&Number.isFinite(screen.y));
  }
 }
});
test("Invalid, NaN and out-of-range sections fail closed",()=>{
 for(const section of [
  {w:1.0001,v:0},{w:0,v:-1.01},{w:NaN,v:0},
  {w:0,v:Infinity},{w:-Infinity,v:0}
 ])assert.throws(()=>sectionPenteract5D(section),/INVALID_5D_SLICE/);
});
test("Penteract UI exposes true 5D section controls with zero idle GPU load",()=>{
 const panel=readFileSync(new URL("../src/detroit/PenteractFunnelPanel.tsx",import.meta.url),"utf8");
 assert.match(panel,/sectionPenteract5D\(slice\)/);
 assert.match(panel,/5D section W/);
 assert.match(panel,/5D section V/);
 assert.match(panel,/showSlice&&/);
 assert.match(panel,/sliceGeometry\.edges\.map/);
 assert.doesNotMatch(panel,/requestAnimationFrame|setInterval|WebGLRenderer|fetch\(/);
});
