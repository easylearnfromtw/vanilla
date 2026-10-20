/** Detroit offline-first schedule ledger.
 * Local dates/tasks MUST work without Notion, WeiGuo, Google sign-in or network.
 * The private chat mode uses an ephemeral store, never browser disk storage.
 * External Notion sync is a distinct, manually approved action.
 */
export type LocalScheduleTask={
 id:string;owner:string;title:string;when:string;details:string;done:boolean;
 createdAt:string;updatedAt:string;notionPageId?:string;notionSyncedAt?:string;
};
type ScheduleStore=Pick<Storage,"getItem"|"setItem">;
const PREFIX="vanilla.detroit.schedule.local.v1.";
const LIMIT=200;
const PAGE_ID=/^[a-f0-9-]{36}$/i;

export function scheduleStorageKey(owner:string):string{
 if(!owner||owner.length>300)throw Error("排程所屬空間不正確");
 return PREFIX+encodeURIComponent(owner);
}
function fromRaw(raw:string|null,owner:string):LocalScheduleTask[]{
 if(!raw)return [];
 let obj:unknown;
 try{obj=JSON.parse(raw);}catch{throw Error("本機排程資料無法讀取，未覆寫原有紀錄");}
 if(!Array.isArray(obj))throw Error("本機排程格式不正確，未覆寫原有紀錄");
 if(obj.length>LIMIT)throw Error("本機排程超出安全儲存上限");
 const ids=new Set<string>();
 return obj.map(v=>{
  if(!v||typeof v!=="object"||Array.isArray(v))throw Error("本機排程包含損毀資料");
  const x=v as Record<string,unknown>;
  if(typeof x.id!=="string"||!PAGE_ID.test(x.id)||ids.has(x.id)||x.owner!==owner||
     typeof x.title!=="string"||x.title.length<1||x.title.length>180||
     typeof x.when!=="string"||!Number.isFinite(Date.parse(x.when))||
     typeof x.details!=="string"||x.details.length>1800||
     typeof x.done!=="boolean"||
     typeof x.createdAt!=="string"||typeof x.updatedAt!=="string"||
     (x.notionPageId!==undefined&&(typeof x.notionPageId!=="string"||!PAGE_ID.test(x.notionPageId)))||
     (x.notionSyncedAt!==undefined&&typeof x.notionSyncedAt!=="string"))
    throw Error("本機排程包含損毀或不屬於此帳號的資料");
  ids.add(x.id);
  return x as LocalScheduleTask;
 });
}
export function listLocalSchedule(owner:string,store:ScheduleStore=localStorage):LocalScheduleTask[]{
 return fromRaw(store.getItem(scheduleStorageKey(owner)),owner)
   .sort((a,b)=>a.when.localeCompare(b.when)||a.createdAt.localeCompare(b.createdAt));
}
function persist(owner:string,items:LocalScheduleTask[],store:ScheduleStore){
 if(items.length>LIMIT)throw Error("本機排程最多儲存 200 筆");
 store.setItem(scheduleStorageKey(owner),JSON.stringify(items));
 if(typeof window!=="undefined")window.dispatchEvent(new Event("vanilla-local-schedule-changed"));
}
export function addLocalSchedule(owner:string,data:{title:string;when:string;details?:string},store:ScheduleStore=localStorage):LocalScheduleTask{
 const title=data.title.trim(),details=(data.details||"").trim();
 if(!title||title.length>180||details.length>1800)throw Error("排程名稱或說明格式不正確");
 const parsed=new Date(data.when);
 if(!Number.isFinite(parsed.getTime()))throw Error("請設定有效日期與時間");
 const list=listLocalSchedule(owner,store);
 if(list.length>=LIMIT)throw Error("本機排程上限 200 筆，請先整理");
 const now=new Date().toISOString();
 const item:LocalScheduleTask={id:crypto.randomUUID(),owner,title,details,
  when:parsed.toISOString(),done:false,createdAt:now,updatedAt:now};
 persist(owner,[...list,item],store);
 return item;
}
export function changeLocalSchedule(owner:string,id:string,patch:{when?:string;done?:boolean},store:ScheduleStore=localStorage):LocalScheduleTask{
 if(!PAGE_ID.test(id))throw Error("排程識別碼不正確");
 const list=listLocalSchedule(owner,store);
 const index=list.findIndex(task=>task.id===id);
 if(index<0)throw Error("找不到目前帳號的排程");
 const old=list[index];
 let when=old.when;
 if(patch.when!==undefined){
  const parsed=new Date(patch.when);
  if(!Number.isFinite(parsed.getTime()))throw Error("日期不正確");
  when=parsed.toISOString();
 }
 if(patch.done!==undefined&&typeof patch.done!=="boolean")throw Error("狀態格式不正確");
 const done=patch.done??old.done;
 if(when===old.when&&done===old.done)return old;
 // Change the revision even for two edits within the same millisecond.
 const revision=new Date(Math.max(Date.now(),Date.parse(old.updatedAt)+1)).toISOString();
 const changed={...old,when,done,updatedAt:revision};
 list[index]=changed;
 persist(owner,list,store);
 return changed;
}
export function markLocalScheduleSynced(owner:string,id:string,expectedUpdatedAt:string,
 notionPageId:string,store:ScheduleStore=localStorage):LocalScheduleTask{
 if(!PAGE_ID.test(id)||!PAGE_ID.test(notionPageId))throw Error("Notion 同步識別碼不正確");
 const list=listLocalSchedule(owner,store),index=list.findIndex(task=>task.id===id);
 if(index<0)throw Error("同步後本機排程已不存在，請人工核對");
 const old=list[index];
 if(old.notionPageId&&old.notionPageId!==notionPageId)throw Error("同步的 Notion 頁面不一致");
 const changed={...old,notionPageId,notionSyncedAt:expectedUpdatedAt};
 list[index]=changed;
 persist(owner,list,store);
 return changed;
}
export function needsNotionSync(task:LocalScheduleTask):boolean{
 return !task.notionPageId||task.notionSyncedAt!==task.updatedAt;
}

/** Private chat schedule is tab-memory only: no storage, cross-account or network. */
export function createMemorySchedule(){
 const byOwner=new Map<string,LocalScheduleTask[]>();
 const store:ScheduleStore={
  getItem:(key)=>JSON.stringify(byOwner.get(key)||[]),
  setItem:(key,value)=>{byOwner.set(key,JSON.parse(value) as LocalScheduleTask[]);}
 };
 return {list:(owner:string)=>listLocalSchedule(owner,store),
  add:(owner:string,data:{title:string;when:string;details?:string})=>addLocalSchedule(owner,data,store),
  change:(owner:string,id:string,patch:{when?:string;done?:boolean})=>changeLocalSchedule(owner,id,patch,store)};
}
