import {authorizeDrive} from "../vault/google-auth";
const API="https://www.googleapis.com/drive/v3/files";
const UPLOAD="https://www.googleapis.com/upload/drive/v3/files";
const SESSION_KEY="vanilla.drive.session.v1";
const FOLDER="Vanilla Workspace";
export type WorkspaceFile={id:string;name:string;mimeType:string;modifiedTime?:string;size?:string;version?:string;webViewLink?:string;description?:string};
type Session={token:string;expiresAt:number;email:string};
export function driveSession():Session|null{
 try{const data=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null") as Session|null;
  return data?.token&&data.expiresAt>Date.now()+60000?data:null;
 }catch{return null;}
}
export async function connectWorkspaceDrive():Promise<Session>{
 const authorized=await authorizeDrive();
 const result=await fetch("https://www.googleapis.com/oauth2/v2/userinfo",{headers:{Authorization:"Bearer "+authorized.token}});
 if(!result.ok)throw Error("無法確認 Google 帳號，請重新授權");
 const profile=await result.json() as {email?:string};
 const session={token:authorized.token,expiresAt:authorized.expiresAt,email:profile.email||"已授權"};
 sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
 window.dispatchEvent(new Event("vanilla-drive-connected"));
 return session;
}
function bearer(token:string):HeadersInit{return {Authorization:"Bearer "+token};}
async function checked(res:Response):Promise<Response>{
 if(res.ok)return res;
 const raw=await res.text().catch(()=>"");
 if(res.status===401)throw Error("Google 授權已過期，請重新登入");
 if(res.status===403)throw Error("Google Drive 權限不足。請重新登入並允許 Vanilla 建立與管理所選檔案。"+(raw.includes("accessNotConfigured")?" 可能需要 Google Cloud 啟用 Drive API。":""));
 if(res.status===404)throw Error("找不到檔案，可能已移動、刪除或沒有存取權");
 throw Error("Google Drive "+res.status+"："+raw.slice(0,180));
}
async function request(token:string,url:string,init:RequestInit={}):Promise<Response>{
 return checked(await fetch(url,{...init,headers:{...bearer(token),...init.headers}}));
}
async function listQuery(token:string,q:string,fields:string):Promise<WorkspaceFile[]>{
 let pageToken="",out:WorkspaceFile[]=[];
 do{
  const url=new URL(API);
  url.searchParams.set("q",q);
  url.searchParams.set("fields","nextPageToken,files("+fields+")");
  url.searchParams.set("pageSize","100");
  url.searchParams.set("orderBy","modifiedTime desc");
  if(pageToken)url.searchParams.set("pageToken",pageToken);
  const res=await request(token,url.toString());
  const data=await res.json() as {files?:WorkspaceFile[];nextPageToken?:string};
  out=out.concat(data.files||[]);pageToken=data.nextPageToken||"";
 }while(pageToken&&out.length<500);
 return out;
}
export async function findWorkspaceFolder(token:string):Promise<string|undefined>{
 const escaped=FOLDER.replace(/'/g,"\\'");
 const matches=await listQuery(token,"name = '"+escaped+"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false","id,name,mimeType,modifiedTime");
 return matches[0]?.id;
}
export async function ensureWorkspaceFolder(token:string):Promise<string>{
 const existing=await findWorkspaceFolder(token);if(existing)return existing;
 const res=await request(token,API+"?fields=id",{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:FOLDER,mimeType:"application/vnd.google-apps.folder"})
 });
 const data=await res.json() as {id?:string};
 if(!data.id)throw Error("Google Drive 沒有回傳資料夾 ID");
 return data.id;
}
export async function listWorkspaceFiles(token:string):Promise<WorkspaceFile[]>{
 const folder=await findWorkspaceFolder(token);
 if(!folder)return [];
 return listQuery(token,"'"+folder.replace(/'/g,"\\'")+"' in parents and trashed = false","id,name,mimeType,modifiedTime,size,version,webViewLink,description");
}
export async function getWorkspaceMetadata(token:string,id:string):Promise<WorkspaceFile>{
 const res=await request(token,API+"/"+encodeURIComponent(id)+"?fields=id,name,mimeType,modifiedTime,size,version,webViewLink,description");
 return res.json() as Promise<WorkspaceFile>;
}
export async function getWorkspaceBlob(token:string,id:string):Promise<Blob>{
 const metadata=await getWorkspaceMetadata(token,id);
 if(metadata.mimeType.startsWith("application/vnd.google-apps."))throw Error("Google 原生文件請在 Google Docs／Sheets／Slides 中開啟");
 const res=await request(token,API+"/"+encodeURIComponent(id)+"?alt=media");
 return res.blob();
}
export async function getWorkspaceText(token:string,id:string):Promise<string>{
 const blob=await getWorkspaceBlob(token,id);
 if(blob.size>8*1024*1024)throw Error("文字檔超過 8 MB，請下載後在電腦開啟");
 return blob.text();
}
async function multipart(token:string,metadata:Record<string,unknown>,file:Blob,existing?:string):Promise<WorkspaceFile>{
 const boundary="vanilla_"+crypto.randomUUID().replaceAll("-","");
 const start="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: "+(file.type||"application/octet-stream")+"\r\n\r\n";
 const body=new Blob([start,file,"\r\n--"+boundary+"--"],{type:"multipart/related; boundary="+boundary});
 const endpoint=existing?UPLOAD+"/"+encodeURIComponent(existing):UPLOAD;
 const url=endpoint+"?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,version,webViewLink,description";
 const res=await request(token,url,{method:existing?"PATCH":"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body});
 return res.json() as Promise<WorkspaceFile>;
}
export async function uploadWorkspaceFile(token:string,name:string,file:Blob):Promise<WorkspaceFile>{
 if(file.size>15*1024*1024)throw Error("單一檔案上限 15 MB");
 const folder=await ensureWorkspaceFolder(token);
 const cleaned=name.trim().replace(/[\\/]/g,"_").slice(0,140);
 if(!cleaned)throw Error("檔名不能為空");
 return multipart(token,{name:cleaned,parents:[folder],description:"Created by Vanilla Workspace"},file);
}
export async function createWorkspaceText(token:string,name:string,text:string,mimeType="text/plain"):Promise<WorkspaceFile>{
 return uploadWorkspaceFile(token,name,new Blob([text],{type:mimeType+";charset=utf-8"}));
}
export async function updateWorkspaceText(token:string,file:WorkspaceFile,text:string):Promise<WorkspaceFile>{
 if(file.mimeType.startsWith("application/vnd.google-apps."))throw Error("Google 原生文件請在對應編輯器修改");
 const current=await getWorkspaceMetadata(token,file.id);
 if(file.version&&current.version&&file.version!==current.version)throw Error("雲端檔案已有其他修改，為避免覆蓋已停止儲存。請重新讀取或另存新檔。");
 const result=await request(token,UPLOAD+"/"+encodeURIComponent(file.id)+"?uploadType=media&fields=id,name,mimeType,modifiedTime,size,version,webViewLink",{
  method:"PATCH",headers:{"Content-Type":file.mimeType||"text/plain"},body:text
 });
 return result.json() as Promise<WorkspaceFile>;
}
export async function trashWorkspaceFile(token:string,file:WorkspaceFile):Promise<void>{
 const check=await getWorkspaceMetadata(token,file.id);
 if(file.version&&check.version&&file.version!==check.version)throw Error("檔案已由其他裝置更新，請重新整理後再刪除");
 await request(token,API+"/"+encodeURIComponent(file.id)+"?fields=id",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({trashed:true})});
}
export async function renameWorkspaceFile(token:string,file:WorkspaceFile,name:string):Promise<WorkspaceFile>{
 const check=await getWorkspaceMetadata(token,file.id);
 if(file.version&&check.version&&file.version!==check.version)throw Error("檔案已更新，請重新讀取後重新命名");
 const res=await request(token,API+"/"+encodeURIComponent(file.id)+"?fields=id,name,mimeType,modifiedTime,size,version,webViewLink",{
  method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:name.trim().slice(0,140)})
 });
 return res.json() as Promise<WorkspaceFile>;
}
export function isTextFile(file:WorkspaceFile):boolean{
 return /^text\//i.test(file.mimeType)||/\.(txt|md|csv|json|html|xml|css|js|ts|log)$/i.test(file.name)||file.mimeType==="application/json";
}
