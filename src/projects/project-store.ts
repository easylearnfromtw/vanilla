import {indexProjectSource,projectKnowledgeMatches,projectKnowledgePrompt,safeProjectPath,
 type ProjectCorpus,type ProjectMatch,type APIDefinition} from "./project-core.ts";
const DB="vanilla.project-hub.v1",CORPUS="corpora",APIS="apis";
function connect():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined"){reject(Error("IndexedDB 不支援跨會話專案記憶"));return;}
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   for(const storeName of [CORPUS,APIS])if(!db.objectStoreNames.contains(storeName)){
    const s=db.createObjectStore(storeName,{keyPath:"id"});s.createIndex("owner","owner",{unique:false});
   }
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error("專案資料庫初始化失敗"));
 });
}
async function perform<T>(name:string,mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await connect();
 return new Promise<T>((resolve,reject)=>{
  let value:T,complete=false;
  const tx=db.transaction(name,mode),req=fn(tx.objectStore(name));
  req.onsuccess=()=>{value=req.result;complete=true;};
  req.onerror=()=>tx.abort();
  tx.oncomplete=()=>{db.close();complete?resolve(value):reject(Error("專案保存交易沒有完成"));};
  tx.onerror=()=>{db.close();reject(tx.error||Error("專案儲存失敗"));};
  tx.onabort=()=>{db.close();reject(tx.error||Error("專案儲存已中止"));};
 });
}
export async function listProjectCorpora(owner:string):Promise<ProjectCorpus[]>{
 if(!owner)throw Error("無法識別專案記憶的資料範圍");
 const rows=await perform<ProjectCorpus[]>(CORPUS,"readonly",s=>s.index("owner").getAll(IDBKeyRange.only(owner)));
 return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,50);
}
export async function putProjectCorpus(corpus:ProjectCorpus):Promise<void>{
 if(!corpus.owner||corpus.files.length>12||corpus.files.some(f=>f.excerpt.length>7000))throw Error("專案檔案超過安全索引上限");
 const checked:{id:string;owner:string;repo:string;updatedAt:string;files:typeof corpus.files;source:ProjectCorpus["source"];warnings:string[]}={
  id:corpus.owner+"|"+corpus.repo,owner:corpus.owner,repo:corpus.repo,updatedAt:corpus.updatedAt,files:corpus.files,source:corpus.source,
  warnings:corpus.warnings.slice(0,20)};
 await perform<IDBValidKey>(CORPUS,"readwrite",s=>s.put(checked));
 window.dispatchEvent(new Event("vanilla-project-hub-updated"));
}
export async function deleteProjectCorpus(owner:string,repo:string):Promise<void>{
 const rows=await listProjectCorpora(owner);
 const target=rows.find(x=>x.repo===repo);
 if(!target)throw Error("沒有這個帳戶的專案索引");
 await perform<undefined>(CORPUS,"readwrite",s=>s.delete(target.id));
 window.dispatchEvent(new Event("vanilla-project-hub-updated"));
}
export async function importUploadedCode(files:File[],owner:string):Promise<ProjectCorpus>{
 if(!files.length||files.length>12)throw Error("每次最多匯入 12 份原始碼檔案");
 const indexed=[] as ProjectCorpus["files"];
 const errors:string[]=[];
 for(const file of files){
  try{
   const path=safeProjectPath(file.name);
   if(file.size>250000)throw Error("單檔不得超過 250KB");
   const text=await file.text();
   const entry=indexProjectSource("local-upload",path,text);
   indexed.push({...entry,url:""}); // no fictitious GitHub link for user uploads
  }catch(e){errors.push(file.name+"："+String(e));}
 }
 if(!indexed.length)throw Error("匯入檔案皆不符合範圍："+errors.join("; "));
 return {id:crypto.randomUUID(),owner,repo:"local:uploads",updatedAt:new Date().toISOString(),
  source:"upload",files:indexed,warnings:errors};
}
export async function projectMatches(owner:string,query:string):Promise<ProjectMatch[]>{
 return projectKnowledgeMatches(await listProjectCorpora(owner),query);
}
export async function projectContext(owner:string,query:string):Promise<string>{
 return projectKnowledgePrompt(await projectMatches(owner,query));
}
type StoredAPI={id:string;owner:string;definition:APIDefinition;updatedAt:string};
export async function listProjectAPIs(owner:string):Promise<APIDefinition[]>{
 const arr=await perform<StoredAPI[]>(APIS,"readonly",s=>s.index("owner").getAll(IDBKeyRange.only(owner)));
 return arr.map(x=>x.definition);
}
export async function saveProjectAPI(owner:string,definition:APIDefinition):Promise<void>{
 if(!owner||!definition.origin.startsWith("https://"))throw Error("API 來源不合法");
 await perform<IDBValidKey>(APIS,"readwrite",s=>s.put({id:owner+"|"+definition.origin,owner,definition,updatedAt:new Date().toISOString()}));
 window.dispatchEvent(new Event("vanilla-project-hub-updated"));
}
