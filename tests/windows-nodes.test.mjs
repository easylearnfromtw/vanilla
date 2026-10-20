import test from "node:test";import assert from "node:assert/strict";
import {cleanEndpoint,selectNode} from "../src/nodes/registry.ts";
const n=(id,o={})=>({id,name:id,endpoint:"https://a.tailnet.ts.net",models:["qwen3:8b"],availableRamGB:20,availableVramGB:5,activeJobs:0,maxConcurrentJobs:1,queueDepth:0,power:"ac",health:"healthy",latencyMs:30,...o});
test("only local or private HTTPS URLs",()=>{assert.equal(cleanEndpoint("http://127.0.0.1:18765"),"http://127.0.0.1:18765");for(const x of ["http://192.168.1.2:18765","https://evil.com","https://a.tailnet.ts.net/hack","https://user:pass@a.tailnet.ts.net"])assert.throws(()=>cleanEndpoint(x));});
test("choose live AC power, correct model, not busy",()=>{assert.equal(selectNode([n("battery",{power:"battery"}),n("busy",{activeJobs:1}),n("right")],"qwen3:8b")?.id,"right");assert.equal(selectNode([n("right")],"missing"),null);});
test("rank GPU headroom",()=>assert.equal(selectNode([n("a",{availableVramGB:1}),n("b",{availableVramGB:4})])?.id,"b"));
