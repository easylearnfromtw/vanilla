import type {CreamDataset} from "./core.ts";
import {makeCreamSnapshot,analyzeLongitudinal,type CreamSnapshot,type CreamObservation,type CreamGoal,type CreamTrend} from "./longitudinal.ts";
const DB="vanilla.cream.history.v1",SNAPSHOTS="snapshots",GOALS="goals",MAX_PER_OWNER=120;
function openDB():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined"){reject(Error("這個瀏覽器不支援 IndexedDB，長期資料不能保存"));return;}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{const db=request.result;
   if(!db.objectStoreNames.contains(SNAPSHOTS)){const store=db.createObjectStore(SNAPSHOTS,{keyPath:"id"});store.createIndex("owner","owner",{unique:false});}
   if(!db.objectStoreNames.contains(GOALS)){const store=db.createObjectStore(GOALS,{keyPath:"key"});store.createIndex("owner","owner",{unique:false});}
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("無法開啟 CREAM 歷史資料庫"));
 });
}
async function transact<T>(storeName:string,mode:IDBTransactionMode,doRequest:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await openDB();
 return new Promise<T>((resolve,reject)=>{
  let result:T,success=false;
  const transaction=db.transaction(storeName,mode);
  const req=doRequest(transaction.objectStore(storeName));
  req.onsuccess=()=>{result=req.result;success=true;};
  req.onerror=()=>{transaction.abort();};
  transaction.oncomplete=()=>{db.close();success?resolve(result):reject(Error("CREAM 資料庫讀寫未完成"));};
  transaction.onerror=()=>{db.close();reject(transaction.error||Error("CREAM 交易失敗"));};
  transaction.onabort=()=>{db.close();reject(transaction.error||Error("CREAM 儲存已中止"));};
 });
}
export async function listCreamSnapshots(owner:string):Promise<CreamSnapshot[]>{
 if(!owner)throw Error("缺少資料所屬帳戶");
 const records=await transact<CreamSnapshot[]>(SNAPSHOTS,"readonly",store=>store.index("owner").getAll(IDBKeyRange.only(owner)));
 return records.sort((a,b)=>b.importedAt.localeCompare(a.importedAt)).slice(0,MAX_PER_OWNER);
}
export async function persistCreamDataset(dataset:CreamDataset,owner:string):Promise<{snapshot:CreamSnapshot;created:boolean}>{
 const snapshot=makeCreamSnapshot(dataset,owner);
 if(!snapshot.observations.length)throw Error("沒有可記錄的數值觀察，CREAM 可做文字摘要，但不會虛構時間序列");
 const existing=await listCreamSnapshots(owner);
 const match=existing.find(x=>x.fingerprint===snapshot.fingerprint&&x.source===snapshot.source);
 if(match)return {snapshot:match,created:false};
 if(existing.length>=MAX_PER_OWNER)throw Error("CREAM 已達 120 份長期資料上限；請匯出備份或刪除舊快照");
 await transact<IDBValidKey>(SNAPSHOTS,"readwrite",store=>store.put(snapshot));
 window.dispatchEvent(new Event("vanilla-cream-history-updated"));
 return {snapshot,created:true};
}
export async function removeCreamSnapshot(id:string,owner:string):Promise<void>{
 const rows=await listCreamSnapshots(owner);
 if(!rows.some(x=>x.id===id))throw Error("這份資料不屬於目前帳戶或不存在");
 await transact<undefined>(SNAPSHOTS,"readwrite",store=>store.delete(id));
 window.dispatchEvent(new Event("vanilla-cream-history-updated"));
}
export async function getCreamGoals(owner:string):Promise<CreamGoal[]>{
 const records=await transact<Array<{key:string;owner:string;goal:CreamGoal}>>(GOALS,"readonly",store=>store.index("owner").getAll(IDBKeyRange.only(owner)));
 return records.map(x=>x.goal);
}
export async function saveCreamGoal(owner:string,goal:CreamGoal):Promise<void>{
 if(!owner||!goal.metric.trim()||!Number.isFinite(goal.target))throw Error("目標必須有指標名稱與有效數字");
 if(goal.dueDate&&!/^\d{4}-\d\d-\d\d$/.test(goal.dueDate))throw Error("目標日期格式需為 YYYY-MM-DD");
 const key=owner+"|"+goal.metric.trim().toLowerCase()+"|"+goal.unit.trim().toLowerCase();
 await transact<IDBValidKey>(GOALS,"readwrite",store=>store.put({key,owner,goal}));
 window.dispatchEvent(new Event("vanilla-cream-history-updated"));
}
export async function longitudinalReport(owner:string):Promise<{snapshots:CreamSnapshot[];trends:CreamTrend[];goals:CreamGoal[];observations:CreamObservation[]}>{
 const [snapshots,goals]=await Promise.all([listCreamSnapshots(owner),getCreamGoals(owner)]);
 const all=snapshots.flatMap(x=>x.observations);
 const trends=analyzeLongitudinal(all).map(x=>{
  const goal=goals.find(g=>g.metric.trim().toLowerCase()===x.metric.toLowerCase()&&g.unit.trim().toLowerCase()===x.unit.toLowerCase());
  if(!goal)return x;
  return analyzeLongitudinal(all.filter(o=>o.metric.toLowerCase()===x.metric.toLowerCase()&&o.unit.toLowerCase()===x.unit.toLowerCase()),goal)[0]||x;
 });
 return {snapshots,trends,goals,observations:all};
}
export function exportCreamHistory(report:{observations:CreamObservation[]}):string{
 const quote=(s:string)=>'"'+String(s).replace(/"/g,'""')+'"';
 return ["日期,指標,單位,數值,來源,原始列號",...report.observations.map(x=>
  [x.date,x.metric,x.unit,String(x.value),x.source,String(x.sourceRow)].map(quote).join(","))].join("\r\n")+"\r\n";
}
