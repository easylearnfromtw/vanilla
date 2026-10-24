/** Metadata-only discovery. Never execute, install, authorize or pay for discovered APIs. */
export const API_DIRECTORY_CATEGORIES=[
 {id:"open-source",label:"開源工具",path:"open-source-apis-84/README.md"},
 {id:"python",label:"Awesome Python · 函式庫",path:""},
 {id:"mcp",label:"MCP Servers",path:"mcp-servers-apis-289/README.md"},
 {id:"news",label:"新聞資料",path:"news-apis-537/README.md"},
 {id:"travel",label:"旅行資料",path:"travel-apis-493/README.md"},
] as const;
export type ApiDirectoryCategory=typeof API_DIRECTORY_CATEGORIES[number]["id"];
export type ApiCandidate={
 id:string;name:string;description:string;category:ApiDirectoryCategory;
 provider:"apify"|"github";listingUrl:string;source:"api-mega-list"|"awesome-python";subCategory?:string;
 cost:"unknown";authentication:"unknown";status:"unverified";executionEnabled:false;
};
export const API_DIRECTORY_REFERENCES=[
 {label:"API Mega List（Apify 目錄）",url:"https://github.com/cporter202/API-mega-list"},
 {label:"public-apis（其他公開 API）",url:"https://github.com/public-apis/public-apis"},
 {label:"Awesome Python（vinta）",url:"https://github.com/vinta/awesome-python"}
] as const;
const ROOT="https://raw.githubusercontent.com/cporter202/API-mega-list/main/";
const PYTHON_ROOT="https://raw.githubusercontent.com/vinta/awesome-python/master/README.md";
const MAX_CHARACTERS=600000;
const INJECTION=/(?:ignore (?:all |the )?(?:previous|prior) instructions|system\s*prompt|developer\s*message|忽略(?:先前|以上)(?:所有)?指令|傳送(?:token|金鑰|密碼))/i;
const clean=(text:string,n:number)=>text.replace(/<[^>]*>/g,"").replace(/[*\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
/** Only direct Apify actor listing URLs. Tracking parameters are deliberately dropped. */
export function sanitizeApiListingUrl(input:string):string|null{
 try{
  const u=new URL(input);
  if(u.protocol!=="https:"||u.hostname!=="apify.com"||u.port||u.username||u.password)return null;
  const m=/^\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,70})\/([a-zA-Z0-9][a-zA-Z0-9_.-]{0,100})\/?$/.exec(u.pathname);
  return m?"https://apify.com/"+m[1]+"/"+m[2]:null;
 }catch{return null;}
}
export function parseApiDirectoryMarkdown(markdown:string,category:ApiDirectoryCategory):ApiCandidate[]{
 if(!API_DIRECTORY_CATEGORIES.some(c=>c.id===category)||category==="python")throw Error("不支援的 API 目錄分類");
 if(markdown.length>MAX_CHARACTERS)throw Error("外部目錄過大，已拒絕解析");
 const output:ApiCandidate[]=[];const seen=new Set<string>();
 // Only data rows; never evaluate Markdown, execute scripts or follow catalogue links.
 const row=/^\|\s*\[([^\]\r\n]{1,140})\]\((https:\/\/apify\.com\/[^)\s]+)\)\s*\|\s*(.*?)\s*\|\s*$/gim;
 for(const m of markdown.matchAll(row)){
  const url=sanitizeApiListingUrl(m[2]);if(!url||seen.has(url))continue;
  const name=clean(m[1],100),description=clean(m[3],260);
  if(!name||INJECTION.test(name+" "+description))continue;
  seen.add(url);
  output.push({id:"apify:"+url.slice(18),name,description,category,provider:"apify",
   listingUrl:url,source:"api-mega-list",cost:"unknown",authentication:"unknown",
   status:"unverified",executionEnabled:false});
  if(output.length===250)break;
 }
 return output;
}

/** Normalize source links to direct, public GitHub repository homepages.
 * Never treat an index URL as an executable install target or an instruction.
 */
export function sanitizeGithubRepositoryUrl(input:string):string|null{
 try{
  const u=new URL(input);
  if(u.protocol!=="https:"||u.hostname!=="github.com"||u.port||u.username||u.password)return null;
  const m=/^\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,120})\/?$/.exec(u.pathname);
  if(!m||m[1]==="."||m[1]===".."||m[2]==="."||m[2]==="..")return null;
  const repo=m[2].replace(/\.git$/i,"");
  if(!repo)return null;
  return "https://github.com/"+m[1]+"/"+repo;
 }catch{return null;}
}
/** Parse projects only; never execute scripts or obey commands from Markdown. */
export function parsePythonToolMarkdown(markdown:string):ApiCandidate[]{
 if(markdown.length>MAX_CHARACTERS)throw Error("外部目錄過大，已拒絕解析");
 const start=markdown.search(/^## Projects\s*$/m);
 if(start<0)throw Error("Awesome Python 缺少專案區塊，來源格式可能已改變");
 const seen=new Set<string>(),output:ApiCandidate[]=[];
 let group="";
 for(const line of markdown.slice(start).split(/\r?\n/).slice(1)){
  if(/^## (?!#)/.test(line))break;
  const heading=/^###\s+(.+?)\s*$/.exec(line);
  if(heading){group=clean(heading[1],90);continue;}
  if(!group)continue;
  const match=/^\s{0,8}-\s+\[([^\]\r\n]{1,120})\]\((https:\/\/github\.com\/[^)\s]+)\)\s+-\s+(.+)$/i.exec(line);
  if(!match)continue;
  const url=sanitizeGithubRepositoryUrl(match[2]);
  if(!url||seen.has(url.toLowerCase()))continue;
  const name=clean(match[1],100),description=clean(match[3],260);
  if(!name||!description||INJECTION.test(name+" "+description))continue;
  seen.add(url.toLowerCase());
  output.push({id:"github:"+url.slice("https://github.com/".length).toLowerCase(),
   name,description,category:"python",subCategory:group,provider:"github",
   listingUrl:url,source:"awesome-python",cost:"unknown",authentication:"unknown",
   status:"unverified",executionEnabled:false});
  if(output.length>=900)break;
 }
 return output;
}

export async function fetchApiDirectory(category:ApiDirectoryCategory,opts:{
 privateMode:boolean;online:boolean;fetcher?:typeof fetch
}):Promise<ApiCandidate[]>{
 if(opts.privateMode)throw Error("私人模式不會連線外部 API 目錄");
 if(!opts.online)throw Error("裝置離線，無法同步");
 const info=API_DIRECTORY_CATEGORIES.find(c=>c.id===category);
 if(!info)throw Error("不支援的目錄分類");
 const res=await (opts.fetcher??fetch)(category==="python"?PYTHON_ROOT:ROOT+info.path,{
  method:"GET",credentials:"omit",redirect:"error",referrerPolicy:"no-referrer",cache:"no-store"
 });
 if(!res.ok)throw Error("來源回傳 HTTP "+res.status);
 const size=Number(res.headers.get("content-length"));
 if(Number.isFinite(size)&&size>MAX_CHARACTERS)throw Error("外部目錄超過安全大小上限");
 const content=await res.text();
 return category==="python"?parsePythonToolMarkdown(content):parseApiDirectoryMarkdown(content,category);
}
export function searchApiCandidates(candidates:readonly ApiCandidate[],query:string,limit=30):ApiCandidate[]{
 const tokens=query.trim().toLowerCase().slice(0,100).split(/\s+/).filter(Boolean);
 return candidates.map((x,index)=>{
  const title=x.name.toLowerCase(),other=(x.description+" "+x.category+" "+(x.subCategory??"")).toLowerCase();
  const matched=tokens.every(t=>title.includes(t)||other.includes(t));
  const score=tokens.reduce((n,t)=>n+(title.includes(t)?4:other.includes(t)?1:0),0);
  return {x,index,matched,score};
 }).filter(x=>x.matched).sort((a,b)=>b.score-a.score||a.index-b.index)
  .slice(0,Math.min(50,Math.max(0,limit))).map(x=>x.x);
}
export function reviewApiCandidate(candidate:ApiCandidate){
 const str=(candidate.name+" "+candidate.description).toLowerCase();
 const group=(candidate.subCategory??"").toLowerCase();
 if(candidate.source==="awesome-python"){
  const recommendedEngine=/(local llm|llm serving|distributed computing|model serving)/i.test(group)?"slime":
   /(security|penetration|cryptography|code analysis|testing|debugging)/i.test(group)?"quirinus":
   /(data analysis|data validation|data visualization|machine learning|science)/i.test(group)?"cream":
   /(ai and agents|model context protocol|orchestration|llm)/i.test(group)?"diana":"zeus";
  return {allowedToExecute:false as const,recommendedEngine,checks:[
   "Diana／Zeus：僅提供適用性與派工建議，不能自動安裝或調用套件",
   "Athena／Quirinus：第三方程式尚未完成惡意程式、相依套件及供應鏈審查",
   "授權／版本：尚未逐項確認 LICENSE、維護情況、Python 版本與安全公告",
   "環境：Vanilla 是瀏覽器 TypeScript PWA，Python 套件通常需要獨立隔離的後端或節點",
   "隱私與成本：不可傳送私人對話、套件憑證或自動建立付費工作",
   "執行前必須取得擁有者明確核准、隔離執行並提供測試與可稽核回執"
  ]};
 }
 const recommendedEngine=/(dataset|analytics|statistic|analysis|price|finance|data query|統計|數據)/i.test(str)?
  "cream":candidate.category==="mcp"?"zeus":"scouts";
 return {allowedToExecute:false as const,recommendedEngine,checks:[
  "Athena：尚未完成第三方程式、安全及提示注入審查",
  "費用／配額：未知；禁止預設啟用計費",
  "憑證：未知；API Key 不可放在 PWA、公開 GitHub 或目錄檔",
  "授權、個資及服務條款：尚未完成逐項確認",
  "Zeus：目前僅提供來源搜尋與派工建議，不執行外部 API"
 ]};
}

