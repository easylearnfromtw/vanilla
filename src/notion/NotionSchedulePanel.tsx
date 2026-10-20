import {useEffect,useRef,useState} from 'react';
import {CalendarDays,RefreshCw,CheckCircle2} from 'lucide-react';
import {notionFamilyRequest,weiGuoApiBase,weiGuoIdentity} from '../weiguo/api';
import {currentChatMode} from '../local-ai/chat-session';
import {signedChatAccount} from '../vault/chat-sync';
import {attachmentOwner} from '../library/attachment-vault';
import {addLocalSchedule,changeLocalSchedule,createMemorySchedule,listLocalSchedule,
 markLocalScheduleSynced,needsNotionSync,type LocalScheduleTask} from './local-schedule';

type RemoteTask={id:string;title:string;when:string|null;done:boolean;url:string};
type ListReply={tasks:RemoteTask[];hasMore:boolean};
type Status={configured:boolean;schedulerActive:boolean;note:string};

const selectedOwner=()=>attachmentOwner(signedChatAccount());
function localTime(input:string):string{
 const date=new Date(input);
 return Number.isNaN(date.getTime())?input:date.toLocaleString('zh-TW');
}
export default function NotionSchedulePanel(){
 const privateMode=currentChatMode()==='private';
 const privateLedger=useRef(createMemorySchedule());
 const [owner,setOwner]=useState(selectedOwner);
 const [tasks,setTasks]=useState<LocalScheduleTask[]>([]);
 const [title,setTitle]=useState('');
 const [details,setDetails]=useState('');
 const [when,setWhen]=useState('');
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('');
 const [rescheduleId,setRescheduleId]=useState<string|null>(null);
 const [rescheduleWhen,setRescheduleWhen]=useState('');
 const [approveSync,setApproveSync]=useState(false);
 const [notionStatus,setNotionStatus]=useState<Status|null>(null);
 const [remoteTasks,setRemoteTasks]=useState<RemoteTask[]>([]);
 const [remoteMore,setRemoteMore]=useState(false);
 const cloudAllowed=!privateMode&&Boolean(weiGuoApiBase()&&weiGuoIdentity()&&weiGuoIdentity()?.role!=='viewer');
 function readLocal(who=owner):LocalScheduleTask[]{
  return privateMode?privateLedger.current.list(who):listLocalSchedule(who);
 }
 function refreshLocal(){
  try{setTasks(readLocal());}
  catch(e){setNotice('讀取本機排程失敗：'+String(e instanceof Error?e.message:e));}
 }
 useEffect(()=>{
  const update=()=>setOwner(selectedOwner());
  window.addEventListener('vanilla-drive-connected',update);
  window.addEventListener('vanilla-drive-disconnected',update);
  return()=>{
   window.removeEventListener('vanilla-drive-connected',update);
   window.removeEventListener('vanilla-drive-disconnected',update);
  };
 },[]);
 useEffect(()=>{
  try{setTasks(readLocal(owner));setNotice('');setRemoteTasks([]);setNotionStatus(null);setApproveSync(false);}
  catch(e){setTasks([]);setNotice(String(e instanceof Error?e.message:e));}
 },[owner,privateMode]);
 useEffect(()=>{
  if(privateMode)return;
  const onChange=()=>refreshLocal();
  window.addEventListener('storage',onChange);
  window.addEventListener('vanilla-local-schedule-changed',onChange);
  return()=>{
   window.removeEventListener('storage',onChange);
   window.removeEventListener('vanilla-local-schedule-changed',onChange);
  };
 },[owner,privateMode]);

 async function create(){
  if(!title.trim()||!when)return;
  setBusy(true);setNotice('');
  try{
   const input={title,when,details};
   const item=privateMode?privateLedger.current.add(owner,input):addLocalSchedule(owner,input);
   setTasks(readLocal());setTitle('');setDetails('');
   setNotice((privateMode?'已建立本次分頁暫存排程':'已保存到本機排程')+'：'+item.title+'。沒有連接 Notion 或啟動網路。');
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function localChange(id:string,patch:{when?:string;done?:boolean}){
  setBusy(true);setNotice('');
  try{
   const task=privateMode?privateLedger.current.change(owner,id,patch):changeLocalSchedule(owner,id,patch);
   setTasks(readLocal());setRescheduleId(null);setRescheduleWhen('');
   setNotice((privateMode?'已更新分頁暫存任務：':'本機已更新：')+task.title+'。不會自動同步雲端。');
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function readNotion(){
  if(!cloudAllowed||!approveSync)return;
  setBusy(true);setNotice('');
  try{
   const [status,list]=await Promise.all([
    notionFamilyRequest<Status>('/v1/family/notion/status'),
    notionFamilyRequest<ListReply>('/v1/family/notion/tasks')
   ]);
   setNotionStatus(status);setRemoteTasks(list.tasks);setRemoteMore(list.hasMore);
   setNotice(status.configured?'已讀取 Notion 對照資料；不會覆寫本機排程。':'Notion 整合尚未配置，仍可離線排程。');
  }catch(e){setNotice('Notion 讀取失敗；本機排程不受影響：'+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 async function pushNotion(task:LocalScheduleTask){
  if(!cloudAllowed||!approveSync)return;
  setBusy(true);setNotice('');
  try{
   let remote:RemoteTask;
   if(!task.notionPageId){
    remote=await notionFamilyRequest<RemoteTask>('/v1/family/notion/tasks',{
     title:task.title,when:task.when,details:task.details
    });
   }else{
    // Existing linked page: sync the local deadline, then completion. No silent cloud writes.
    remote=await notionFamilyRequest<RemoteTask>('/v1/family/notion/tasks/'+task.notionPageId+'/reschedule',{when:task.when});
    if(task.done)remote=await notionFamilyRequest<RemoteTask>('/v1/family/notion/tasks/'+task.notionPageId+'/complete',{});
   }
   const known=markLocalScheduleSynced(owner,task.id,task.updatedAt,remote.id);
   setTasks(readLocal());
   setNotice(needsNotionSync(known)?'Notion 已收到先前版本；本機又有變更，請再次手動同步。':'已手動同步至 Notion，本機資料仍保留。');
  }catch(e){
   setNotice('Notion 寫入未確認；本機仍保存原任務，重新操作前請檢查雲端避免重複：'+String(e instanceof Error?e.message:e));
  }finally{setBusy(false);}
 }
 return <section className="detroit-studio-form" aria-label="Vanilla 本地任務排程">
  <h2><CalendarDays size={19}/> Vanilla · 本地排程</h2>
  <p>排程首先屬於 Vanilla：新增、查看、完成與改期都能離線操作，不需要 Notion、衞國後端或 Google 登入。Notion 只是選用的雲端副本。期限不等同已啟用背景通知或自動執行。</p>
  {privateMode&&<p role="status">私人模式：這些任務只保存在目前分頁記憶體，不會寫入本機持久儲存或傳到 Notion。</p>}
  <label>任務名稱<input maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="例：整理每週研究進度"/></label>
  <label>日期與時間<input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label>
  <label>說明（選填）<textarea rows={3} maxLength={1800} value={details} onChange={e=>setDetails(e.target.value)}/></label>
  <button type="button" className="detroit-primary" disabled={busy||!title.trim()||!when} onClick={()=>void create()}>儲存本機排程</button>
  <h3>本機排程（{tasks.length}）</h3>
  {tasks.length===0?<p>目前沒有任務。可以直接新增；全程不需要網路。</p>:<ul>
   {tasks.map(task=><li key={task.id}>
    <strong>{task.title}</strong> · {localTime(task.when)} · {task.done?'已完成':'待辦'}
    {!privateMode&&task.notionPageId&&<small> · {needsNotionSync(task)?'本機已變更，尚未再次同步':'已同步 Notion'}</small>}
    {!task.done&&<><button type="button" disabled={busy} onClick={()=>void localChange(task.id,{done:true})}><CheckCircle2 size={15}/> 本機完成</button>
     <button type="button" disabled={busy} onClick={()=>{setRescheduleId(task.id);setRescheduleWhen('');}}>本機改期</button>
     {rescheduleId===task.id&&<span><input type="datetime-local" aria-label="新日期與時間" value={rescheduleWhen} onChange={e=>setRescheduleWhen(e.target.value)}/><button type="button" disabled={busy||!rescheduleWhen} onClick={()=>void localChange(task.id,{when:rescheduleWhen})}>儲存</button></span>}
    </>}
    {!privateMode&&task.done&&<small> · 完成狀態保存在裝置上</small>}
    {cloudAllowed&&approveSync&&needsNotionSync(task)&&<button type="button" disabled={busy} onClick={()=>void pushNotion(task)}>手動同步這項至 Notion</button>}
   </li>)}
  </ul>}
  <details>
   <summary>Notion 輔助同步（選用，需要網路）</summary>
   <p>Notion 只提供外部備份與跨工具檢視。未連線、無金鑰或 Notion 故障時，本地排程與 AI 模型皆不受影響；不會在恢復網路時自動上傳。</p>
   {privateMode?<p>私人模式不允許外部同步。</p>:!weiGuoApiBase()?<p>目前未配置 Notion 後端，不需要為本地使用而設定。</p>:!weiGuoIdentity()?<p>要使用 Notion，請先至衞國以 Google 身分登入。<button type="button" onClick={()=>window.dispatchEvent(new Event('vanilla-open-weiguo'))}>開啟衞國</button></p>:weiGuoIdentity()?.role==='viewer'?<p>此帳號目前只有檢視身分，無法寫入 Notion。</p>:<>
    <label className="detroit-consent"><input type="checkbox" checked={approveSync} onChange={e=>setApproveSync(e.target.checked)}/> 我了解只有主動點擊同步，才會把所選任務內容送至 Notion。</label>
    <button type="button" disabled={busy||!approveSync} onClick={()=>void readNotion()}><RefreshCw size={16}/> 手動檢查 Notion 任務</button>
    {notionStatus&&!notionStatus.configured&&<p>Notion Integration 尚未啟用。</p>}
    {remoteTasks.length>0&&<p>Notion 已有 {remoteTasks.length} 項任務（只做對照，不會覆寫本機）。</p>}
    {remoteMore&&<p>Notion 尚有其他任務未列入此次對照。</p>}
   </>}
  </details>
  {notice&&<p role="status">{notice}</p>}
 </section>;
