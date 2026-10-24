import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {goResearchIntent,goResearchEvidence,goResearchFallback} from "../src/detroit/awesome-go-conversation.ts";
import {AWESOME_GO_REFERENCES} from "../src/detroit/awesome-go.ts";
import {goAuditDecision,goAuditEntry} from "../src/detroit/awesome-go-live.ts";
import {evaluateAwesomeRepo} from "../src/detroit/awesome-discovery.ts";
import {routeMessage} from "../src/assistant/chat-router.ts";

test("Go research is semantic and bounded; quotations and mutations do not trigger web",()=>{
 assert.equal(goResearchIntent("推薦 Slime 的 Go 套件"),"slime");
 assert.equal(goResearchIntent("評估 Ceres Go 通訊套件"),"ceres");
 assert.equal(goResearchIntent("比較 LUCA Go 監控技術"),"luca");
 assert.equal(goResearchIntent("Awesome Go 是什麼"),null);
 assert.equal(goResearchIntent("今天 go home"),null);
 assert.equal(goResearchIntent("原文如下：推薦 Slime 的 Go 套件"),null);
 assert.equal(goResearchIntent("幫我安裝 Go 套件"),null);
 assert.equal(routeMessage("推薦 Ceres 的 Go 通訊套件",{privateMode:true,hasCreamResult:false}).kind,"go-research");
});
test("evidence contains observed GitHub facts, not fake implementation receipts",()=>{
 const item=AWESOME_GO_REFERENCES.find(x=>x.id==="nats");
 const entry=goAuditEntry(item);
 const review=evaluateAwesomeRepo(entry,{stargazers_count:550,pushed_at:"2026-10-21T10:00:00Z",license:{spdx_id:"Apache-2.0"}});
 const audit=goAuditDecision(item,"ceres",review);
 const context=goResearchEvidence("ceres",[audit]);
 assert.match(context,/github.com\/nats-io\/nats-server/);
 assert.match(context,/2026-10-21/);
 assert.match(context,/Apache-2.0/);
 assert.match(context,/非套件執行/);
 assert.match(context,/不得當成通過/);
 assert.doesNotMatch(context,/已安裝成功|已部署完成/);
 const fallback=goResearchFallback("ceres",[audit]);
 assert.match(fallback,/沒有可用的生成模型/);
 assert.match(fallback,/沒有安裝 Go 套件/);
});
test("unverified index chapters remain unresolved and cannot claim release",()=>{
 const item=AWESOME_GO_REFERENCES.find(x=>x.id==="otellix");
 const unresolved={reference:item,role:"luca",status:"unresolved",reason:"只有章節連結"};
 const evidence=goResearchEvidence("luca",[unresolved]);
 assert.match(evidence,/unresolved/);
 assert.match(evidence,/只有章節連結/);
 assert.doesNotMatch(evidence,/授權：MIT/);
});
test("chat feeds metadata into the model and never treats Go research as a scripted Diana popup",()=>{
 const chat=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(chat,/case "go-research":/);
 assert.match(chat,/auditGoCandidates\(route.role\)/);
 assert.match(chat,/await answerWithModel\(question,\{inlineFileContext,webContext,webSources,toolEvidence:goEvidence\|\|undefined,factGuidance\}/);
 assert.match(chat,/if\(privateMode\|\|!online\)/);
 const ctx={privateMode:false,hasCreamResult:false,hasModel:true};
 assert.equal(routeMessage("推薦 Slime 的 Go 套件",ctx).kind,"go-research");
 assert.equal(routeMessage("Diana 是做什麼的",ctx).kind,"continue");
 assert.equal(routeMessage("Diana 是做什麼的",{...ctx,hasModel:false}).kind,"tool-knowledge");
 assert.equal(routeMessage("底特律有哪些工具",ctx).kind,"tool-knowledge");
});
