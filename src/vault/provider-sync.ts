import {getConfigs,setProvider,removeProvider,type Provider,type ProviderConfig} from "./providers";
import {listVaultFiles} from "./drive";

const NAME="vanilla-provider-credentials-v1.json";
const API="https://www.googleapis.com/drive/v3/files";
type Doc={version:1;updatedAt:string;configs:ProviderConfig[]};
let activeToken="";
let running:Promise<void>|null=null;
function valid(x:unknown):x is ProviderConfig{
 if(!x||typeof x!=="object")return false;
 const c=x as Partial<ProviderConfig>;
 return (["gemini","deepseek","openai","anthropic","openrouter"] as string[]).includes(c.provider||"")&&
  (c.key==="managed:gas"||c.key==="managed:weiguo")&&typeof c.model==="string"&&c.model.length>0;
}
async function request(url:string,token:string,init:RequestInit={}):Promise<Response>{
 const res=await fetch(url,{...init,headers:{Authorization:"Bearer "+token,...init.headers}});
 if(!res.ok)throw new Error("Google Drive API "+res.status+(res.status===401?"：授權已過期，請重新連接 Google Drive":""));
 return res;
}
async function locate(token:string):Promise<string|undefined>{
 const files=await listVaultFiles(token);
 return files.find(f=>f.name===NAME)?.id;
}
async function download(token:string,id:string):Promise<Doc>{
 const res=await request(API+"/"+encodeURIComponent(id)+"?alt=media",token);
 const data:unknown=await res.json();
 if(!data||typeof data!=="object"||(data as Doc).version!==1||!Array.isArray((data as Doc).configs))throw new Error("Drive API 設定檔格式錯誤");
 return data as Doc;
}
async function upload(token:string,doc:Doc,id?:string):Promise<void>{
 if(id){
  await request("https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(id)+"?uploadType=media",token,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(doc)});
 }else{
  const boundary="vanilla_"+crypto.randomUUID().replaceAll("-","");
  const metadata=JSON.stringify({name:NAME,parents:["appDataFolder"],mimeType:"application/json"});
  const body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+metadata+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+JSON.stringify(doc)+"\r\n--"+boundary+"--";
  await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",token,{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body});
 }
}
export async function loadProviderConfigs(token:string):Promise<number>{
 activeToken=token;
 const id=await locate(token);
 if(!id){for(const p of ["gemini","deepseek","openai","anthropic","openrouter"] as Provider[])removeProvider(p);return 0;}
 const doc=await download(token,id);
 const incoming=doc.configs.filter(valid);
 for(const provider of ["gemini","deepseek","openai","anthropic","openrouter"] as Provider[]){
  const found=incoming.find(x=>x.provider===provider);
  if(found)setProvider(found);else removeProvider(provider);
 }
 return incoming.length;
}
export async function saveProviderConfigs(token:string):Promise<void>{
 activeToken=token;
 const id=await locate(token);
 await upload(token,{version:1,updatedAt:new Date().toISOString(),configs:getConfigs().filter(valid)},id);
}
export function stopProviderSync(){activeToken="";}
export function queueProviderSync(token:string):Promise<void>{
 activeToken=token;
 const task=async()=>{if(activeToken!==token)return;await saveProviderConfigs(token);};
 const next=(running??Promise.resolve()).catch(()=>{}).then(task);
 running=next;
 void next.finally(()=>{if(running===next)running=null;}).catch(()=>{});
 return next;
}
