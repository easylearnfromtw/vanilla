import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,dirname} from "node:path";
import {validateResearchURL,scrapeFirecrawl,clearFirecrawlEvidence,
        publishFirecrawlEvidence,firecrawlSelectedEvidence,firecrawlChatContext}
 from "../src/firecrawl/firecrawl-research.ts";
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const manifest=JSON.parse(readFileSync(join(root,"src/hermes/hermes-skills-index.json"),"utf8"));
test("Hermes pin includes ALL main/optional official skill roots with no paths outside",()=>{
 assert.ok(manifest.skills.length>=200);
 assert.equal(manifest.skills.filter(x=>!x.optional).length,58);
 assert.equal(manifest.skills.filter(x=>x.optional).length,152);
 assert.match(manifest.revision,/^[a-f0-9]{40}$/);
 assert.equal(new Set(manifest.skills.map(x=>x.id)).size,manifest.skills.length);
 assert.ok(manifest.skills.every(x=>x.path.endsWith("/SKILL.md")&&
   (x.path.startsWith("skills/")||x.path.startsWith("optional-skills/"))&&
   !x.path.includes("..")&&x.github.includes("/"+manifest.revision+"/")));
});
test("untrusted Hermes source only supplies optional context, no self-executing shell privileges",()=>{
 const file=readFileSync(join(root,"src/hermes/hermes-skills.ts"),"utf8");
 const chat=readFileSync(join(root,"src/local-ai/LocalChat.tsx"),"utf8");
 assert.match(file,/Hermes shell expansion disabled/);
 assert.match(file,/readHermesSkill/);
 assert.match(file,/if\(!id\|\|privateMode\)return ""/);
 assert.match(chat,/activeHermesSkillContext\(privateMode\)/);
 assert.doesNotMatch(file,/eval\(|exec\(|child_process/);
});
test("Firecrawl only reaches explicitly approved public HTTPS targets",()=>{
 for(const input of ["http://example.com", "https://localhost", "https://127.0.0.1",
  "https://169.254.169.254", "https://files.internal", "https://user:secret@example.com",
  "file:///etc/passwd", "https://a..b.com"]){
  assert.throws(()=>validateResearchURL(input));
 }
 assert.equal(validateResearchURL("https://docs.firecrawl.dev/features").hostname,"docs.firecrawl.dev");
});
test("Firestore real scrape v2 request returns actual bounded content; no key saved",async()=>{
 let called=0;
 const request=async (url,options)=>{
  called++;
  assert.equal(url,"https://api.firecrawl.dev/v2/scrape");
  assert.equal(options.method,"POST");
  assert.equal(options.headers.Authorization,"Bearer fc-exampleKEY");
  assert.equal(JSON.parse(options.body).url,"https://docs.firecrawl.dev/article");
  return Response.json({success:true,data:{
   markdown:"# Real article\n"+"Real web text ".repeat(100),
   metadata:{sourceURL:"https://docs.firecrawl.dev/article",title:"Article"}}});
 };
 const doc=await scrapeFirecrawl("https://docs.firecrawl.dev/article","fc-exampleKEY",request);
 assert.equal(called,1);
 assert.equal(doc.approvedForTraining,false);
 assert.ok(doc.markdown.startsWith("# Real"));
 publishFirecrawlEvidence(doc);
 assert.equal(firecrawlSelectedEvidence()?.title,"Article");
 assert.ok(firecrawlChatContext(false).includes("docs.firecrawl.dev"));
 assert.equal(firecrawlChatContext(true),"");
 clearFirecrawlEvidence();
 assert.equal(firecrawlChatContext(false),"");
});
test("Firecrawl failed/incomplete responses do not create fake evidence or training sample",async()=>{
 const none=async ()=>Response.json({success:true,data:{markdown:""}});
 await assert.rejects(scrapeFirecrawl("https://docs.firecrawl.dev","fc-exampleKEY",none),/有效的網頁正文/);
 const badOrigin=async ()=>Response.json({success:true,data:{
  markdown:"x".repeat(80),metadata:{sourceURL:"https://attacker.example/swap"}}});
 await assert.rejects(scrapeFirecrawl("https://docs.firecrawl.dev","fc-exampleKEY",badOrigin),/不同網域/);
});
