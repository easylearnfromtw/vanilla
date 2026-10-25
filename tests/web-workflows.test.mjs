import test from "node:test";
import assert from "node:assert/strict";
import {planConversationSave,composeSavedContent} from "../src/assistant/conversation-save.ts";
import {validatePublicPageURL,extractReadableText,linkReadingIntent,readBridgeURL} from "../src/search/web-reader.ts";

test("natural save commands persist the previous assistant answer, not a fake success message",()=>{
 const p=planConversationSave("把剛剛的回答存成檔案，叫做髖關節.md");
 assert.ok(p);assert.equal(p.scope,"last-answer");assert.equal(p.name,"髖關節.md");
 assert.equal(composeSavedContent(p,[{role:"user",content:"你是誰"},{role:"assistant",content:"Vanilla 解釋髖關節"}]),"Vanilla 解釋髖關節");
 assert.equal(planConversationSave("上次你說的檔案儲存在哪？"),null);
});
test("explicit save whole chat generates meaningful Markdown content",()=>{
 const p=planConversationSave("將這個對話儲存成檔案");
 assert.equal(p.scope,"conversation");
 const text=composeSavedContent(p,[{role:"user",content:"早安"},{role:"assistant",content:"你好"}]);
 assert.match(text,/## 使用者/);assert.match(text,/## Vanilla/);
 assert.throws(()=>composeSavedContent(p,[]),/沒有可以保存/);
});
test("web URL intent accepts arbitrary public domains and disallows private or tokenized destinations",()=>{
 assert.equal(linkReadingIntent("讀取這個網址 https://example.com/article?a=1"),"https://example.com/article?a=1");
 assert.equal(linkReadingIntent("幫我看 https://medium.com/a"),"https://medium.com/a");
 assert.equal(linkReadingIntent("https://example.com/"),"https://example.com/");
 assert.equal(validatePublicPageURL("https://www.openai.com/post#section"),"https://www.openai.com/post");
 for(const url of ["http://example.com","https://localhost:8443/a","https://127.0.0.1","https://192.168.1.1/a",
  "https://username:password@example.com","file:///etc/passwd","https://[::1]/"]){
  assert.throws(()=>validatePublicPageURL(url),undefined,url);
 }
});
test("reader extracts text and refuses to pretend partial content is full content",()=>{
 const p=extractReadableText("<html><head><title>研究測試</title><script>danger()</script></head><body><main>有來源的說明與結果</main></body></html>");
 assert.equal(p.title,"研究測試");
 assert.match(p.text,/有來源的說明/);
 assert.doesNotMatch(p.text,/danger/);
 assert.match(readBridgeURL("https://search.example.org/search","https://example.com/a"),/\/read\?url=/);
});
test("a deployed web worker requires origin + explicit bearer token",async()=>{
 const {default:worker}=await import("../services/web-research-worker/index.mjs");
 const env={ALLOWED_ORIGIN:"https://easylearnfromtw.github.io",WEB_READER_TOKEN:"test-token",BRAVE_API_KEY:"not-real"};
 const noOrigin=await worker.fetch(new Request("https://worker.example/search?q=hello"),env);
 assert.equal(noOrigin.status,403);
 const noAuth=await worker.fetch(new Request("https://worker.example/search?q=hello",{headers:{origin:env.ALLOWED_ORIGIN}}),env);
 assert.equal(noAuth.status,401);
 const preflight=await worker.fetch(new Request("https://worker.example/search",{method:"OPTIONS",headers:{origin:env.ALLOWED_ORIGIN}}),env);
 assert.equal(preflight.status,204);
});

import {parseScholarlyRankCsv,parseOpenAlexHits,isScholarlyQuery} from "../src/search/scholarly-discovery.ts";
test("academic intent routes scholarly questions, not ordinary weather",()=>{
 assert.equal(isScholarlyQuery("最新研究論文 經濟學"),true);
 assert.equal(isScholarlyQuery("arxiv artificial intelligence papers"),true);
 assert.equal(isScholarlyQuery("明天台北天氣"),false);
});
test("ranked OpenAlex hits retain arXiv preprint status, weight, and metadata claims",()=>{
 const ranks=parseScholarlyRankCsv([
  "ror,openalex_id,rank",
  "https://ror.org/01abcde12,,100",
  "https://ror.org/02abcde12,,350"
 ].join(String.fromCharCode(10)));
 const corpus={results:[
  {id:"https://openalex.org/W123",title:"Real Academic Paper",doi:"https://doi.org/10.1234/test",
   publication_year:2025,authorships:[{institutions:[{ror:"https://ror.org/01abcde12",type:"education",display_name:"Sample University"}]}],
   locations:[{landing_page_url:"https://arxiv.org/abs/2501.00123v2"}]},
  {id:"https://openalex.org/W124",title:"Other Paper",doi:"https://doi.org/10.1234/other",
   authorships:[{institutions:[{ror:"https://ror.org/02abcde12",type:"education"}]}]},
  {id:"https://openalex.org/W125",title:"Retracted",is_retracted:true}
 ]};
 const result=parseOpenAlexHits(corpus,ranks);
 assert.equal(result.length,2);
 assert.equal(result[0].citation_weight,5);
 assert.equal(result[0].provider,"arXiv");
 assert.equal(result[0].url,"https://arxiv.org/abs/2501.00123");
 assert.equal(result[1].citation_weight,3);
 assert.match(result[0].snippet,/預印本/);
 assert.doesNotMatch(result[0].snippet,/已讀取全文/);
});
test("low ranked literature retained and malformed CSV refused",()=>{
 const ranks=parseScholarlyRankCsv(["ror,openalex_id,rank","https://ror.org/01abcde12,,701"].join(String.fromCharCode(10)));
 const hits=parseOpenAlexHits({results:[{id:"https://openalex.org/W90",title:"Lower tier",
  authorships:[{institutions:[{ror:"https://ror.org/01abcde12",type:"education"}]}]}]},ranks);
 assert.equal(hits[0].citation_weight,1);
 assert.throws(()=>parseScholarlyRankCsv(["ror,rank","https://ror.org/01abcde12,1-100"].join(String.fromCharCode(10))));
});
