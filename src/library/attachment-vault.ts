/** IndexedDB attachment vault. Files are scoped to the active chat account.
 * Private chats never call this module. No external network or arbitrary code.
 */
export type SavedAttachment={id:string;owner:string;name:string;type:string;size:number;note:string;createdAt:string;updatedAt:string;blob:Blob};
const DB="vanilla.chat.attachments.v1",STORE="items",MAX_BYTES=15*1024*1024;
function storage():Promise<IDBDatabase>{
 if(typeof indexedDB==="undefined")return Promise.reject(Error("此裝置沒有可用的 IndexedDB，無法永久保存附件"));
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE)){const store=db.createObjectStore(STORE,{keyPath:"id"});store.createIndex("owner","owner",{unique:false});}};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("無法開啟附件資料庫"));
 });
}
async function run<T>(mode:IDBTransactionMode,handler:(store:IDBObjectStore,done:(value:T)=>void,fail:(e:unknown)=>void)=>void):Promise<T>{
 const db=await storage();
 return new Promise<T>((resolve,reject)=>{
  const tx=db.transaction(STORE,mode);
  let result:T,settled=false;
  const done=(value:T)=>{result=value;settled=true;};
  const fail=(e:unknown)=>{settled=true;reject(e);};
  tx.oncomplete=()=>{db.close();if(settled)resolve(result);else reject(Error("附件資料庫操作沒有回傳結果"));};
  tx.onerror=()=>{db.close();reject(tx.error||Error("附件資料庫操作失敗"));};
  tx.onabort=()=>{db.close();reject(tx.error||Error("附件資料庫交易中止"));};
  handler(tx.objectStore(STORE),done,fail);
 });
}
export function attachmentOwner(email:string):string{
 const key=email.trim().toLowerCase();return key?"account:"+key:"guest:device";
}
export async function saveChatAttachment(file:File,owner:string):Promise<SavedAttachment>{
 if(file.size>MAX_BYTES)throw Error("聊天附件最多保存 15 MB");
 if(!owner)throw Error("無法識別附件所屬空間");
 const now=new Date().toISOString();
 const item:SavedAttachment={id:crypto.randomUUID(),owner,name:file.name.slice(0,180)||"未命名附件",
  type:file.type||"application/octet-stream",size:file.size,note:"",createdAt:now,updatedAt:now,blob:file};
 await run<void>("readwrite",(store,done,fail)=>{const req=store.put(item);req.onsuccess=()=>done(undefined);req.onerror=()=>fail(req.error);});
 window.dispatchEvent(new Event("vanilla-library-changed"));
 return item;
}
export async function listChatAttachments(owner:string):Promise<SavedAttachment[]>{
 return run<SavedAttachment[]>("readonly",(store,done,fail)=>{
  const req=store.index("owner").getAll(IDBKeyRange.only(owner));
  req.onsuccess=()=>done((req.result as SavedAttachment[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,150));
  req.onerror=()=>fail(req.error);
 });
}
export async function getChatAttachment(id:string,owner:string):Promise<SavedAttachment>{
 const item=await run<SavedAttachment|undefined>("readonly",(store,done,fail)=>{
  const req=store.get(id);req.onsuccess=()=>done(req.result as SavedAttachment|undefined);req.onerror=()=>fail(req.error);
 });
 if(!item||item.owner!==owner)throw Error("找不到這個帳號的附件");
 return item;
}
export async function changeChatAttachment(id:string,owner:string,patch:{name?:string;note?:string;file?:File}):Promise<SavedAttachment>{
 const before=await getChatAttachment(id,owner);
 if(patch.file&&patch.file.size>MAX_BYTES)throw Error("檔案超過 15 MB");
 const now=new Date().toISOString();
 const changed:SavedAttachment={...before,name:patch.name?.trim().slice(0,180)||patch.file?.name||before.name,
  note:patch.note!==undefined?patch.note.slice(0,4000):before.note,
  blob:patch.file||before.blob,type:patch.file?.type||before.type,
  size:patch.file?.size??before.size,updatedAt:now};
 // Recheck owner and item existence within the transaction to avoid stale writes.
 await run<void>("readwrite",(store,done,fail)=>{
  const get=store.get(id);
  get.onsuccess=()=>{
   const current=get.result as SavedAttachment|undefined;
   if(!current||current.owner!==owner){fail(Error("資料已不存在或所屬帳號不同"));return;}
   const req=store.put(changed);req.onsuccess=()=>done(undefined);req.onerror=()=>fail(req.error);
  };
  get.onerror=()=>fail(get.error);
 });
 window.dispatchEvent(new Event("vanilla-library-changed"));
 return changed;
}
export async function removeChatAttachment(id:string,owner:string):Promise<void>{
 await getChatAttachment(id,owner);
 await run<void>("readwrite",(store,done,fail)=>{
  const get=store.get(id);
  get.onsuccess=()=>{
   const current=get.result as SavedAttachment|undefined;
   if(!current||current.owner!==owner){fail(Error("無法刪除其他帳號的附件"));return;}
   const req=store.delete(id);req.onsuccess=()=>done(undefined);req.onerror=()=>fail(req.error);
  };
  get.onerror=()=>fail(get.error);
 });
 window.dispatchEvent(new Event("vanilla-library-changed"));
}
