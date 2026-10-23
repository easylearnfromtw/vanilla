import test from "node:test";
import assert from "node:assert/strict";
import { runCodeAnalysis } from "../src/lib/runCodeAnalysis.ts";
import { InMemoryAnalysisHistoryStore } from "../src/lib/codeAnalysisHistory.ts";

test("preview mode is offline and does not write history",async()=>{
 const store=new InMemoryAnalysisHistoryStore();
 const result=await runCodeAnalysis({repository:"owner/repo",revision:"abc",files:[{path:"src/a.ts",content:"eval(userInput)"}]},store);
 assert.equal(result.saved,false);
 assert.equal(result.snapshot.findings.length,1);
 assert.equal((await store.list("owner/repo")).length,0);
});
test("save mode records findings and reports resolved regressions",async()=>{
 const store=new InMemoryAnalysisHistoryStore();
 await runCodeAnalysis({repository:"owner/repo",revision:"a",mode:"save",files:[{path:"src/a.ts",content:"eval(userInput)"}]},store);
 const next=await runCodeAnalysis({repository:"owner/repo",revision:"b",mode:"save",files:[{path:"src/a.ts",content:"const x=1;"}]},store);
 assert.equal(next.previousRevision,"a");
 assert.equal(next.trends[0]?.status,"resolved");
 assert.equal((await store.list("owner/repo")).length,2);
});
