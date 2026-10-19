/** Project Hub public GitHub connector.
 * Code import is a read-only, non-executable indexing operation. Private repositories
 * require the owner's GitHub Worker; no PAT may be placed in Pages JS.
 */
export type ProjectRepo={name:string;fullName:string;description:string;defaultBranch:string;url:string;isPrivate:boolean};
export type ProjectPath={path:string;size:number;sha:string;type:string};
export type ProjectSource={id:string;owner:string;repo:string;path:string;sha:string;sourceURL:string;text:string;importedAt:string;size:number};
export const PROJECT_ACCOUNT="easylearnfromtw";
const ALLOWED=/\.(?:js|jsx|mjs|cjs|ts|tsx|html|css|py|json|md|txt|yml|yaml|vue|svelte|sql|go|rs|java|swift)$/i;
function repoName(repo:string):string{
 const normalized=repo.trim().toLowerCase();
 if(!/^[a-z0-9_.-]{1,100}$/.test(normalized)||normalized.startsWith("."))throw Error("GitHub 儲存庫名稱無效");
 return normalized;
}
function safePath(path:string):string{
 if(!path||path.length>220||path.includes("..")||path.startsWith("/")||
   path.split("/").some(x=>!x||x.startsWith("."))||!ALLOWED.test(path))throw Error("此路徑不支援安全的程式知識索引");
 return path;
}
async function github<T>(url:string):Promise<T>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{signal:controller.signal,credentials:"omit",mode:"cors",headers:{Accept:"application/vnd.github+json"}});
  if(!response.ok)throw Error("GitHub 公開 API HTTP "+response.status+(response.status===403?"（可能超出匿名 API 額度）":""));
  return await response.json() as T;
 }finally{clearTimeout(timer);}
}
export async function fetchProjectRepos():Promise<ProjectRepo[]>{
 const all=await github<Array<{name:string;full_name:string;description?:string|null;html_url:string;default_branch:string;private:boolean;archived?:boolean}>>(
  "https://api.github.com/users/"+PROJECT_ACCOUNT+"/repos?per_page=100&sort=updated");
 return all.filter(x=>!x.private&&!x.archived).map(x=>({name:x.name,fullName:x.full_name,description:x.description||"",
  defaultBranch:x.default_branch||"main",url:x.html_url,isPrivate:Boolean(x.private)})).sort((a,b)=>a.name.localeCompare(b.name));
}
export async function fetchProjectPaths(repo:string,branch="main"):Promise<ProjectPath[]>{
 const safe=repoName(repo);
 if(!/^[\w.-]{1,90}$/.test(branch))throw Error("不合法的 Git ref");
 const tree=await github<{tree?:{path:string;type:string;size?:number;sha:string}[];truncated?:boolean}>(
  "https://api.github.com/repos/"+PROJECT_ACCOUNT+"/"+encodeURIComponent(safe)+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1");
 if(tree.truncated)throw Error("GitHub 清單已截斷，為避免漏讀，請直接選取子資料夾或精簡專案");
 return (tree.tree||[]).filter(f=>f.type==="blob"&&typeof f.size==="number"&&f.size<=300000&&ALLOWED.test(f.path)&&
  !/(?:^|\/)(?:node_modules|dist|build|coverage|\.github|\.env|secrets?)(?:\/|$)/i.test(f.path))
  .map(f=>({path:f.path,sha:f.sha,size:f.size!,type:f.type})).slice(0,250);
}
export async function fetchProjectSource(repo:string,path:string,branch="main"):Promise<{text:string;sha:string;url:string;size:number}>{
 const safe=repoName(repo),clean=safePath(path);
 const data=await github<{content?:string;encoding?:string;sha?:string;size?:number}>(
  "https://api.github.com/repos/"+PROJECT_ACCOUNT+"/"+encodeURIComponent(safe)+"/contents/"+
  clean.split("/").map(encodeURIComponent).join("/")+"?ref="+encodeURIComponent(branch));
 if(data.encoding!=="base64"||!data.content||!data.sha||!Number.isFinite(data.size)||data.size!>300000)
  throw Error("GitHub 未回傳可讀取的程式文字（或檔案超過 300 KB）");
 const binary=atob(data.content.replace(/\s/g,""));
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const text=new TextDecoder().decode(bytes);
 if(text.length>300000||/\u0000/.test(text))throw Error("不支援大型或非文字二進位程式檔");
 return {text,sha:data.sha,url:"https://github.com/"+PROJECT_ACCOUNT+"/"+safe+"/blob/"+encodeURIComponent(branch)+"/"+clean,
  size:data.size!};
}
export type ApiTool={name:string;endpoint:string};
export function validateApiEndpoint(input:string):string{
 const url=new URL(input.trim());
 const hostname=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.username||url.password||url.hash||url.port||
  hostname==="localhost"||hostname.endsWith(".local")||hostname.endsWith(".internal")||
  /^\d+(?:\.\d+){3}$/.test(hostname)||hostname.startsWith("[")||hostname.endsWith(".localhost"))
  throw Error("API 必須是無內嵌帳密的公開 HTTPS 網址");
 return url.toString();
}
export async function callReadOnlyAPI(endpoint:string):Promise<{url:string;status:number;excerpt:string}>{
 const url=validateApiEndpoint(endpoint),controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const res=await fetch(url,{method:"GET",credentials:"omit",mode:"cors",redirect:"error",signal:controller.signal,
   headers:{Accept:"application/json, text/plain;q=0.8"}});
  if(!res.ok)throw Error("API HTTP "+res.status+"；需要授權的 API 應使用安全後端");
  const mime=res.headers.get("content-type")||"";
  if(!/(?:application\/json|text\/)/i.test(mime))throw Error("API 未提供文字／JSON 回應");
  const raw=await res.text();
  if(raw.length>150000)throw Error("API 回應過大，沒有把截斷內容冒充完整資料");
  return {url,status:res.status,excerpt:raw.slice(0,14000)};
 }finally{clearTimeout(timer);}
}
