/** Same-origin adapter for 健人 (easylearnfromtw.github.io/Builder/).
 * Data lives in this browser only; no cross-device access, no invented records.
 */
const STORE_KEY="kai-log-v1";
type Run={id:string;date:string;km:number;sec:number;type:string;feel:string;hr:number;cad:number;shoe:string;place:string;lat:null;lon:null;time:string;weather:null;note:string;start:number;ex?:boolean};
type Lift={id:string;date:string;title?:string;dur?:number;items?:unknown[];ex?:boolean};
type State={v:number;profile?:{name?:string};lifts:Lift[];runs:Run[];active?:unknown;[key:string]:unknown};
export type RunDraft={date:string;km:number;minutes:number;hr?:number;note:string;type:"easy"|"tempo"|"walk"};
export type FitnessReport={owner:string;runs:number;lifts:number,totalKm:number,recentKm:number,lastRun:Run|null;lastLifts:Lift[]};
function state():State{
 let raw:string|null;try{raw=localStorage.getItem(STORE_KEY);}catch{throw Error("無法讀取健人本機資料（瀏覽器阻擋儲存空間）");}
 if(!raw)throw Error("這台裝置的此瀏覽器尚無健人訓練資料。請先在健人網站建立紀錄；跨裝置需要另外同步。");
 let value:unknown;try{value=JSON.parse(raw);}catch{throw Error("健人資料格式無法解析，未修改任何內容");}
 if(!value||typeof value!=="object"||!Array.isArray((value as State).runs)||!Array.isArray((value as State).lifts))throw Error("健人紀錄格式不相容");
 return value as State;
}
export function fitnessDataAvailable():boolean{
 try{const s=state();return s.v===1;}catch{return false;}
}
function realRuns(s:State){return s.runs.filter(x=>x&&!x.ex&&typeof x.km==="number"&&typeof x.date==="string");}
function realLifts(s:State){return s.lifts.filter(x=>x&&!x.ex&&typeof x.date==="string");}
export function getFitnessReport():FitnessReport{
 const s=state(),runs=realRuns(s),lifts=realLifts(s);
 const weekStart=new Date();weekStart.setDate(weekStart.getDate()-6);
 const cutoff=[weekStart.getFullYear(),String(weekStart.getMonth()+1).padStart(2,"0"),String(weekStart.getDate()).padStart(2,"0")].join("-");
 return {
  owner:typeof s.profile?.name==="string"?s.profile.name:"健人使用者",
  runs:runs.length,lifts:lifts.length,
  totalKm:Math.round(runs.filter(x=>x.type!=="walk").reduce((sum,x)=>sum+x.km,0)*100)/100,
  recentKm:Math.round(runs.filter(x=>x.date>=cutoff&&x.type!=="walk").reduce((sum,x)=>sum+x.km,0)*100)/100,
  lastRun:[...runs].sort((a,b)=>b.date.localeCompare(a.date))[0]||null,
  lastLifts:[...lifts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3)
 };
}
export function formatFitnessReport(report:FitnessReport):string{
 return "健人本機紀錄｜"+report.owner+"\n跑步："+report.runs+" 次｜總里程 "+report.totalKm+" km｜近 7 日 "+report.recentKm+" km\n重訓："+report.lifts+" 次\n"+
 (report.lastRun?"最近跑步："+report.lastRun.date+"、"+report.lastRun.km+" km、"+Math.round(report.lastRun.sec/60)+" 分鐘":"尚無真實跑步紀錄")+
 "\n資料只來自此瀏覽器的健人實際紀錄；尚未跨裝置同步。";
}
export function parseRunDraft(question:string):RunDraft|null{
 const q=question.trim();
 if(!/(?:健人|跑步|跑了|跑完|跑)/.test(q)||!/(?:記錄|新增|加入|寫入|登記)/.test(q))return null;
 const km=q.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:公里|km|k\b)/i);
 const minutes=q.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:分鐘|min\b)/i);
 if(!km||!minutes)return null;
 const distance=Number(km[1]),duration=Number(minutes[1]);
 if(distance<=0||distance>150||duration<=0||duration>1440)throw Error("跑步距離或時間超出合理範圍");
 const heart=q.match(/(?:心率|HR|心跳)\s*[:：]?\s*([0-9]{2,3})/i);
 const hr=heart?Number(heart[1]):undefined;
 if(hr!==undefined&&(hr<30||hr>250))throw Error("心率數值不合理");
 const date=q.match(/(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)/);
 const today=new Date();
 const resolved=date?[date[1],date[2].padStart(2,"0"),date[3].padStart(2,"0")].join("-"):
 [today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
 const day=new Date(resolved+"T12:00:00");
 if(!Number.isFinite(day.getTime())||[day.getFullYear(),String(day.getMonth()+1).padStart(2,"0"),String(day.getDate()).padStart(2,"0")].join("-")!==resolved)throw Error("日期格式錯誤");
 if(day.getTime()>Date.now()+86400000)throw Error("不能把未來日期標為已完成訓練");
 return {date:resolved,km:distance,minutes:duration,hr,note:"由 Vanilla 對話確認新增",type:/健走|走路/.test(q)?"walk":/節奏跑|tempo/i.test(q)?"tempo":"easy"};
}
export function appendFitnessRun(draft:RunDraft):string{
 const s=state();
 if(s.v!==1)throw Error("健人資料版本不同；為避免損壞，沒有寫入");
 if(s.active)throw Error("健人目前有進行中的重訓，請先完成後再新增其他紀錄");
 const matching=realRuns(s).some(r=>r.date===draft.date&&Math.abs(r.km-draft.km)<0.001&&Math.abs(r.sec-draft.minutes*60)<1);
 if(matching)throw Error("健人已有相同日期、距離和時間的跑步紀錄，為避免重複未新增");
 const record:Run={id:crypto.randomUUID(),date:draft.date,km:Math.round(draft.km*100)/100,sec:Math.round(draft.minutes*60),
  type:draft.type,feel:"3",hr:draft.hr??0,cad:0,shoe:"",place:"",lat:null,lon:null,time:"",weather:null,note:draft.note,start:Date.now()};
 const current=localStorage.getItem(STORE_KEY);if(!current)throw Error("原始紀錄已消失，停止寫入");
 const backupKey="vanilla.fitness.prewrite."+Date.now();
 localStorage.setItem(backupKey,current);
 try{
  localStorage.setItem(STORE_KEY,JSON.stringify({...s,runs:[...s.runs,record]}));
 }catch(e){
  localStorage.setItem(STORE_KEY,current);
  throw Error("健人資料寫入失敗；已嘗試恢復原始內容："+String(e));
 }
 return "已寫入此瀏覽器的健人紀錄："+record.date+"，"+record.km+" km，"+draft.minutes+" 分鐘"+
 (draft.hr?"，HR "+draft.hr:"")+"。重新開啟健人後可查看；尚未同步其他裝置。";
}
