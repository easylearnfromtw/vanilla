/** Vanilla Self-Build source-code gateway, deploy as a separate Cloudflare Worker.
 * Secrets (Worker, never Pages/GitHub): GITHUB_TOKEN, BUILDER_ACCESS_TOKEN
 * Vars: ALLOWED_ORIGIN=https://easylearnfromtw.github.io
 * No route can merge, deploy, force push, update main or access secrets.
 */
const ROOT="https://api.github.com/repos/easylearnfromtw/vanilla";
const ORIGIN="https://easylearnfromtw.github.io";
const PR_BRANCH="autobuild/";
const DENIED=/(?:^|\/)(?:auth|credentials?|secrets?|tokens?|keys?|security|trust-boundary|\.env)(?:\.|\/|$)|(?:\.config\.|^src\/version\.ts$|package(?:-lock)?\.json$)/i;
export const SOURCE_PATHS=[
 "src/builder/","src/cream/","src/noodles/","src/local-ai/","src/assistant/",
 "src/workspace/","src/library/","src/ai/","src/search/","src/release/","src/components/","tests/","docs/"
];
export function safeSourcePath(value){
 if(typeof value!=="string"||value.length>145||value.includes("..")||value.startsWith("/")||
  !/^[a-zA-Z0-9_./-]+$/.test(value)||value.split("/").some(p=>!p||p.startsWith("."))||
  !SOURCE_PATHS.some(p=>value.startsWith(p))||DENIED.test(value)||
  !/\.(?:ts|tsx|css|mjs|md)$/.test(value))throw Error("檔案路徑不在允許的程式／測試／文件區域");
 return value;
}
export function validatePatch(body){
 if(!body||typeof body!=="object")throw Error("無效的程式修改提案");
 const title=String(body.title||"").trim();
 if(title.length<6||title.length>120)throw Error("修改主題必須在 6～120 字元之內");
 const files=body.files;
 if(!Array.isArray(files)||!files.length||files.length>2)throw Error("每次迭代只能修改 1～2 個原始碼／測試檔");
 const paths=new Set(),normalized=[];
 for(const file of files){
  if(!file||typeof file!=="object")throw Error("檔案修改格式錯誤");
  const path=safeSourcePath(file.path);
  if(paths.has(path))throw Error("同一次迭代不能重複修改同個檔案");
  paths.add(path);
  if(typeof file.content!=="string"||file.content.length<8||file.content.length>25000)throw Error("每個檔案必須提供 8～25000 字元的完整內容");
  const expectedSha=file.expectedSha;
  if(expectedSha!==null&&!(typeof expectedSha==="string"&&/^[0-9a-f]{40}$/.test(expectedSha)))throw Error("必須附上讀取原始檔案的 Git blob SHA；建立新檔使用 null");
  if((/\.tsx?$/.test(path))&&/\b(?:eval\s*\(|new\s+Function\s*\(|dangerouslySetInnerHTML\s*=)/.test(file.content))throw Error("拒絕可疑的動態執行或不可信 HTML 插入");
  normalized.push({path,content:file.content,expectedSha});
 }
 return {title,files:normalized};
}
function response(value,status=200,origin=""){
 return new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...(origin?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{})}});
}
async function github(path,env,{method="GET",body,allow404=false}={}){
 const r=await fetch(ROOT+path,{method,headers:{
  Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28",
  ...(body?{"Content-Type":"application/json"}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 if(allow404&&r.status===404)return null;
 const data=await r.json().catch(()=>({message:"GitHub API 無法解析回應"}));
 if(!r.ok)throw Error("GitHub "+r.status+"："+String(data.message||"存取失敗").slice(0,160));
 return data;
}
function decodeText(raw){
 const bytes=Uint8Array.from(atob(String(raw).replace(/\s/g,"")),x=>x.charCodeAt(0));
 return new TextDecoder().decode(bytes);
}
function encodeText(text){
 const bytes=new TextEncoder().encode(text);let binary="";
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
}
async function source(path,ref,env){
 safeSourcePath(path);
 if(ref!==null&&!/^autobuild\/[a-z0-9-]{10,75}$/.test(ref))throw Error("只允許讀取 main 或 Self-Build 分支");
 const q=encodeURIComponent(ref||"main");
 const file=await github("/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref="+q,env,{allow404:true});
 if(!file)return {path,sha:null,content:null,ref:ref||"main"};
 if(file.type!=="file"||file.size>33000||file.encoding!=="base64")throw Error("不是可閱讀的小型原始碼檔案");
 return {path,sha:file.sha,content:decodeText(file.content),ref:ref||"main"};
}
async function getPR(num,env){
 if(!Number.isSafeInteger(num)||num<1||num>99999999)throw Error("PR 編號不合法");
 const pr=await github("/pulls/"+num,env);
 if(pr.base?.ref!=="main"||pr.head?.repo?.full_name!=="easylearnfromtw/vanilla"||
 !/^autobuild\/[a-z0-9-]{10,75}$/.test(String(pr.head?.ref||""))||
 pr.state!=="open"||pr.merged_at)throw Error("此 PR 並非可修改的 Self-Build 草稿");
 return pr;
}
async function verifyFiles(files,ref,env){
 for(const file of files){
  const found=await source(file.path,ref,env);
  if(found.sha!==file.expectedSha)throw Error("檔案 "+file.path+" 已被其他人修改；先重新讀取，避免覆寫");
 }
}
async function commitFiles(files,parent,env,title){
 const commit=await github("/git/commits/"+encodeURIComponent(parent),env);
 const tree=await github("/git/trees",env,{method:"POST",body:{base_tree:commit.tree.sha,
  tree:files.map(x=>({path:x.path,mode:"100644",type:"blob",content:x.content}))}});
 const fresh=await github("/git/commits",env,{method:"POST",body:{message:"feat(self-build): "+title.slice(0,65),tree:tree.sha,parents:[parent]}});
 return fresh.sha;
}
async function propose(payload,env){
 const validated=validatePatch(payload);
 const main=await github("/git/ref/heads/main",env),mainSha=main.object.sha;
 await verifyFiles(validated.files,null,env);
 const head=await commitFiles(validated.files,mainSha,env,validated.title);
 const branch=PR_BRANCH+Date.now().toString(36)+"-"+crypto.randomUUID().slice(0,12);
 await github("/git/refs",env,{method:"POST",body:{ref:"refs/heads/"+branch,sha:head}});
 const pr=await github("/pulls",env,{method:"POST",body:{
  title:"Self-Build: "+validated.title,
  head:branch,base:"main",draft:true,maintainer_can_modify:false,
  body:"## Vanilla Self-Build 自主程式改善草稿\n\n由已授權的使用者透過對話工作台提交。\n\n- 僅限白名單原始碼及測試檔；沒有更新 main\n- 尚未經人工審核；必須等待 CI 成功與使用者批准後才可合併\n- NOODLES 應依據實際回歸結果評估是否改善，不能單靠模型自評\n- 來源檔案與修改摘要請在 GitHub Diff 中審查"
 }});
 return {number:pr.number,url:pr.html_url,branch,sha:head,status:"pending",message:"已建立 GitHub Draft PR；正式網站尚未變更"};
}
async function revise(number,payload,env){
 const pr=await getPR(number,env);
 const data=validatePatch(payload);
 const commits=await github("/pulls/"+number+"/commits?per_page=15",env);
 if(!Array.isArray(commits)||commits.length>=3)throw Error("最多 2 次自動修正；請人工審核後建立新任務");
 await verifyFiles(data.files,pr.head.ref,env);
 const next=await commitFiles(data.files,pr.head.sha,env,data.title);
 await github("/git/refs/heads/"+encodeURIComponent(pr.head.ref),env,{method:"PATCH",body:{sha:next,force:false}});
 return {number,url:pr.html_url,branch:pr.head.ref,sha:next,status:"pending",message:"修正已提交至原 Draft PR，GitHub CI 將重新執行"};
}
/** Only objective TS/test failures can drive automated repair. Logs are untrusted.
 * Never relay full raw logs, authorization strings or arbitrary instructions to an AI.
 */
export function extractCIErrors(log){
 const lines=String(log).slice(-110000).split(/\r?\n/);
 const errors=[];const seen=new Set();
 for(const raw of lines){
  let line=raw.replace(/^\d{4}-\d\d-\d\dT[^ ]+Z\s*/,"").replace(/\x1b\[[\d;]*m/g,"").trim();
  if(!/\berror TS\d{4}\b|^not ok \d+\s*-|(?:^|\s)##\[error\]|\b(?:SyntaxError|TypeError|ReferenceError):/.test(line))continue;
  if(line.length>500)line=line.slice(0,500);
  line=line.replace(/(?:gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]+|GOCSPX-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{12,})/g,"[REDACTED]");
  line=line.replace(/(?:Authorization|Bearer|api[_-]?key|access[_-]?token)\s*[=:]\s*\S+/gi,"[REDACTED]");
  line=line.replace(/https?:\/\/\S+/g,"[URL]");
  if(!seen.has(line)){seen.add(line);errors.push({path:"CI",message:line,startLine:0});}
  if(errors.length>=10)break;
 }
 return errors;
}
async function jobCIErrors(run,env){
 const details=String(run.details_url||"");
 const match=/^https:\/\/github\.com\/easylearnfromtw\/vanilla\/actions\/runs\/\d+\/job\/(\d+)(?:[/?#]|$)/.exec(details);
 if(!match)return [];
 const url=ROOT+"/actions/jobs/"+match[1]+"/logs";
 const started=await fetch(url,{redirect:"manual",headers:{
  Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28"
 }});
 if(started.status!==302)return [];
 const location=started.headers.get("location");if(!location)return [];
 const destination=new URL(location);
 // GitHub currently delivers job logs through time-limited cloud storage links.
 // Do not follow arbitrary redirects or forward the GitHub PAT to log hosts.
 const host=destination.hostname.toLowerCase();
 if(destination.protocol!=="https:"||destination.username||destination.password||
  !(host.endsWith(".blob.core.windows.net")||
    host.endsWith(".githubusercontent.com")||
    host.endsWith(".amazonaws.com")))return [];
 const second=await fetch(destination.toString(),{redirect:"error",headers:{"Accept":"text/plain"}});
 if(!second.ok)return [];
 const length=Number(second.headers.get("Content-Length")||0);
 if(length>2000000)return [];
 const text=await second.text();
 return extractCIErrors(text);
}

async function diagnostics(number,env){
 const pr=await getPR(number,env);
 const checks=await github("/commits/"+pr.head.sha+"/check-runs?per_page=40",env);
 const runList=Array.isArray(checks.check_runs)?checks.check_runs:[];
 const relevant=runList.filter(x=>x.name==="frontend"||x.name==="build"||x.name==="deploy");
 let status="pending";
 if(relevant.some(x=>x.conclusion==="failure"||x.conclusion==="timed_out"||x.conclusion==="cancelled"))status="failed";
 else if(relevant.some(x=>x.name==="frontend"&&x.conclusion==="success"))status="passed";
 const summaries=relevant.slice(0,5).map(x=>({name:x.name,status:x.status,conclusion:x.conclusion,details:x.html_url}));
 const annotations=[];
 if(status==="failed"){
  for(const failure of relevant.filter(x=>x.conclusion==="failure").slice(0,2)){
   const errors=await github("/check-runs/"+failure.id+"/annotations?per_page=20",env).catch(()=>[]);
   if(Array.isArray(errors))for(const a of errors.slice(0,10))annotations.push({
    path:String(a.path||"").slice(0,150),message:String(a.message||"").slice(0,350),
    startLine:Number(a.start_line)||0
   });
   // GitHub often reports a failed TypeScript/test job without any annotations.
   // Retrieve only diagnostic lines from the known CI job, with no bearer token
   // forwarded to the storage redirect. Never use full logs as model context.
   if(!annotations.length)annotations.push(...await jobCIErrors(failure,env).catch(()=>[]));
  }
 }
 return {number,sha:pr.head.sha,url:pr.html_url,status,checks:summaries,annotations,
  message:status==="pending"?"等待 GitHub CI 完成":status==="passed"?"CI 通過；仍需在 GitHub 人工審核／合併": "CI 未通過；只能在 PR 分支上修正"};
}
export default{
 async fetch(req,env){
  const origin=req.headers.get("Origin")||"",allowed=env.ALLOWED_ORIGIN||ORIGIN;
  if(origin!==allowed)return response({error:"Origin not allowed"},403);
  const cors=origin;
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
   "Access-Control-Allow-Origin":cors,"Access-Control-Allow-Methods":"GET,POST,OPTIONS",
   "Access-Control-Allow-Headers":"Authorization,Content-Type","Access-Control-Max-Age":"1200","Vary":"Origin"
  }});
  if(!env.GITHUB_TOKEN||!env.BUILDER_ACCESS_TOKEN)return response({error:"GitHub bridge has no secrets configured"},503,cors);
  const auth=req.headers.get("Authorization")||"";
  if(auth!=="Bearer "+env.BUILDER_ACCESS_TOKEN)return response({error:"Not authorized"},401,cors);
  const url=new URL(req.url);
  try{
   if(req.method==="GET"&&url.pathname==="/health")return response({status:"ready",repo:"easylearnfromtw/vanilla",mode:"draft-pr-only"},200,cors);
   if(req.method==="GET"&&url.pathname==="/source"){
    const path=safeSourcePath(url.searchParams.get("path"));
    const id=url.searchParams.get("pr");
    const ref=id?(await getPR(Number(id),env)).head.ref:null;
    return response(await source(path,ref,env),200,cors);
   }
   if(req.method==="GET"&&url.pathname==="/status")return response(await diagnostics(Number(url.searchParams.get("pr")),env),200,cors);
   if(req.method==="POST"&&["/propose","/revise"].includes(url.pathname)){
    if(Number(req.headers.get("Content-Length")||0)>70000)return response({error:"Payload too large"},413,cors);
    const raw=await req.text();if(raw.length>70000)return response({error:"Payload too large"},413,cors);
    const body=JSON.parse(raw);
    const result=url.pathname==="/propose"?await propose(body,env):await revise(Number(url.searchParams.get("pr")),body,env);
    return response(result,201,cors);
   }
   return response({error:"Not found"},404,cors);
  }catch(e){
   return response({error:String(e instanceof Error?e.message:e).slice(0,250)},422,cors);
  }
 }
};
