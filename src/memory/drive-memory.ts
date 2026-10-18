import {driveSession,listWorkspaceFiles,createWorkspaceText,getWorkspaceText,uploadWorkspaceFile,type WorkspaceFile} from "../workspace/cloud-drive";

export type MemoryKind="note"|"image"|"video"|"file"|"website"|"chat";
export type MemoryRecord={
 version:1;id:string;kind:MemoryKind;title:string;description:string;sourceUrl?:string;
 fileId?:string;fileName?:string;fileMimeType?:string;
 createdAt:string;updatedAt:string;labels:string[];ownerEmail:string;
};
const PREFIX="vanilla-memory-";
const MAX_RESULTS=80;
const SUMMARY_MAX=8000;
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
 // Link metadata is not a claim that the page was fetched or parsed.
 const kind:MemoryKind=/\.(?:mp4|webm|mov)(?:$|\?)/i.test(url.pathname)||/youtube\.com|youtu\.be|vimeo\.com/.test(url.hostname)?"video":"website";
 return saveRecord({kind,title:safeTitle(url.hostname+url.pathname.slice(0,55)),description:note.trim().slice(0,SUMMARY_MAX)||"僅儲存原始網址，尚未抓取網站或影片內容",sourceUrl:url.toString(),labels:["連結"]});
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
 return saveRecord({kind,title:safeTitle(file.name),description:summary.slice(0,SUMMARY_MAX),fileId:saved.id,fileName:file.name,fileMimeType:file.type,labels:[]});
}
async function allRecords():Promise<MemoryRecord[]>{
 const {token,email}=session();
 const files=await listWorkspaceFiles(token);
 const candidates=files.filter(x=>x.name.startsWith(PREFIX)&&x.name.endsWith(".json")).slice(0,MAX_RESULTS);
 const result:MemoryRecord[]=[];
 for(let i=0;i<candidates.length;i+=8){
  const group=await Promise.all(candidates.slice(i,i+8).map(async(file:WorkspaceFile)=>{
   try{return validateRecord(JSON.parse(await getWorkspaceText(token,file.id)) as unknown);}catch{return null;}
  }));
  for(const record of group){if(record&&record.ownerEmail===email)result.push(record);}
 }
 return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
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
 return found.slice(0,4).map(x=>"- "+x.title+"："+x.description.slice(0,800)+(x.sourceUrl?" ("+x.sourceUrl+")":"")).join("\n");
}
