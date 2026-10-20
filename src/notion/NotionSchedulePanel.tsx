import {useState} from 'react';
import {CalendarDays,RefreshCw,CheckCircle2} from 'lucide-react';
import {notionFamilyRequest,weiGuoApiBase,weiGuoIdentity} from '../weiguo/api';
import {currentChatMode} from '../local-ai/chat-session';

type Task={id:string;title:string;when:string|null;done:boolean;url:string};
type ListReply={tasks:Task[];hasMore:boolean};
type Status={configured:boolean;schedulerActive:boolean;capabilities:string[];note:string};

function formatDate(input:string|null):string{
 if(!input)return '未設定';
 const date=new Date(input);
 return Number.isNaN(date.getTime())?input:date.toLocaleString('zh-TW');
}
export default function NotionSchedulePanel(){
 const [status,setStatus]=useState<Status|null>(null);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [title,setTitle]=useState('');
 const [details,setDetails]=useState('');
 const [when,setWhen]=useState('');
 const [allowWrite,setAllowWrite]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [hasMore,setHasMore]=useState(false);
 const [rescheduleId,setRescheduleId]=useState<string|null>(null);
 const [rescheduleWhen,setRescheduleWhen]=useState('');
 const identity=weiGuoIdentity();
 const privateMode=currentChatMode()==='private';
 const available=Boolean(weiGuoApiBase()&&identity&&!privateMode&&identity.role!=='viewer');
 async function refresh(){
  if(!available)return;
  setBusy(true);setNotice('');
  try{
   const [config,listing]=await Promise.all([
    notionFamilyRequest<Status>('/v1/family/notion/status'),
    notionFamilyRequest<ListReply>('/v1/family/notion/tasks')
   ]);
   setStatus(config);setTasks(listing.tasks);setHasMore(listing.hasMore);
   setNotice(config.configured?'Notion 工作表已同步。':'Notion 尚未由後端配置 Integration 和 Data Source。');
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function create(){
  if(!available||!allowWrite||!title.trim()||!when)return;
  setBusy(true);setNotice('');
  try{
   const whenIso=new Date(when);
   if(Number.isNaN(whenIso.getTime()))throw Error('請選擇有效的時間');
   const newTask=await notionFamilyRequest<Task>('/v1/family/notion/tasks',{
    title:title.trim(),when:whenIso.toISOString(),details:details.trim()
   });
   setTasks(old=>[newTask,...old]);setTitle('');setDetails('');
   setNotice('已建立 Notion 任務。注意：這不等於已設定自動提醒或執行。');
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function reschedule(id:string){
  if(!available||!allowWrite||!rescheduleWhen)return;
  const date=new Date(rescheduleWhen);
  if(Number.isNaN(date.getTime()))return setNotice('請選擇有效時間');
  setBusy(true);setNotice('');
  try{
   const updated=await notionFamilyRequest<Task>('/v1/family/notion/tasks/'+id+'/reschedule',{when:date.toISOString()});
   setTasks(old=>old.map(task=>task.id===updated.id?updated:task));
   setRescheduleId(null);setRescheduleWhen('');setNotice('已將新日期同步至 Notion。');
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function complete(id:string){
  if(!available||!allowWrite)return;
  setBusy(true);setNotice('');
  try{
   const updated=await notionFamilyRequest<Task>('/v1/family/notion/tasks/'+id+'/complete',{});
   setTasks(old=>old.map(task=>task.id===updated.id?updated:task));
   setNotice('已同步完成狀態至 Notion。');
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 return <section className="detroit-studio-form" aria-label="Notion 任務排程">
  <h2><CalendarDays size={19}/> Notion · Schedule Board</h2>
  <p>Notion 保存行程時間、待辦事項與進度；Diana 可將排程需求交給這裡。真正的定時觸發、提醒與自動呼叫其他 Detroit 工具，仍需獨立部署 Chronos 執行器。</p>
  {!weiGuoApiBase()&&<p role="status">尚未設定衞國 HTTPS 後端，無法連接 Notion。</p>}
  {!identity&&<><p role="status">請先登入衞國 Google 家庭工作階段。</p><button type="button" onClick={()=>window.dispatchEvent(new Event('vanilla-open-weiguo'))}>前往衞國登入</button></>}
  {privateMode&&<p role="status">私人模式不會將任務傳送到 Notion。</p>}
  {identity?.role==='viewer'&&<p role="status">此帳號為 viewer，沒有任務編輯權限。</p>}
  {available&&<>
   <button type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/> 同步 Notion 排程</button>
   {status&&!status.configured&&<p role="alert">伺服器尚未配置 Notion Integration 與任務資料來源。</p>}
   <label>任務名稱<input maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例：整理每週研究進度"/></label>
   <label>日期與時間<input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label>
   <label>說明（選填）<textarea rows={3} maxLength={1800} value={details} onChange={e=>setDetails(e.target.value)}/></label>
   <label className="detroit-consent"><input type="checkbox" checked={allowWrite} onChange={e=>setAllowWrite(e.target.checked)}/> 我同意將這次操作的任務內容傳送至已授權的 Notion 工作區</label>
   <button type="button" className="detroit-primary" disabled={busy||!allowWrite||!title.trim()||!when||status?.configured===false} onClick={()=>void create()}>建立 Notion 任務</button>
   <h3>我的排程</h3>
   {tasks.length===0?<p>目前尚無讀取到任務。請按上方「同步 Notion 排程」。</p>:<ul>
    {tasks.map(task=><li key={task.id}><strong>{task.title||'未命名任務'}</strong> · {formatDate(task.when)} · {task.done?'已完成':'待辦'}
     {!task.done&&<><button type="button" disabled={busy||!allowWrite} onClick={()=>void complete(task.id)}><CheckCircle2 size={15}/> 標記完成</button>
      <button type="button" disabled={busy||!allowWrite} onClick={()=>{setRescheduleId(task.id);setRescheduleWhen('');}}>改期</button>
      {rescheduleId===task.id&&<span><input type="datetime-local" aria-label="新日期與時間" value={rescheduleWhen} onChange={e=>setRescheduleWhen(e.target.value)}/><button type="button" disabled={busy||!allowWrite||!rescheduleWhen} onClick={()=>void reschedule(task.id)}>儲存新日期</button></span>}
     </>}
    </li>)}
   </ul>}
   {hasMore&&<p>僅顯示前 50 項符合權限的任務；後續分頁尚未載入。</p>}
  </>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
