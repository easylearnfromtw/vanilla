import test from "node:test";
import assert from "node:assert/strict";
import {parseAwesomeCatalog,parseAwesomeProjects,evaluateAwesomeRepo,awesomeIntegrationProposal} from "../src/detroit/awesome-discovery.ts";
import {chooseDianaTool,parseDianaInvocation} from "../src/detroit/diana.ts";
import {expandSlashCommand} from "../src/assistant/chat-router.ts";

const sample=[
 "## Contents",
 "- [Ignore](https://github.com/ignore/catalog)",
 "## Security",
 "- [Security](https://github.com/owner/awesome-security#readme) - Reviewed collection.",
 "- [Security](https://github.com/owner/awesome-security#readme) - Duplicated.",
 "## Front-End Development",
 "- [React](https://github.com/user/awesome-react#readme) - Component lists."
].join("\n");

test("Awesome catalog parses curated list without Contents or duplicates",()=>{
 const entries=parseAwesomeCatalog(sample);
 assert.equal(entries.length,2);
 assert.equal(entries[0].category,"Security");
 assert.equal(entries[0].url,"https://github.com/owner/awesome-security");
 assert.equal(entries[1].name,"React");
});
test("Topic README parsing extracts candidate repositories but not arbitrary hosts",()=>{
 const source=parseAwesomeCatalog(sample)[0];
 const projects=parseAwesomeProjects([
  "## Utilities",
  "- [Tool One](https://github.com/dev/tool-one) - Small package",
  "- [External](https://example.com/bad) - Not a GitHub repo",
  "- [Duplicate](https://github.com/dev/tool-one) - Repeat",
  "- [Self](https://github.com/owner/awesome-security) - Listing itself",
  "## Frameworks",
  "- [Tool Two](https://github.com/org/tool-two#readme) - Service"
 ].join("\n"),source);
 assert.equal(projects.length,2);
 assert.equal(projects[0].category,"Utilities");
 assert.equal(projects[1].repo,"tool-two");
});
test("Review never treats stars as license or proof of security",()=>{
 const entry=parseAwesomeCatalog(sample)[0];
 const review=evaluateAwesomeRepo(entry,{stargazers_count:8000,pushed_at:new Date().toISOString(),archived:true,license:{spdx_id:"NOASSERTION"}});
 assert.equal(review.license,"未確認");
 assert.ok(review.warnings.some(w=>w.includes("已封存")));
 assert.ok(review.warnings.some(w=>w.includes("授權")));
 assert.match(awesomeIntegrationProposal(review),/未下載、安裝、執行/);
 assert.match(awesomeIntegrationProposal(review),/LICENSE／NOTICE/);
});
test("Diana routes Awesome into Detroit but blocks private and offline requests",()=>{
 const normal={privateMode:false,hasCreamResult:false,online:true};
 assert.equal(parseDianaInvocation("@Awesome 找工具")?.forcedTool,"awesome");
 assert.equal(expandSlashCommand("/Awesome")?.text,"@Awesome");
 const choice=chooseDianaTool("探索 Awesome 開源工具清單",normal);
 assert.equal(choice.tool,"awesome");
 assert.equal(choice.kind,"open");
 assert.equal(choice.tab,"awesome");
 assert.equal(chooseDianaTool("開源資源探索",{...normal,privateMode:true}).kind,"report");
 assert.equal(chooseDianaTool("找開源工具",{...normal,online:false},"awesome").kind,"report");
});
