import test from "node:test";
import assert from "node:assert/strict";
import worker,{safeSourcePath,validatePatch,extractCIErrors} from "../services/self-build-github-worker/index.mjs";
import {parseCodePatch,safeCodePath,validateBridgeURL} from "../src/builder/autocode-client.ts";
import {noodlesIterationPlans} from "../src/noodles/iteration-plan.ts";
import {summarizeCodeDiff} from "../src/builder/code-diff.ts";

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

test("diagnostic extractor returns bounded compiler errors without exposing bearer/API secrets",()=>{
 const raw=[
  "2026-10-19T04:17:19.9280561Z ##[error]src/App.tsx(66,14): error TS2339: Property 'mode' does not exist",
  "2026-10-19T04:17:20Z Authorization=Bearer example-secret",
  "2026-10-19T04:17:20Z ##[error] sk-abc123456789012345678 secret at https://example.net/private",
  "not ok 6 - failing case",
  "A normal harmless information log"
 ].join("\n");
 const results=extractCIErrors(raw);
 assert.equal(results.length,3);
 assert.match(results[0].message,/TS2339/);
 assert.ok(results.every(x=>!x.message.includes("sk-abc123")&&!x.message.includes("https:\/\/example.net")&&!x.message.includes("Bearer example-secret")));
 assert.ok(results.every(x=>x.path==="CI"&&x.startLine===0));
});
test("Worker obtains redacted error evidence from real GitHub check job logs if annotations empty",async()=>{
 const originalFetch=globalThis.fetch;
 const seen=[];
 globalThis.fetch=async(url,init={})=>{
  const path=new URL(url).pathname,method=init.method||"GET";
  seen.push({path,auth:init.headers?.Authorization||""});
  if(path==="/evidence.txt")return new Response("2026-10-19T04:17:19Z ##[error]src/noodles/core.ts(23,7): error TS2322: sample type error",{status:200,headers:{"Content-Type":"text/plain"}});
  if(path.endsWith("/actions/jobs/445566/logs"))return new Response(null,{status:302,headers:{Location:"https://logs.example.blob.core.windows.net/evidence.txt"}});
  if(path.endsWith("/pulls/99"))return Response.json({number:99,state:"open",merged_at:null,base:{ref:"main"},head:{sha:sha4,ref:"autobuild/abc12345678900",repo:{full_name:"easylearnfromtw/vanilla"}}});
  if(path.endsWith("/commits/"+sha4+"/check-runs"))return Response.json({check_runs:[{id:66,name:"frontend",status:"completed",conclusion:"failure",details_url:"https://github.com/easylearnfromtw/vanilla/actions/runs/123/job/445566",html_url:"https://github.com/easylearnfromtw/vanilla/actions/runs/123"}]});
  if(path.endsWith("/check-runs/66/annotations"))return Response.json([]);
  throw Error("Unexpected request "+method+" "+path);
 };
 try{
  const req=new Request("https://gateway.example/status?pr=99",{headers:{Origin:origin,Authorization:"Bearer test-worker-token"}});
  const reply=await worker.fetch(req,credentials),data=await reply.json();
  assert.equal(reply.status,200);
  assert.equal(data.status,"failed");
  assert.equal(data.annotations.length,1);
  assert.match(data.annotations[0].message,/TS2322/);
  assert.ok(seen.find(x=>x.path==="/evidence.txt"&&x.auth===""),"External logs must never receive GitHub PAT");
  assert.ok(seen.find(x=>x.path.endsWith("/logs")&&x.auth==="Bearer test-github-token"));
 }finally{globalThis.fetch=originalFetch;}
});

test("review diff shows the actual changed region and source line numbers",()=>{
 const same=summarizeCodeDiff("a\nb\nc","a\nb\nc");
 assert.equal(same.unchanged,true);
 assert.equal(same.removed,0);
 assert.equal(same.added,0);
 const changed=summarizeCodeDiff("export const a=1;\nexport const b=2;\n","export const a=1;\nexport const b=3;\nexport const c=4;\n");
 assert.equal(changed.unchanged,false);
 assert.equal(changed.startLine,1);
 assert.ok(changed.before.includes("export const b=2;"));
 assert.ok(changed.after.includes("export const b=3;"));
 assert.ok(changed.after.includes("export const c=4;"));
});
