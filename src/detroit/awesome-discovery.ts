/** Awesome Discovery — read-only public GitHub research.
 * An Awesome list is a directory, not an installed package or a license grant.
 * Never execute third-party source, create PRs or transmit conversation data here.
 */
export type AwesomeEntry={name:string;description:string;category:string;url:string;owner:string;repo:string};
export type AwesomeReview={entry:AwesomeEntry;stars:number;updated:string;license:string;archived:boolean;fork:boolean;score:number;warnings:string[];recommendation:string;homepage:string};
const ROOT="https://raw.githubusercontent.com/sindresorhus/awesome/main/readme.md";
const GITHUB=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:[\/#?]|$)/i;
const MAX_README=900_000;
const MAX_ENTRIES=700;
let cache:AwesomeEntry[]|null=null;
function safeRepo(url:string):{owner:string;repo:string;url:string}|null{
 const match=GITHUB.exec(url);
 if(!match||match[1]==="."||match[2]==="."||match[2].endsWith(".git"))return null;
 const owner=match[1],repo=match[2];
 if(owner==="features"||repo==="issues"||repo==="pulls")return null;
 return {owner,repo,url:"https://github.com/"+owner+"/"+repo};
}
function plain(value:string):string{return value.replace(/<[^>]*>/g,"").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/\s+/g," ").trim().slice(0,260);}
export function parseAwesomeCatalog(markdown:string):AwesomeEntry[]{
 if(markdown.length>MAX_README)throw Error("索引內容異常過大");
 let category="",inside=false;
 const output:AwesomeEntry[]=[],seen=new Set<string>();
 for(const line of markdown.split(/\r?\n/)){
  const heading=/^## (.+?)\s*$/.exec(line);
  if(heading){category=plain(heading[1]);inside=category!=="Contents"&&category!=="Related";continue;}
  if(!inside||!category)continue;
  const item=/^\s*- \[([^\]]+)\]\((https:\/\/github\.com\/[^)\s]+)\)(?:\s*-\s*(.*))?\s*$/.exec(line);
  if(!item)continue;
  const repo=safeRepo(item[2]);if(!repo)continue;
  const key=(repo.owner+"/"+repo.repo).toLowerCase();if(seen.has(key))continue;
  seen.add(key);
  output.push({...repo,name:plain(item[1]),description:plain(item[3]||""),category});
  if(output.length>=MAX_ENTRIES)break;
 }
 return output;
}
export function parseAwesomeProjects(markdown:string,source:AwesomeEntry):AwesomeEntry[]{
 if(markdown.length>MAX_README)throw Error("清單內容異常過大");
 const seen=new Set<string>([(source.owner+"/"+source.repo).toLowerCase()]);
 const output:AwesomeEntry[]=[];
 let category=source.name;
 for(const line of markdown.split(/\r?\n/)){
  const section=/^#{2,4}\s+(.+?)\s*$/.exec(line);
  if(section)category=plain(section[1]);
  const match=/^\s*(?:[-*+] |\d+\. )\[([^\]]+)\]\((https:\/\/github\.com\/[^)\s]+)\)(?:\s*[-–:]\s*(.*))?\s*$/.exec(line);
  if(!match)continue;
  const repo=safeRepo(match[2]);if(!repo)continue;
  const key=(repo.owner+"/"+repo.repo).toLowerCase();if(seen.has(key))continue;
  seen.add(key);
  output.push({...repo,name:plain(match[1]),description:plain(match[3]||""),category});
  if(output.length>=MAX_ENTRIES)break;
 }
 return output;
}
async function jsonOrText(url:string,type:"json"|"text",signal?:AbortSignal):Promise<unknown>{
 const controller=new AbortController();
 const cancel=()=>controller.abort();
 signal?.addEventListener("abort",cancel,{once:true});
 const timer=setTimeout(cancel,10000);
 try{
  const response=await fetch(url,{method:"GET",headers:{Accept:type==="json"?"application/vnd.github+json":"text/plain"},credentials:"omit",cache:"no-store",redirect:"error",signal:controller.signal});
  if(!response.ok)throw Error(response.status===403?"GitHub 查詢額度已滿，稍後重試":"GitHub HTTP "+response.status);
  const size=Number(response.headers.get("content-length")||0);
  if(size>MAX_README*2)throw Error("遠端資料超過上限");
  if(type==="text"){
   const data=await response.text();if(data.length>MAX_README)throw Error("遠端清單過大");
   return data;
  }
  return await response.json();
 }finally{clearTimeout(timer);signal?.removeEventListener("abort",cancel);}
}
export async function loadAwesomeCatalog(refresh=false,signal?:AbortSignal):Promise<AwesomeEntry[]>{
 if(cache&&!refresh)return cache;
 const source=await jsonOrText(ROOT,"text",signal);
 const parsed=parseAwesomeCatalog(String(source));
 if(parsed.length<50)throw Error("Awesome 清單格式變更或內容不完整");
 cache=parsed;
 return parsed;
}
export async function loadAwesomeProjects(source:AwesomeEntry,signal?:AbortSignal):Promise<AwesomeEntry[]>{
 const repo=safeRepo(source.url);
 if(!repo||repo.owner!==source.owner||repo.repo!==source.repo)throw Error("不支援的來源網址");
 const metadata=await jsonOrText("https://api.github.com/repos/"+encodeURIComponent(repo.owner)+"/"+encodeURIComponent(repo.repo)+"/readme","json",signal) as {content?:string;encoding?:string;size?:number};
 if(metadata.encoding!=="base64"||!metadata.content||Number(metadata.size)>MAX_README)throw Error("原始專案未提供可解析的 README");
 const bytes=Uint8Array.from(atob(metadata.content.replace(/\s/g,"")),c=>c.charCodeAt(0));
 const raw=new TextDecoder().decode(bytes);
 return parseAwesomeProjects(raw,source);
}
type RepoMeta={stargazers_count?:number;pushed_at?:string;archived?:boolean;fork?:boolean;license?:{spdx_id?:string}|null;html_url?:string;full_name?:string};
export function evaluateAwesomeRepo(entry:AwesomeEntry,meta:RepoMeta):AwesomeReview{
 const warnings:string[]=[];
 const stars=Math.max(0,Number(meta.stargazers_count)||0);
 const last=meta.pushed_at?Date.parse(meta.pushed_at):NaN;
 const age=Number.isFinite(last)?Math.max(0,(Date.now()-last)/86400000):Infinity;
 const license=meta.license?.spdx_id&&meta.license.spdx_id!=="NOASSERTION"?meta.license.spdx_id:"未確認";
 if(meta.archived)warnings.push("專案已封存");
 if(meta.fork)warnings.push("此儲存庫是 fork，請確認上游");
 if(license==="未確認")warnings.push("未找到可確認的 SPDX 授權資訊，禁止直接整合");
 if(age>730)warnings.push("超過兩年未更新；請人工核對可維護性");
 if(!Number.isFinite(last))warnings.push("缺少最後推送日期");
 let score=30;
 if(stars>=1000)score+=17;else if(stars>=100)score+=10;else if(stars>=10)score+=4;
 if(age<=90)score+=23;else if(age<=365)score+=15;else if(age<=730)score+=6;
 if(license!=="未確認")score+=20;
 if(meta.archived)score-=35;
 if(meta.fork)score-=5;
 score=Math.max(0,Math.min(100,score));
 return {entry,stars,updated:meta.pushed_at||"",license,archived:!!meta.archived,fork:!!meta.fork,score,warnings,
  recommendation:meta.archived||license==="未確認"?"需先人工查核":score>=70?"值得進一步技術驗證":"建議謹慎評估",
  homepage:entry.url};
}
export async function reviewAwesomeRepo(entry:AwesomeEntry,signal?:AbortSignal):Promise<AwesomeReview>{
 const repo=safeRepo(entry.url);
 if(!repo||repo.owner!==entry.owner||repo.repo!==entry.repo)throw Error("GitHub 專案 URL 不合法");
 const data=await jsonOrText("https://api.github.com/repos/"+encodeURIComponent(repo.owner)+"/"+encodeURIComponent(repo.repo),"json",signal) as RepoMeta;
 if((data.full_name||"").toLowerCase()!==(repo.owner+"/"+repo.repo).toLowerCase())throw Error("GitHub 回傳專案身份不符");
 return evaluateAwesomeRepo(entry,data);
}
export function awesomeIntegrationProposal(review:AwesomeReview):string{
 const r=review.entry;
 return [
  "# Vanilla AI · 開源整合評估提案",
  "",
  "來源："+r.url,
  "項目："+r.name+"（"+r.owner+"/"+r.repo+"）",
  "分類："+r.category,
  "GitHub stars："+review.stars,
  "最近推送："+(review.updated||"未取得"),
  "偵測到的 SPDX 授權："+review.license+"（仍需逐檔檢查 LICENSE／NOTICE）",
  "初步可行性："+review.score+"/100；"+review.recommendation,
  "警示："+(review.warnings.length?review.warnings.join("；"):"無靜態警示；不代表安全"),
  "",
  "## 審核與整合流程",
  "1. 確認候選庫提供真正的可引用程式／API，而非僅為 Awesome 清單索引。",
  "2. 人工檢查 LICENSE、NOTICE、商標與外部依賴；保留法定授權聲明與署名。",
  "3. 將程式碼固定在審查過的 commit SHA，檢視 supply-chain／漏洞／授權；由 Quirinus 掃描。",
  "4. 先在隔離環境建立最小適配器，保持關閉預設、最小權限、無任意執行或自動下載。",
  "5. 提交 Self-Build PR，通過 TypeScript、單元／整合測試、人工審核後才能發布。",
  "",
  "此文件只是唯讀分析與整合提案；尚未下載、安裝、執行第三方程式，亦未部署外掛。"
 ].join("\n");
}
