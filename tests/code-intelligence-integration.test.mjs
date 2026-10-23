import test from "node:test";
import assert from "node:assert/strict";
import {codeRevision,runCodeAnalysis} from "../src/lib/runCodeAnalysis.ts";
import {compareSnapshots,InMemoryAnalysisHistoryStore} from "../src/lib/codeAnalysisHistory.ts";
import {extractDependencyEdges} from "../src/lib/codeArchitecture.ts";
import {detroitBus,findDetroitCapability} from "../src/detroit/capability-bus.ts";
import {chooseDianaTool} from "../src/detroit/diana.ts";

test("source content fingerprints are stable regardless of file ordering",async()=>{
 const a=[{path:"x.ts",content:"const a=1"},{path:"y.ts",content:"const b=2"}];
 assert.equal(await codeRevision(a),await codeRevision([...a].reverse()));
 assert.notEqual(await codeRevision(a),await codeRevision([{path:"x.ts",content:"const a=3"},a[1]]));
});
test("partial rescans do not falsely resolve findings in unscanned files",()=>{
 const base={id:"1",repository:"owner/repo",revision:"old",createdAt:"2026-10-01T00:00:00Z",
  findings:[{ruleId:"dangerous-eval",path:"other.ts",line:1,severity:"high",title:"Dynamic eval call",explanation:"",suggestion:""}]};
 const next={id:"2",repository:"owner/repo",revision:"new",createdAt:"2026-10-02T00:00:00Z",
  findings:[],analyzedPaths:["current.ts"]};
 assert.deepEqual(compareSnapshots(base,next),[]);
});
test("architecture graph extracts static imports without executing dependencies",()=>{
 const edges=extractDependencyEdges([{path:"src/main.ts",content:"import {a} from './a';\nconst x = require('pkg')"}]);
 assert.deepEqual(edges.map(x=>x.to),["./a","pkg"]);
});
test("reanalysis is idempotent and doesn't append duplicate cloud snapshots",async()=>{
 const store=new InMemoryAnalysisHistoryStore();
 const files=[{path:"x.ts",content:"eval(x)"}],revision=await codeRevision(files);
 const request={repository:"owner/repo",revision,files,mode:"save"};
 assert.equal((await runCodeAnalysis(request,store)).saved,true);
 const again=await runCodeAnalysis(request,store);
 assert.equal(again.alreadySaved,true);
 assert.equal((await store.list("owner/repo")).length,1);
});
test("Detroit exposes read-only analysis with a separate cloud approval gate",async()=>{
 assert.equal(findDetroitCapability("code-intelligence")?.state,"local");
 assert.equal(detroitBus.isRunnable("code-intelligence"),true);
 const input={repository:"owner/repo",files:[{path:"x.ts",content:"eval(x)"}]};
 const done=await detroitBus.execute("code-intelligence",input,{privateMode:true});
 assert.equal(done.status,"completed");
 assert.equal(done.result.snapshot.findings.length,1);
 await assert.rejects(()=>detroitBus.execute("code-intelligence",{...input,mode:"save"},{privateMode:true,approved:true}),/CLOUD_APPROVAL/);
 await assert.rejects(()=>detroitBus.execute("code-intelligence",{...input,mode:"save"},{privateMode:false}),/CLOUD_APPROVAL/);
});
test("Diana opens Project Hub for code analysis, not the editing tool",()=>{
 const decision=chooseDianaTool("幫我分析 Vanilla 程式碼",{privateMode:false,hasCreamResult:false});
 assert.equal(decision.tool,"code-intelligence");
 assert.equal(decision.event,"vanilla-open-projects");
});
