import {useCallback,useEffect,useState} from "react";
import {FolderOpen,Trash2,RefreshCw,Save,FileText,Cloud,HardDrive} from "lucide-react";
import {attachmentOwner,changeChatAttachment,getChatAttachment,listChatAttachments,removeChatAttachment,type SavedAttachment} from "./attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
import {exactOwnedCopies,deleteOwnedCopy} from "../local-ai/saved-file-resolver";
import {driveSession} from "../workspace/cloud-drive";
import {forgetMemoryWithAttachment,listMemories,previewMemoryAttachment,updateMemoryDetails,type MemoryRecord} from "../memory/drive-memory";
import {deleteOwnedCopy} from "../local-ai/saved-file-resolver";
import "./library.css";
type Item={kind:"device";entry:SavedAttachment}|{kind:"drive";entry:MemoryRecord};
const uid=(x:Item)=>x.kind+":"+x.entry.id;
export default function ConversationLibrary({onFiles}:{onFiles:()=>void}){
 const [device,setDevice]=useState<SavedAttachment[]>([]);
 const [cloud,setCloud]=useState<MemoryRecord[]>([]);
 const [selected,setSelected]=useState<string>("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const [preview,setPreview]=useState<string>(""),[textContent,setTextContent]=useState(""),[originalText,setOriginalText]=useState("");
 const [name,setName]=useState(""),[note,setNote]=useState("");
 const [filter,setFilter]=useState<"all"|"device"|"drive">("all");
 const owner=attachmentOwner(signedChatAccount());
 const session=driveSession();
 const refresh=useCallback(async()=>{
  setBusy(true);
  try{
   const list=await listChatAttachments(owner);
   setDevice(list);
   if(session){try{setCloud(await listMemories());}catch(e){setCloud([]);setNotice("Google Drive 清單載入失敗："+String(e));}}
   else setCloud([]);
  }catch(e){setNotice("無法載入附件庫："+String(e));}
  finally{setBusy(false);}
 },[owner,session?.email]);
 useEffect(()=>{void refresh();const handler=()=>void refresh();
  window.addEventListener("vanilla-library-changed",handler);
  window.addEventListener("vanilla-memory-changed",handler);
  window.addEventListener("vanilla-drive-connected",handler);
  window.addEventListener("vanilla-drive-disconnected",handler);
  return()=>{
   window.removeEventListener("vanilla-library-changed",handler);window.removeEventListener("vanilla-memory-changed",handler);
   window.removeEventListener("vanilla-drive-connected",handler);window.removeEventListener("vanilla-drive-disconnected",handler);
  };
 },[refresh]);
 const items:Item[]=[...device.map(entry=>({kind:"device" as const,entry})),...cloud.map(entry=>({kind:"drive" as const,entry}))];
 const visible=items.filter(x=>filter==="all"||x.kind===filter);
 const active=items.find(x=>uid(x)===selected);
 useEffect(()=>{
  setPreview("");setTextContent("");setOriginalText("");
  if(!active)return;
  setName(active.kind==="device"?active.entry.name:active.entry.title);
  setNote(active.kind==="device"?active.entry.note:active.entry.description);
  let alive=true,url="";
  void (async()=>{
   try{
    const blob=active.kind==="device"?(await getChatAttachment(active.entry.id,owner)).blob:await previewMemoryAttachment(active.entry.id);
    if(!alive)return;
    const type=blob.type|| (active.kind==="device"?active.entry.type:active.entry.fileMimeType||"");
    if(/^text\//.test(type)||/json/.test(type)){if(blob.size<=1000000){const content=(await blob.text()).slice(0,100000);if(alive){setTextContent(content);setOriginalText(content);}}return;}
    if(blob.size<=16*1024*1024&&(/^(?:image|audio|video)\//.test(type)||type==="application/pdf")){url=URL.createObjectURL(blob);setPreview(url);}
   }catch(e){if(alive)setNotice("附件預覽失敗："+String(e));}
  })();
  return()=>{alive=false;if(url)URL.revokeObjectURL(url);};
 },[selected,owner]);
 async function save(){
  if(!active)return;
  setBusy(true);
  try{
   if(active.kind==="device"){
    const changed=textContent!==originalText&&active.entry.size<=1000000?new File([textContent],name,{type:active.entry.type||"text/plain"}):undefined;
    await changeChatAttachment(active.entry.id,owner,{name,note,file:changed});
   }
   else await updateMemoryDetails(active.entry.id,{title:name,description:note});
   setOriginalText(textContent);setNotice("已保存修改；若為本機文字檔，文字內容也已寫回。Google Drive 原始檔案未被覆寫。");
   await refresh();
  }catch(e){setNotice("修改失敗："+String(e));}finally{setBusy(false);}
 }
 async function replaceFile(file?:File){
  if(!file||!active||active.kind!=="device")return;
  if(!window.confirm("確定用「"+file.name+"」替換這份本機附件內容？原始檔案將不再保留於此資料庫。"))return;
  setBusy(true);try{await changeChatAttachment(active.entry.id,owner,{name:file.name,file});await refresh();setSelected("");setNotice("已替換本機附件。Google Drive 上的副本不受影響。");}catch(e){setNotice("替換失敗："+String(e));}finally{setBusy(false);}
 }
 async function remove(){
  if(!active||busy)return;
  const target=active.kind==="device"?
   {id:active.entry.id,name:active.entry.name,source:"device" as const}:
   {id:active.entry.id,name:active.entry.title,source:"drive-memory" as const};
  setBusy(true);setNotice("正在從 "+(active.kind==="device"?"本機附件庫":"Google Drive 記憶索引與原始附件")+" 刪除...");
  try{
   await deleteOwnedCopy(target);
   setSelected("");setPreview("");setTextContent("");setOriginalText("");
   setNotice("已確認刪除「"+target.name+"」的 "+(active.kind==="device"?"本機附件":"雲端記憶及可管理的原始檔案")+"。");
   await refresh();
  }catch(e){setNotice("刪除未完成，原檔案可能仍存在："+String(e));}
  finally{setBusy(false);}
 }

 const fileType=active?.kind==="device"?active.entry.type:active?.entry.fileMimeType||"";
 return <section className="conversation-library">
  <div className="library-header"><div><small>VANILLA / PERSONAL LIBRARY</small><h2>對話檔案與圖片</h2><p>管理對話附件的本機副本與已授權的 Google Drive 記憶；不同帳號的資料不會自動合併。</p></div><button type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={15}/>重新整理</button></div>
  {!session&&<p className="library-hint">目前未登入 Google。此處僅顯示此裝置的本機附件；登入後可查看個人 Drive 記憶。</p>}
  <div className="library-filters">{(["all","device","drive"] as const).map(x=><button type="button" key={x} className={filter===x?"active":""} onClick={()=>setFilter(x)}>{x==="all"?"全部":x==="device"?"本機附件":"Google Drive"}</button>)}</div>
  <div className="library-grid"><div className="library-list" aria-label="保存的附件清單">{visible.length?visible.map(item=><button type="button" key={uid(item)} className={selected===uid(item)?"active":""} onClick={()=>setSelected(uid(item))}>
    {item.kind==="device"?<HardDrive size={16}/>:<Cloud size={16}/>}<span><strong>{item.kind==="device"?item.entry.name:item.entry.title}</strong><small>{item.kind==="device"?"此裝置":"Google Drive"} · {item.entry.createdAt.slice(0,10)}</small></span>
   </button>):<p>目前沒有符合的附件；一般模式在聊天上傳的檔案會保存本機副本。</p>}</div>
  <div className="library-detail">{!active?<div className="library-empty"><FolderOpen size={32}/><p>選取左側檔案即可預覽、修改名稱／註記，或刪除。</p></div>:<>
   <h3>{active.kind==="device"?"本機檔案":"Drive 記憶"}</h3>
   {preview&&fileType.startsWith("image/")&&<img src={preview} alt={name} className="library-media"/>}
   {preview&&fileType.startsWith("video/")&&<video src={preview} controls preload="metadata" className="library-media"/>}
   {preview&&fileType.startsWith("audio/")&&<audio src={preview} controls/>}
   {preview&&fileType==="application/pdf"&&<iframe src={preview} title={"預覽 "+name} sandbox="" className="library-document"/>}
   {(textContent||originalText)&&<label>檔案文字內容（本機檔案可直接修改）<textarea className="library-text" rows={9} value={textContent} onChange={e=>setTextContent(e.target.value.slice(0,100000))} readOnly={active.kind!=="device"}/></label>}
   {!preview&&!textContent&&<p className="library-hint"><FileText size={15}/>此檔案暫不支援頁內預覽；可修改資訊，或到雲端檔案管理查看來源。</p>}
   <label>名稱 <input value={name} maxLength={180} onChange={e=>setName(e.target.value)}/></label>
   <label>註記／文字內容索引 <textarea rows={5} value={note} maxLength={4000} onChange={e=>setNote(e.target.value)} /></label>
   <div className="library-actions">
    <button type="button" disabled={busy} onClick={()=>void save()}><Save size={15}/>儲存修改</button>
    {active.kind==="device"&&<label className="library-replace">替換檔案<input type="file" hidden onChange={e=>{void replaceFile(e.target.files?.[0]);e.target.value="";}}/></label>}
    {active.kind==="drive"&&<button type="button" onClick={onFiles}>雲端檔案管理</button>}
    <button type="button" className="delete" disabled={busy} onClick={()=>void remove()}><Trash2 size={15}/>刪除</button>
   </div>
   {active.kind==="device"&&<small>已保存在此瀏覽器的 IndexedDB；刪除網站資料可能一併刪除。私密模式附件不會進入資料庫。</small>}
   </>}
  </div></div>
  {notice&&<p className="library-notice" role="status">{notice}</p>}
 </section>;
}
