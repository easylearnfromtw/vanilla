import {makeCreamSnapshot,analyzeLongitudinal,type CreamGoal,type CreamSnapshot,type CreamTrend,type CreamObservation} from "./longitudinal";
import type {CreamDataset} from "./core";
import {attachmentOwner} from "../library/attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
const DB="vanilla.cream.longitudinal.v1",STORE="snapshots",GOALS="goals",MAX_ITEMS=100,MAX_POINTS=12000;
export function creamOwner():string{return attachmentOwner(signedChatAccount());}
async function dbOpen():Promise<IDBDatabase>{
 if(typeof indexedDB==="undefined")throw Error("此瀏覽器不支援 IndexedDB，CREAM 無法保證跨回合保存數據");
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   for(const n of [STORE,GOALS])if(!db.objectStoreNames.contains(n))db.createObjectStore(n,{keyPath:"id"});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error("無法開啟 CREAM 長期儲存庫"));
 });
}
async function transaction<T>(storeName:string,mode:IDBTransactionMode,operate:(store:IDBObjectStore,finish:(value:T)=>void)=>void):Promise<T>{
 const db=await dbOpen();
 return new Promise<T>((resolve,reject)=>{
  const tr=db.transaction(storeName,mode);
  let result:T,received=false;
  tr.oncomplete=()=>{db.close();received?resolve(result):reject(Error("CREAM 交易沒有結果"));};
  tr.onerror=()=>{db.close();reject(tr.error||Error("CREAM 儲存失敗"));};
  tr.onabort=()=>{db.close();reject(tr.error||Error("CREAM 儲存中止"));};
  operate(tr.objectStore(storeName),value=>{result=value;received=true;});
 });
}
export async function creamSnapshots(owner=creamOwner()):Promise<CreamSnapshot[]>{
 return transaction<CreamSnapshot[]>(STORE,"readonly",(store,done)=>{
  const req=store.getAll();
  req.onsuccess=()=>done((req.result as CreamSnapshot[]).filter(x=>x.owner===owner).sort((a,b)=>b.importedAt.localeCompare(a.importedAt)));
 });
}
export async function appendCreamDataset(dataset:CreamDataset,owner=creamOwner()):Promise<{saved:boolean;snapshot:CreamSnapshot;count:number}>{
 const snapshot=makeCreamSnapshot(dataset,owner);
 if(!snapshot.observations.length)throw Error("文件沒有可追蹤的數值指標；可進行單次 CREAM 分析，但不會建立虛構的長期紀錄");
 const existing=await creamSnapshots(owner);
 const repeat=existing.find(x=>x.fingerprint===snapshot.fingerprint);
 if(repeat)return {saved:false,snapshot:repeat,count:existing.length};
 if(existing.length>=MAX_ITEMS)throw Error("已達 100 次匯入上限，請先匯出或刪除舊資料");
 const count=existing.reduce((n,x)=>n+x.observations.length,0)+snapshot.observations.length;
 if(count>MAX_POINTS)throw Error("長期追蹤超過 12000 筆數值上限，請先封存或清理");
 await transaction<void>(STORE,"readwrite",(store,done)=>{const req=store.put(snapshot);req.onsuccess=()=>done(undefined);});
 window.dispatchEvent(new Event("vanilla-cream-updated"));
 return {saved:true,snapshot,count:existing.length+1};
}
export async function removeCreamSnapshot(id:string,owner=creamOwner()):Promise<void>{
 const old=(await creamSnapshots(owner)).find(x=>x.id===id);
 if(!old)throw Error("該帳號找不到這份 CREAM 追蹤紀錄");
 await transaction<void>(STORE,"readwrite",(store,done)=>{const req=store.delete(id);req.onsuccess=()=>done(undefined);});
 if((await creamSnapshots(owner)).some(x=>x.id===id))throw Error("CREAM 未能確認刪除紀錄");
 window.dispatchEvent(new Event("vanilla-cream-updated"));
}
type GoalRecord={id:string;owner:string;goal:CreamGoal;at:string};
export async function creamGoals(owner=creamOwner()):Promise<CreamGoal[]>{
 return transaction<CreamGoal[]>(GOALS,"readonly",(store,done)=>{
  const req=store.getAll();
  req.onsuccess=()=>done((req.result as GoalRecord[]).filter(x=>x.owner===owner).map(x=>x.goal));
 });
}
export async function updateCreamGoal(goal:CreamGoal,owner=creamOwner()):Promise<void>{
 if(!goal.metric.trim()||!Number.isFinite(goal.target)||!["increase","decrease","maintain"].includes(goal.direction))throw Error("目標指標或數值無效");
 const record:GoalRecord={id:owner+"\u0000"+goal.metric.trim().toLowerCase()+"\u0000"+goal.unit.trim().toLowerCase(),
  owner,goal,at:new Date().toISOString()};
 await transaction<void>(GOALS,"readwrite",(store,done)=>{const req=store.put(record);req.onsuccess=()=>done(undefined);});
 window.dispatchEvent(new Event("vanilla-cream-updated"));
}
export async function creamLongitudinalReport(owner=creamOwner()):Promise<{trends:CreamTrend[];snapshots:CreamSnapshot[];goals:CreamGoal[]}>{
 const snapshots=await creamSnapshots(owner),goals=await creamGoals(owner);
 const all=snapshots.flatMap(x=>x.observations);
 const groups=new Map<string,CreamObservation[]>();
 for(const o of all){
  const key=o.metric.toLowerCase()+"\u0000"+o.unit.toLowerCase();
  groups.set(key,[...(groups.get(key)||[]),o]);
 }
 const trends=[...groups.values()].flatMap(group=>analyzeLongitudinal(group,goals.find(g=>g.metric.toLowerCase()===group[0].metric.toLowerCase()&&g.unit.toLowerCase()===group[0].unit.toLowerCase())));
 return {trends:trends.sort((a,b)=>b.count-a.count),snapshots,goals};
}
