import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSourceFiles } from "../src/lib/algorithmCodeAnalyzer.ts";
import { compareSnapshots, InMemoryAnalysisHistoryStore } from "../src/lib/codeAnalysisHistory.ts";

test("recognizes binary search with grounded evidence",()=>{
 const r=analyzeSourceFiles("repo","a1",[{path:"search.ts",content:"let left=0, right=9;\nwhile (left <= right) {\n const mid = (left + right) >> 1;\n left++;\n}"}]);
 assert.equal(r.insights[0]?.pattern,"binary-search");
 assert.equal(r.insights[0]?.evidence[0]?.line,2);
});
test("reports eval with location and compares revisions",()=>{
 const a=analyzeSourceFiles("repo","a1",[{path:"x.ts",content:"eval(userInput)"}]).snapshot;
 const b=analyzeSourceFiles("repo","a2",[{path:"x.ts",content:"console.log('safe')"}]).snapshot;
 assert.equal(a.findings[0]?.line,1);
 assert.equal(compareSnapshots(a,b)[0]?.status,"resolved");
});
test("rejects unsafe and oversized files",()=>{
 const r=analyzeSourceFiles("repo","a",[{path:"../escape.ts",content:"eval(x)"},{path:"big.ts",content:"x".repeat(250001)}]);
 assert.equal(r.snapshot.findings.length,0);
 assert.equal(r.warnings.length,2);
});
test("memory store keeps snapshots within current session",async()=>{
 const store=new InMemoryAnalysisHistoryStore();
 const snapshot=analyzeSourceFiles("repo","a",[]).snapshot;
 await store.save(snapshot);
 assert.equal((await store.list("repo")).length,1);
});
