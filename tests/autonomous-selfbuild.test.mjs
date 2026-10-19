import test from "node:test";
import assert from "node:assert/strict";
import worker,{safeSourcePath,validatePatch} from "../services/self-build-github-worker/index.mjs";
import {parseCodePatch,safeCodePath,validateBridgeURL} from "../src/builder/autocode-client.ts";
import {noodlesIterationPlans} from "../src/noodles/iteration-plan.ts";

const origin="https://easylearnfromtw.github.io";
const credentials={ALLOWED_ORIGIN:origin,BUILDER_ACCESS_TOKEN:"test-worker-token",GITHUB_TOKEN:"test-github-token"};
const sha1="1".repeat(40),sha2="2".repeat(40),sha3="3".repeat(40),sha4="4".repeat(40);
const source={path:"src/noodles/core.ts",sha:sha1,content:"export const score = 1;",ref:"main"};
test("only approved source directories can be changed; secrets, CI and code-execution bypass blocked",()=>{
 for(const path of ["src/noodles/core.ts","src/cream/core.ts","tests/regression.test.mjs","docs/CHANGELOG.md"])
  assert.equal(safeSourcePath(path),path);
 for(const path of [".github/workflows/pages.yml","src/vault/google-auth.ts","src/security/trust-boundary.ts",
  "src/ai/tokens.ts","src/version.ts","package.json","src/../../.github/workflows/ci.yml",
  "src/builder/eval.ts/../../keys.ts","src/local-ai/engine.config.ts","/etc/passwd","src/noodles/not_a_secret.env"]){
  assert.throws(()=>safeSourcePath(path),undefined,path);
  assert.throws(()=>safeCodePath(path),undefined,path);
 }
 assert.throws(()=>validatePatch({title:"valid change",files:[{path:"src/noodles/core.ts",content:"eval(user)",expectedSha:sha1}]}),/動態執行/);
 assert.throws(()=>validatePatch({title:"valid change",files:[{path:"src/noodles/core.ts",content:"export const a=1;",expectedSha:"fake"}]}),/blob SHA/);
});
test("browser refuses invented or extra AI files and leaves source unchanged",()=>{
 const original={...source};
 const good='{"title":"Improve routing tests","files":[{"path":"src/noodles/core.ts","content":"export const score = 2;"}]}';
 const p=parseCodePatch(good,source);
 assert.deepEqual(p.files,[{path:source.path,content:"export const score = 2;",expectedSha:sha1}]);
 assert.deepEqual(source,original);
 for(const text of [
  '{"title":"Try editing secrets","files":[{"path":"src/vault/google-auth.ts","content":"export const x=2;"}]}',
  '{"title":"Change no files","files":[]}',
  '{"title":"No changes here","files":[{"path":"src/noodles/core.ts","content":"export const score = 1;"}]}',
  'I updated code successfully'
 ])assert.throws(()=>parseCodePatch(text,source));
});
test("Self-Build Worker URLs must be public HTTPS and never embed credentials",()=>{
 assert.equal(validateBridgeURL("https://vanilla-builder.example.workers.dev/"),"https://vanilla-builder.example.workers.dev");
 for(const url of ["http://example.org","https://localhost","https://127.0.0.1/a","https://name:pass@example.org","https://x.org/?token=abc"])
  assert.throws(()=>validateBridgeURL(url),undefined,url);
});
test("worker refuses requests without authorized origin, bearer token or secrets",async()=>{
 let response=await worker.fetch(new Request("https://gateway.example/health"),credentials);
 assert.equal(response.status,403);
 response=await worker.fetch(new Request("https://gateway.example/health",{headers:{Origin:origin}}),credentials);
 assert.equal(response.status,401);
 response=await worker.fetch(new Request("https://gateway.example/health",{headers:{Origin:origin,Authorization:"Bearer test-worker-token"}}),{ALLOWED_ORIGIN:origin});
 assert.equal(response.status,503);
 response=await worker.fetch(new Request("https://gateway.example/health",{headers:{Origin:origin,Authorization:"Bearer test-worker-token"}}),credentials);
 assert.equal(response.status,200);
 assert.equal((await response.json()).mode,"draft-pr-only");
});
test("actual PR backend creates a new branch off main, and cannot commit directly to main",async()=>{
 const originalFetch=globalThis.fetch;
 const requests=[];
 globalThis.fetch=async(url,init={})=>{
  const uri=new URL(url);
  requests.push({pathname:uri.pathname,method:init.method||"GET",body:init.body?JSON.parse(init.body):undefined});
  const pathname=uri.pathname;
  let value={};
  if(pathname.endsWith("/git/ref/heads/main"))value={object:{sha:sha1}};
  else if(pathname.includes("/contents/"))value=null;
  else if(pathname.endsWith("/git/commits/"+sha1))value={tree:{sha:sha2}};
  else if(pathname.endsWith("/git/trees"))value={sha:sha3};
  else if(pathname.endsWith("/git/commits")&&init.method==="POST")value={sha:sha4};
  else if(pathname.endsWith("/git/refs"))value={ref:"refs/heads/autobuild/example"};
  else if(pathname.endsWith("/pulls"))value={number:123,html_url:"https://github.com/easylearnfromtw/vanilla/pull/123"};
  else throw Error("Unexpected GitHub request "+pathname);
  return new Response(JSON.stringify(value||{message:"Not Found"}),{status:value?200:404,headers:{"Content-Type":"application/json"}});
 };
 try{
  const payload={title:"Improve system quality",files:[{path:"src/noodles/core.ts",content:"export const score = 2;",expectedSha:null}]};
  const req=new Request("https://gateway.example/propose",{method:"POST",headers:{Origin:origin,Authorization:"Bearer test-worker-token","Content-Type":"application/json"},body:JSON.stringify(payload)});
  const response=await worker.fetch(req,credentials);
  const data=await response.json();
  assert.equal(response.status,201,JSON.stringify(data));
  assert.equal(data.number,123);
  assert.match(data.branch,/^autobuild\//);
  assert.equal(requests.filter(x=>x.pathname.endsWith("/git/refs")&&x.method==="POST").length,1);
  assert.equal(requests.some(x=>/\/git\/refs\/heads\/main/.test(x.pathname)),false);
  assert.equal(requests.some(x=>/\/merges/.test(x.pathname)),false);
  const pr=requests.find(x=>x.pathname.endsWith("/pulls"));
  assert.equal(pr.body.draft,true);
  assert.equal(pr.body.base,"main");
  assert.equal(pr.body.head,data.branch);
 }finally{globalThis.fetch=originalFetch;}
});
test("NOODLES turns repeated confirmed issues into bounded proposals, not automatic commits",()=>{
 const initial={version:1,enabled:true,observations:[
  {at:Date.now(),kind:"issue",task:"analysis",model:"gemini:test",issue:"no_sources"},
  {at:Date.now(),kind:"issue",task:"analysis",model:"gemini:test",issue:"no_sources"},
  {at:Date.now(),kind:"issue",task:"code",model:"local:test",issue:"bad_format"}
 ]};
 const proposals=noodlesIterationPlans(initial);
 assert.equal(proposals.length,1);
 assert.equal(proposals[0].path,"src/search/live-search.ts");
 assert.equal(noodlesIterationPlans({...initial,enabled:false}).length,0);
});
