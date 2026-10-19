import {inspectExternalText,wrapExternalText} from "../security/trust-boundary";
import {driveSession,listWorkspaceFiles,createWorkspaceText,getWorkspaceText,getWorkspaceBlob,updateWorkspaceText,uploadWorkspaceFile,trashWorkspaceFile,getWorkspaceMetadata,DriveFileNotFoundError,type WorkspaceFile} from "../workspace/cloud-drive";

export type MemoryKind="note"|"image"|"video"|"file"|"website"|"chat";
export type MemoryRecord={
 version:1;id:string;kind:MemoryKind;title:string;description:string;sourceUrl?:string;
 fileId?:string;fileName?:string;fileMimeType?:string;
 createdAt:string;updatedAt:string;labels:string[];ownerEmail:string;
};
const PREFIX="vanilla-memory-";
const MAX_RESULTS=80;
const SUMMARY_MAX=8000;
let cached:{email:string;at:number;records:MemoryRecord[]}|null=null;
export function currentMemoryAccount(){return driveSession()?.email||"";}
function session(){
 const item=driveSession();if(!item)throw Error("請先使用 Google 帳號登入；資料尚未儲存，請勿關閉頁面");
 return item;
}
function safeTitle(title:string){return title.replace(/[\\/]/g,"_").trim().slice(0,120)||"未命名記憶";}
function validateRecord(raw:unknown):MemoryRecord|null{
 if(!raw||typeof raw!=="object")return null;
 const r=raw as Partial<MemoryRecord>;
 if(r.version!==1||typeof r.title!=="string"||typeof r.description!=="string"||typeof r.id!=="string")return null;
 if(!["note","image","video","file","website","chat"].includes(String(r.kind)))return null;
 return {
  version:1,id:r.id,kind:r.kind as MemoryKind,title:r.title.slice(0,120),
  description:r.description.slice(0,SUMMARY_MAX),
  sourceUrl:typeof r.sourceUrl==="string"?r.sourceUrl.slice(0,2000):undefined,
  fileId:typeof r.fileId==="string"?r.fileId:undefined,
  fileName:typeof r.fileName==="string"?r.fileName:undefined,
  fileMimeType:typeof r.fileMimeType==="string"?r.fileMimeType:undefined,
  createdAt:typeof r.createdAt==="string"?r.createdAt:"",
  updatedAt:typeof r.updatedAt==="string"?r.updatedAt:"",
  labels:Array.isArray(r.labels)?r.labels.filter((x):x is string=>typeof x==="string").slice(0,12):[],
  ownerEmail:typeof r.ownerEmail==="string"?r.ownerEmail:""
 };
}
async function saveRecord(entry:Omit<MemoryRecord,"version"|"id"|"createdAt"|"updatedAt"|"ownerEmail">):Promise<MemoryRecord>{
 const {token,email}=session(),now=new Date().toISOString();
 const record:MemoryRecord={...entry,version:1,id:crypto.randomUUID(),createdAt:now,updatedAt:now,ownerEmail:email};
 await createWorkspaceText(token,PREFIX+record.id+".json",JSON.stringify(record),"application/json");
 cached=null;
 window.dispatchEvent(new Event("vanilla-memory-changed"));
 return record;
}
export async function rememberText(content:string,title?:string,kind:MemoryKind="note"):Promise<MemoryRecord>{
 const description=content.trim();
 if(description.length<2||description.length>SUMMARY_MAX)throw Error("記憶文字長度必須在 2 至 8,000 字元之間");
 return saveRecord({kind,title:safeTitle(title||description.slice(0,45)),description,labels:[]});
}
export async function rememberURL(input:string,note=""):Promise<MemoryRecord>{
 let url:URL;
 try{url=new URL(input);}catch{throw Error("需要完整的 HTTPS 網址");}
 if(url.protocol!=="https:")throw Error("為安全起見，只保存 HTTPS 網址");
 if(url.username||url.password)throw Error("網址不能包含帳號或密碼");
 const host=url.hostname.toLowerCase();
 if(host==="localhost"||host.endsWith(".local")||/^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host))throw Error("不可從公開的 Vanilla 頁面擷取本機或內網網址");
 const kind:MemoryKind=/\.(?:mp4|webm|mov)(?:$|\?)/i.test(url.pathname)||/youtube\.com|youtu\.be|vimeo\.com/.test(host)?"video":"website";
 let title=url.hostname+url.pathname.slice(0,55);
 let description=note.trim().slice(0,SUMMARY_MAX);
 if(kind==="website"){
  // Best-effort direct browser retrieval. No secret proxy, no CORS bypass and no execution of page scripts.
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{
   const response=await fetch(url.toString(),{method:"GET",mode:"cors",credentials:"omit",redirect:"follow",signal:controller.signal});
   const mime=response.headers.get("content-type")||"";
   const length=Number(response.headers.get("content-length")||"0");
   if(response.ok&&/(?:text\/html|text\/plain|text\/markdown)/i.test(mime)&&length<1024*1024){
    const stream=response.body?.getReader();
    if(stream){
     const chunks:Uint8Array[]=[];let total=0;
     while(total<900000){
      const chunk=await stream.read();
      if(chunk.done)break;
      if(chunk.value){total+=chunk.value.byteLength;chunks.push(chunk.value);}
     }
     await stream.cancel().catch(()=>{});
     if(total<=900000){
      const bytes=new Uint8Array(total);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const raw=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
      const pageTitle=raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g," ").trim();
      if(pageTitle)title=pageTitle.slice(0,120);
      const readable=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
       .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
       .replace(/<[^>]*>/g," ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g," ")
       .replace(/\s+/g," ").trim().slice(0,5000);
      if(readable.length>60)description=(description?description+"\n":"")+"網站文字節錄（擷取成功，但未逐項查核真實性）："+readable;
     }
    }
   }
  }catch{
   // Expected when a third-party site disallows browser CORS or requires authentication.
  }finally{clearTimeout(timeout);}
 }
 if(!description)description=kind==="video"?
  "已保存影片連結；未下載或轉錄影片音訊，尚未取得完整字幕或內容":
  "僅儲存原始網址。對方網站可能限制瀏覽器擷取，尚未取得可用的文字內容";
 const inspection=kind==="website"?inspectExternalText(description,"web"):null;
 if(inspection?.blocked)description="網站文字含疑似 Prompt Injection，已隔離正文，不加入 AI 上下文。可保留來源網址供人工查看。";
 return saveRecord({kind,title:safeTitle(title),description:description.slice(0,SUMMARY_MAX),sourceUrl:url.toString(),labels:[kind==="video"?"影片連結":"網頁",...(inspection?.blocked?["安全隔離"]:[])]});
}

export async function rememberFile(file:File,description=""):Promise<MemoryRecord>{
 const {token}=session();
 if(file.size>15*1024*1024)throw Error("目前檔案保存上限為 15 MB。大型影片需要分段上傳功能，尚未支援");
 const saved=await uploadWorkspaceFile(token,file.name,file);
 const kind:MemoryKind=file.type.startsWith("image/")?"image":file.type.startsWith("video/")?"video":"file";
 let summary=description.trim();
 // Index extracted plain text only. PDFs and videos require separate parsers.
 if(!summary&&file.size<1024*1024&&(/^(text\/|application\/json)/.test(file.type)||/\.(md|txt|csv|json)$/i.test(file.name))){
  summary=(await file.text()).slice(0,SUMMARY_MAX);
 }
 if(!summary)summary="已儲存檔案。尚未完成內容解析；模型不能聲稱已讀過其全部內容";
 const inspected=inspectExternalText(summary,"document");
 if(inspected.blocked)summary="附件已保存在你的 Drive，但文字含疑似提示詞注入，已隔離索引，不會將可疑指令交給模型。";
 return saveRecord({kind,title:safeTitle(file.name),description:summary.slice(0,SUMMARY_MAX),fileId:saved.id,fileName:file.name,fileMimeType:file.type,labels:inspected.blocked?["安全隔離"]:[]});
}
async function allRecords():Promise<MemoryRecord[]>{
 const {token,email}=session();
 if(cached&&cached.email===email&&Date.now()-cached.at<60000)return cached.records;
 const files=await listWorkspaceFiles(token);
 const candidates=files.filter(x=>x.name.startsWith(PREFIX)&&x.name.endsWith(".json")).slice(0,MAX_RESULTS);
 const result:MemoryRecord[]=[];
 for(let i=0;i<candidates.length;i+=8){
  const group=await Promise.all(candidates.slice(i,i+8).map(async(file:WorkspaceFile)=>{
   try{return validateRecord(JSON.parse(await getWorkspaceText(token,file.id)) as unknown);}catch{return null;}
  }));
  for(const record of group){if(record&&record.ownerEmail===email)result.push(record);}
 }
 const sorted=result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 cached={email,at:Date.now(),records:sorted};
 return sorted;
}
export async function listMemories():Promise<MemoryRecord[]>{return allRecords();}
export async function searchMemories(query:string):Promise<MemoryRecord[]>{
 const records=await allRecords(),q=query.trim().toLocaleLowerCase();
 if(!q)return records.slice(0,20);
 const tokens=q.split(/[\s，,。；;]+/).filter(Boolean);
 return records.map(record=>{
  const hay=[record.title,record.description,record.labels.join(" "),record.sourceUrl||""].join(" ").toLocaleLowerCase();
  const score=(hay.includes(q)?5:0)+tokens.reduce((n,x)=>n+(record.title.toLocaleLowerCase().includes(x)?3:0)+(hay.includes(x)?1:0),0);
  return {record,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||b.record.createdAt.localeCompare(a.record.createdAt)).slice(0,10).map(x=>x.record);
}
export async function knowledgeContext(query:string):Promise<string>{
 const found=await searchMemories(query);
 if(!found.length)return "";
 return found.slice(0,4).map(x=>wrapExternalText(x.title+"："+x.description.slice(0,800)+(x.sourceUrl?" (來源："+x.sourceUrl+")":""),"memory")).join("\n\n");
}

export async function forgetMemory(query:string):Promise<MemoryRecord>{
 const {token}=session();
 // Memory UUIDs are not indexed as search text; resolve immutable IDs before title search.
 const records=await allRecords(),byId=records.find(x=>x.id===query.trim());
 const matches=byId?[byId]:await searchMemories(query);
 const exact=matches.filter(x=>x.title.toLocaleLowerCase()===query.trim().toLocaleLowerCase()||x.id===query.trim());
 const chosen=byId||(exact.length===1?exact[0]:matches.length===1?matches[0]:undefined);
 if(!chosen)throw Error(matches.length?"找到多筆符合的記憶，請輸入完整標題以免刪錯":"找不到符合的記憶");
 const files=await listWorkspaceFiles(token);
 const index=files.find(x=>x.name===PREFIX+chosen.id+".json");
 if(!index)throw Error("雲端記憶索引已不存在，未執行任何刪除");
 await trashWorkspaceFile(token,index);
 // Check both remote state (inside trashWorkspaceFile) and active workspace listing.
 if((await listWorkspaceFiles(token)).some(x=>x.id===index.id))throw Error("雲端記憶索引仍在 Drive 工作區，無法確認刪除");
 cached=null;
 window.dispatchEvent(new Event("vanilla-memory-changed"));
 return chosen;
}

/** Metadata changes are intentionally separate from source file modification. */
export async function updateMemoryDetails(id:string,patch:{title?:string;description?:string}):Promise<MemoryRecord>{
 const {token}=session(),items=await allRecords();
 const previous=items.find(x=>x.id===id);
 if(!previous)throw Error("找不到這個 Google 帳號的紀錄");
 const title=patch.title!==undefined?safeTitle(patch.title):previous.title;
 const description=patch.description!==undefined?patch.description.trim().slice(0,SUMMARY_MAX):previous.description;
 const inspection=inspectExternalText(description,"document");
 if(inspection.blocked)throw Error("修改文字包含疑似 Prompt Injection，已拒絕保存");
 const list=await listWorkspaceFiles(token),file=list.find(x=>x.name===PREFIX+id+".json");
 if(!file)throw Error("找不到記憶索引，未修改");
 const next:MemoryRecord={...previous,title,description,updatedAt:new Date().toISOString()};
 await updateWorkspaceText(token,file,JSON.stringify(next));
 cached=null;window.dispatchEvent(new Event("vanilla-memory-changed"));
 return next;
}
export async function previewMemoryAttachment(id:string):Promise<Blob>{
 const {token}=session(),items=await allRecords();
 const record=items.find(x=>x.id===id);
 if(!record?.fileId)throw Error("這筆記憶沒有實體附件");
 return getWorkspaceBlob(token,record.fileId);
}
export type MemoryAttachmentDeleteResult={
 record:MemoryRecord;
 original:"trashed"|"already-trashed"|"missing-or-inaccessible"|"untrusted-reference"|"no-attachment";
};
/** Remove a selected memory and its recorded original if its provenance is trustworthy.
 * A missing/inaccessible original must NEVER be reported as verified deleted:
 * we still remove the stale Vanilla index explicitly requested by the user.
 */
export async function forgetMemoryWithAttachment(id:string,deleteFile:boolean):Promise<MemoryAttachmentDeleteResult>{
 const {token}=session(),records=await allRecords(),item=records.find(x=>x.id===id);
 if(!item)throw Error("找不到這筆雲端記憶");
 let original:MemoryAttachmentDeleteResult["original"]="no-attachment";
 if(deleteFile&&item.fileId){
  try{
   // Direct immutable-ID lookup works after moving a file out of Vanilla Workspace.
   const source=await getWorkspaceMetadata(token,item.fileId);
   // Metadata JSON can be edited by users or imported; only delete files tagged as created
   // by Vanilla. Never use an untrusted index to trash an unrelated Drive document.
   if(source.description!=="Created by Vanilla Workspace")original="untrusted-reference";
   else if(source.trashed)original="already-trashed";
   else{
    await trashWorkspaceFile(token,source);
    original="trashed";
   }
  }catch(error){
   if(error instanceof DriveFileNotFoundError)original="missing-or-inaccessible";
   else throw error; // 401, 403, network failure, or unverifiable PATCH keep index.
  }
 }
 const record=await forgetMemory(id);
 if((await listMemories()).some(x=>x.id===id))throw Error("雲端記憶索引仍存在，刪除尚未確認");
 return {record,original};
}
