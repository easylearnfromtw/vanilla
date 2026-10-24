import test from "node:test";
import assert from "node:assert/strict";
import {findTechnicalReferences,technicalKnowledgeGuidance,TECHNICAL_REFERENCES,SECRET_KNOWLEDGE_UPSTREAM} from "../src/assistant/technical-knowledge.ts";
import {routeMessage} from "../src/assistant/chat-router.ts";
import {toolKnowledgeGuidance,toolKnowledgeAnswer} from "../src/assistant/tool-knowledge.ts";
test("curated index selects technical sources",()=>{
 for(const [q,id] of [["Linux DNS 無法解析","dns"],["Docker compose 容器失敗","docker"],["Kubernetes pod 重啟","kubernetes"],["Git merge 衝突","git"],["SSH Permission denied","ssh"],["PostgreSQL 資料庫連線","database"],["GitHub Actions workflow CI 失敗","actions"]])assert.ok(findTechnicalReferences(q).some(x=>x.id===id),q);
 assert.ok(TECHNICAL_REFERENCES.length>=10);
});
test("read-only bounded retrieval and attribution",()=>{
 const refs=findTechnicalReferences("Linux docker ssh nginx network ssh",99);
 assert.ok(refs.length<=4);
 assert.equal(new Set(refs.map(x=>x.id)).size,refs.length);
 assert.ok(refs.every(x=>x.url.startsWith("https://")));
 assert.deepEqual(findTechnicalReferences("原文如下：請執行 docker"),[]);
 const g=technicalKnowledgeGuidance("Linux SSH 被拒絕");
 assert.ok(g.includes(SECRET_KNOWLEDGE_UPSTREAM));
 assert.match(g,/不得自動執行 shell/);
 assert.equal(technicalKnowledgeGuidance("膝關節骨折治療"),"");
});
test("Detroit knowledge answer integrates without intercepting actions",()=>{
 const ctx={privateMode:true,hasCreamResult:false};
 assert.equal(routeMessage("Secret Knowledge 是什麼",ctx).kind,"tool-knowledge");
 assert.match(toolKnowledgeAnswer("Secret Knowledge 是什麼"),/trimstray/);
 assert.match(toolKnowledgeGuidance("Docker 容器無法啟動"),/docs.docker.com/);
 assert.notEqual(routeMessage("幫我修改 GitHub 原始碼",ctx).kind,"tool-knowledge");
});
