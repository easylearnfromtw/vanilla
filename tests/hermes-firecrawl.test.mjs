import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,dirname} from "node:path";
import {validateResearchURL,scrapeFirecrawl,clearFirecrawlEvidence,
        publishFirecrawlEvidence,firecrawlSelectedEvidence,firecrawlChatContext,searchFirecrawl,exportFirecrawlEvidenceJSONL}
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
 await assert.rejects(scrapeFirecrawl("https://docs.firecrawl.dev","fc-exampleKEY",badOrigin),/不同網域|不適合作為公開研究來源/);
});

test("Hermes multiple skill references remain opt-in and bounded",()=>{
 const code=readFileSync(join(root,"src/hermes/hermes-skills.ts"),"utf8");
 const view=readFileSync(join(root,"src/hermes/HermesSkillsPanel.tsx"),"utf8");
 assert.match(code,/MAX_SELECTED_HERMES_SKILLS=3/);
 assert.match(code,/export function toggleHermesSkill/);
 assert.match(code,/selectedHermesSkills\(\)\.slice/);
 assert.match(code,/if\(!id\|\|privateMode\)return ""/);
 assert.match(view,/selected\.includes\(s\.id\)/);
});
test("Firecrawl v2 scoped search distinguishes real page markdown from result snippets",async()=>{
 clearFirecrawlEvidence();
 let called=0;
 const request=async(url,options)=>{
  called++;
  assert.equal(url,"https://api.firecrawl.dev/v2/search");
  const body=JSON.parse(options.body);
  assert.equal(body.query,"Qwen3 research sources");
  assert.deepEqual(body.includeDomains,["docs.firecrawl.dev"]);
  assert.deepEqual(body.sources,["web"]);
  assert.ok(JSON.stringify(body.scrapeOptions).includes("markdown"));
  assert.equal(body.limit,3);
  return Response.json({success:true,data:{web:[
   {url:"https://docs.firecrawl.dev/full",title:"Full page",markdown:"# Full article\n"+ "full text ".repeat(12)},
   {url:"https://docs.firecrawl.dev/snippet",title:"Snippet",description:"Snippet only ".repeat(7)},
   {url:"https://hostile.invalid/page",title:"Injected result",markdown:"Bad result ".repeat(12)}
  ]}});
 };
 const found=await searchFirecrawl("Qwen3 research sources","docs.firecrawl.dev","fc-exampleKEY",request);
 assert.equal(called,1);
 assert.equal(found.length,2);
 assert.equal(found[0].kind,"full-page");
 assert.equal(found[1].kind,"search-snippet");
 assert.ok(found.every(x=>x.approvedForTraining===false));
 assert.equal(firecrawlChatContext(false),"","search results cannot silently enter model chat");
 assert.equal(firecrawlChatContext(true),"");
 await assert.rejects(searchFirecrawl("Qwen", "localhost","fc-exampleKEY",request),/HTTPS|公開/);
});
test("Firecrawl evidence export hashes each source and never claims training approval",async()=>{
 const samples=[
 {url:"https://docs.firecrawl.dev/full",title:"Full page",markdown:"A real page from Firecrawl ".repeat(7),capturedAt:1790000000000,provider:"Firecrawl",approvedForTraining:false,kind:"full-page"},
 {url:"https://docs.firecrawl.dev/snip",title:"Snippet",markdown:"Only a search snippet ".repeat(6),capturedAt:1790000000000,provider:"Firecrawl",approvedForTraining:false,kind:"search-snippet"}
 ];
 const text=await exportFirecrawlEvidenceJSONL(samples);
 const lines=text.trim().split("\n").map(JSON.parse);
 assert.equal(lines.length,2);
 for(const row of lines){
  assert.equal(row.training_approved,false);
  assert.equal(row.reviewed,false);
  assert.equal(row.trust,"external-untrusted-document");
  assert.match(row.id,/^ev_[a-f0-9]{24}$/);
  assert.match(row.content_sha256,/^[a-f0-9]{64}$/);
  assert.match(row.source_url,/^https:\/\//);
  assert.ok(!("apiKey" in row));
 }
 assert.equal(lines[0].provider,"firecrawl");
 assert.equal(lines[1].provider,"firecrawl-search");
 await assert.rejects(exportFirecrawlEvidenceJSONL([...samples,samples[0]]),/重複/);
 await assert.rejects(exportFirecrawlEvidenceJSONL([]),/1 至 5/);
});
