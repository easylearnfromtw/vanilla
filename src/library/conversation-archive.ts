/** Past conversations, kept on this device (IndexedDB), per account and per mode.
 * "新對話" used to delete the whole history; now the current conversation is archived first and
 * can be reopened from 「最近」. Private-mode conversations are archived separately and stay local.
 */
export type ArchiveTurn={role:"user"|"assistant";content:string;[key:string]:unknown};
export type ChatMode="normal"|"private";
export type ArchivedConversation={id:string;owner:string;mode:ChatMode;title:string;preview:string;
 turnCount:number;createdAt:number;updatedAt:number;turns:ArchiveTurn[]};
export type ArchiveSummary=Omit<ArchivedConversation,"turns">;
export type ArchiveStore={
 put(item:ArchivedConversation):Promise<void>;
 all(owner:string,mode:ChatMode):Promise<ArchivedConversation[]>;
 get(id:string):Promise<ArchivedConversation|undefined>;
 remove(id:string):Promise<void>;
};
export const MAX_ARCHIVED=40;

export function summarizeConversation(turns:readonly ArchiveTurn[]):{title:string;preview:string}{
 const firstUser=turns.find(t=>t.role==="user"&&t.content.trim())?.content||"對話";
 const title=firstUser.replace(/\s+/g," ").replace(/^(?:請|幫我|麻煩)\s*/,"").trim().slice(0,38)||"對話";
 const lastAssistant=[...turns].reverse().find(t=>t.role==="assistant"&&t.content.trim())?.content||"";
 const preview=lastAssistant.replace(/[#*`>|_\-]+/g," ").replace(/\s+/g," ").trim().slice(0,70);
 return {title,preview};
}
export async function archiveConversation(store:ArchiveStore,owner:string,mode:ChatMode,turns:readonly ArchiveTurn[],now=Date.now()):Promise<ArchivedConversation|null>{
 const clean=turns.filter(t=>t&&(t.role==="user"||t.role==="assistant")&&typeof t.content==="string");
 if(!clean.some(t=>t.role==="user"&&t.content.trim()))return null;
 const {title,preview}=summarizeConversation(clean);
 const first=Number(clean[0]?.createdAt)||now;
 const item:ArchivedConversation={id:(globalThis.crypto?.randomUUID?.()||String(now)+Math.random().toString(36).slice(2)),
  owner,mode,title,preview,turnCount:clean.length,createdAt:first,updatedAt:now,turns:clean.map(t=>({...t}))};
 await store.put(item);
 const all=await store.all(owner,mode);
 for(const old of all.sort((a,b)=>b.updatedAt-a.updatedAt).slice(MAX_ARCHIVED))await store.remove(old.id);
 return item;
}
export async function listConversations(store:ArchiveStore,owner:string,mode:ChatMode):Promise<ArchiveSummary[]>{
 return (await store.all(owner,mode)).sort((a,b)=>b.updatedAt-a.updatedAt).map(({turns:_turns,...summary})=>summary);
}
export async function takeConversation(store:ArchiveStore,id:string,owner:string):Promise<ArchivedConversation>{
 const item=await store.get(id);
 if(!item||item.owner!==owner)throw Error("找不到這段對話（可能屬於其他帳號或已刪除）");
 await store.remove(id);
 return item;
}

export function memoryArchiveStore():ArchiveStore{
 const map=new Map<string,ArchivedConversation>();
 return {
  async put(item){map.set(item.id,structuredClone(item));},
  async all(owner,mode){return [...map.values()].filter(x=>x.owner===owner&&x.mode===mode).map(x=>structuredClone(x));},
  async get(id){const v=map.get(id);return v?structuredClone(v):undefined;},
  async remove(id){map.delete(id);}
 };
}
const DB="vanilla.chat.archive.v1",STORE="conversations";
function open():Promise<IDBDatabase>{
 if(typeof indexedDB==="undefined")return Promise.reject(Error("此瀏覽器不支援 IndexedDB，無法保存過去的對話"));
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:"id"});s.createIndex("ownerMode",["owner","mode"],{unique:false});}};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error("無法開啟對話封存資料庫"));
 });
}
function tx<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore)=>IDBRequest|null):Promise<T>{
 return open().then(db=>new Promise<T>((resolve,reject)=>{
  const t=db.transaction(STORE,mode);let result:unknown;
  const req=run(t.objectStore(STORE));
  if(req)req.onsuccess=()=>{result=req.result;};
  t.oncomplete=()=>{db.close();resolve(result as T);};
  t.onerror=()=>{db.close();reject(t.error||Error("對話封存讀寫失敗"));};
  t.onabort=()=>{db.close();reject(t.error||Error("對話封存交易中止"));};
 }));
}
export function indexedDbArchiveStore():ArchiveStore{
 return {
  put:item=>tx<void>("readwrite",s=>s.put(item)),
  all:(owner,mode)=>tx<ArchivedConversation[]>("readonly",s=>s.index("ownerMode").getAll(IDBKeyRange.only([owner,mode]))).then(x=>x||[]),
  get:id=>tx<ArchivedConversation|undefined>("readonly",s=>s.get(id)),
  remove:id=>tx<void>("readwrite",s=>s.delete(id))
 };
}
