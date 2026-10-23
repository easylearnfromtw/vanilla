import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleNode, rankInferenceNodes } from '../src/slime/inference-backend.ts';
const base = {id:'gpu',engine:'tensorrt_llm',modelIds:['october:sm'],trusted:true,authorized:true,healthy:true,deviceLocal:false,gpuVendor:'NVIDIA',driverCompatible:true,runtimeCompatible:true,modelCompatible:true,freeVramMiB:8000,requiredVramMiB:6000,latencyMs:200};
const request={modelId:'october:sm',privacy:'trusted_nodes'};
test('compatible and authorized NVIDIA node is eligible',()=>assert.equal(eligibleNode(base,request),true));
test('rejects unsupported driver, model, memory, or unauthorized nodes',()=>{
 for(const patch of [{driverCompatible:false},{modelCompatible:false},{freeVramMiB:1000},{authorized:false},{gpuVendor:'AMD'},{healthy:false}])
  assert.equal(eligibleNode({...base,...patch},request),false);
});
test('device-only mode never selects remote nodes',()=>{
 assert.equal(eligibleNode(base,{...request,privacy:'device_only'}),false);
 assert.equal(eligibleNode({...base,engine:'webllm',deviceLocal:true},{...request,privacy:'device_only'}),true);
});
test('trusted-nodes privacy excludes cloud',()=>assert.equal(eligibleNode({...base,engine:'cloud'},request),false));
test('stable ranking uses preferred engine then latency',()=>{
 const nodes=[{...base,id:'slow',latencyMs:900},{...base,id:'fast',latencyMs:100},{...base,id:'ollama',engine:'ollama',latencyMs:10}];
 assert.deepEqual(rankInferenceNodes(nodes,{...request,preferredEngine:'tensorrt_llm'}).map(n=>n.id),['fast','slow','ollama']);
});
