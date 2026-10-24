import test from "node:test";
import assert from "node:assert/strict";
import {AWESOME_GO_REFERENCES} from "../src/detroit/awesome-go.ts";
import {goAuditEntry,goRoleCandidates,goAuditDecision,auditGoCandidates,goIntegrationTask} from "../src/detroit/awesome-go-live.ts";
import {evaluateAwesomeRepo} from "../src/detroit/awesome-discovery.ts";
import {readFileSync} from "node:fs";

test("only exact GitHub repo URLs are auditable, not Awesome index fragments",()=>{
 assert.equal(goAuditEntry(AWESOME_GO_REFERENCES.find(r=>r.id==="otellix")),null);
 assert.equal(goAuditEntry(AWESOME_GO_REFERENCES.find(r=>r.id==="ollamafarm")),null);
 assert.equal(goAuditEntry(AWESOME_GO_REFERENCES.find(r=>r.id==="syft")).repo,"syft");
 assert.ok(goRoleCandidates("slime").length>=2);
});
test("real GitHub audit calls only explicit target repositories and never references",async()=>{
 const called=[];
 const report=await auditGoCandidates("slime",{check:async(entry)=>{
  called.push(entry.url);
  return evaluateAwesomeRepo(entry,{stargazers_count:520,pushed_at:new Date().toISOString(),license:{spdx_id:"Apache-2.0"}});
 }});
 assert.equal(report.length,goRoleCandidates("slime").length);
 assert.ok(report.some(x=>x.status==="unresolved"));
 assert.ok(report.some(x=>x.status==="verified"));
 assert.equal(called.length,report.filter(x=>x.status==="verified").length);
 assert.ok(called.every(url=>!url.includes("#")));
 assert.ok(report.find(x=>x.status==="verified").checkedAt);
});
test("unknown license and archived repositories block Build handoff",()=>{
 const ref=AWESOME_GO_REFERENCES.find(x=>x.id==="syft");
 const entry=goAuditEntry(ref);
 const blocked=evaluateAwesomeRepo(entry,{stargazers_count:9000,pushed_at:new Date().toISOString(),archived:true,license:{spdx_id:"NOASSERTION"}});
 const result=goAuditDecision(ref,"quirinus",blocked);
 assert.equal(result.status,"blocked");
 assert.throws(()=>goIntegrationTask(result),/禁止產生/);
});
test("approved candidate yields a scoped engineering task, never execution",()=>{
 const ref=AWESOME_GO_REFERENCES.find(x=>x.id==="nats");
 const entry=goAuditEntry(ref);
 const review=evaluateAwesomeRepo(entry,{stargazers_count:1200,pushed_at:new Date().toISOString(),license:{spdx_id:"Apache-2.0"}});
 const task=goIntegrationTask(goAuditDecision(ref,"ceres",review));
 assert.match(task,/ceres_gateway/);
 assert.match(task,/request\/response/);
 assert.match(task,/GitHub Pages 不會執行 Go/);
 assert.match(task,/核准/);
 assert.ok(task.length<=1750);
});
test("mismatched GitHub response is rejected as a failed live audit",async()=>{
 const results=await auditGoCandidates("quirinus",{check:async(entry)=>evaluateAwesomeRepo({...entry,owner:"attacker"},{license:{spdx_id:"MIT"}})});
 assert.equal(results[0].status,"error");
 assert.match(results[0].reason,/身份/);
});
test("UI actually connects audit to user-approved Self-Build handoff",()=>{
 const panel=readFileSync(new URL("../src/detroit/AwesomeDiscoveryPanel.tsx",import.meta.url),"utf8");
 assert.match(panel,/auditGoCandidates\(goRole/);
 assert.match(panel,/vanilla-open-builder/);
 assert.match(panel,/goIntegrationTask\(audit\)/);
 assert.match(panel,/privateMode/);
});
