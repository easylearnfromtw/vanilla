import {indexProjectSource,safeProjectPath,validateProjectRepo,
 type ProjectCorpus,type ProjectFileIndex,type APIDefinition} from "./project-core.ts";
export type GitHubOwnedRepo={name:string;full_name:string;description:string|null;default_branch:string;private:boolean};
export type GitHubFile={path:string;size:number;sha:string};
const API="https://api.github.com";
async function jsonFetch(url:string):Promise<unknown>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
 try{
  const result=await fetch(url,{mode:"cors",credentials:"omit",redirect:"error",
   headers:{Accept:"application/vnd.github+json"},signal:controller.signal});
  if(!result.ok)throw Error("GitHub HTTP "+result.status+(result.status===403?"（可能碰到公開 API 次數限制）":""));
  return result.json();
 }finally{clearTimeout(timer);}
}
export async function listOwnedPublicRepos():Promise<GitHubOwnedRepo[]>{
 const response=await jsonFetch(API+"/users/easylearnfromtw/repos?per_page=100&type=owner&sort=updated");
 if(!Array.isArray(response))throw Error("無法解析 GitHub 專案列表");
 return response.filter((x):x is GitHubOwnedRepo=>Boolean(x&&typeof x==="object"&&
  typeof (x as GitHubOwnedRepo).full_name==="string"&&
  (x as GitHubOwnedRepo).full_name.startsWith("easylearnfromtw/")&&
  (x as GitHubOwnedRepo).private===false)).map(x=>({
   name:x.name,full_name:x.full_name,description:x.description,default_branch:x.default_branch||"main",private:false
 })).slice(0,100);
}
export async function listRepoFiles(repository:string,branch="main"):Promise<GitHubFile[]>{
 const safe=validateProjectRepo(repository);
 if(!/^[A-Za-z0-9_.-]{1,80}$/.test(branch))throw Error("分支名稱不合法");
 const response=await jsonFetch(API+"/repos/"+safe+"/git/trees/"+encodeURIComponent(branch)+"?recursive=1") as
  {tree?:Array<{type?:string;path?:string;size?:number;sha?:string}>;truncated?:boolean};
 if(!Array.isArray(response.tree))throw Error("GitHub 無法列出原始碼檔案");
 return response.tree.filter(x=>x.type==="blob"&&typeof x.path==="string"&&typeof x.size==="number"&&
  x.size>0&&x.size<=350000).flatMap(x=>{
   try{safeProjectPath(x.path!);return [{path:x.path!,size:x.size!,sha:x.sha||""}];}catch{return [];}
 }).slice(0,350);
}
export async function readOwnedGitHubFile(repo:string,path:string,ref="main"):Promise<ProjectFileIndex>{
 const repository=validateProjectRepo(repo),safe=safeProjectPath(path);
 if(!/^[A-Za-z0-9_.-]{1,80}$/.test(ref))throw Error("分支名稱不合法");
 const data=await jsonFetch(API+"/repos/"+repository+"/contents/"+safe.split("/").map(encodeURIComponent).join("/")+
  "?ref="+encodeURIComponent(ref)) as {type?:string;encoding?:string;content?:string;sha?:string;size?:number};
 if(data.type!=="file"||data.encoding!=="base64"||!data.content||Number(data.size)>350000)throw Error("程式碼檔案太大、已加密或無法解析");
 const binary=atob(data.content.replace(/\s/g,""));
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 const text=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
 return indexProjectSource(repository,safe,text,data.sha);
}
export async function indexRepoSubset(repo:string,selected:GitHubFile[],owner:string,ref="main"):Promise<ProjectCorpus>{
 if(!owner)throw Error("必須辨識目前帳戶");
 if(!selected.length||selected.length>12)throw Error("每次索引需選 1 至 12 個可讀取的原始碼檔案");
 const files:ProjectFileIndex[]=[],warnings:string[]=[];
 for(const item of selected){
  try{files.push(await readOwnedGitHubFile(repo,item.path,ref));}
  catch(e){warnings.push(item.path+"："+String(e));}
 }
 if(!files.length)throw Error("所有選取的檔案都無法讀取，沒有建立虛構索引");
 return {id:crypto.randomUUID(),owner,repo:validateProjectRepo(repo),updatedAt:new Date().toISOString(),
  files,source:"github",warnings};
}
export async function inspectAPIPublicGET(def:APIDefinition,path:string):Promise<{url:string;content:string;type:string}>{
 if(!def.paths.some(x=>x.path===path&&x.method==="GET"))throw Error("不可呼叫未登錄的 GET 路徑");
 const url=def.origin+path;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
 try{
  const res=await fetch(url,{method:"GET",credentials:"omit",redirect:"error",mode:"cors",
   headers:{Accept:"application/json,text/plain;q=0.8"},signal:controller.signal});
  if(!res.ok)throw Error("API GET HTTP "+res.status);
  const type=(res.headers.get("content-type")||"").toLowerCase();
  if(!/(?:application\/json|text\/plain)/.test(type))throw Error("API 回傳不是可安全預覽的 JSON／純文字");
  if(Number(res.headers.get("content-length")||0)>120000)throw Error("API 回應超過本機 120 KB 限制");
  const text=await res.text();
  if(text.length>120000)throw Error("API 回應超過限制");
  return {url,content:text.slice(0,12000),type};
 }finally{clearTimeout(timer);}
}
