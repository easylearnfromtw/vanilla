import {useCallback,useEffect,useRef,useState} from "react";
import {Cloud,CloudOff,RefreshCcw,Upload,Plus,FileText,FileSpreadsheet,Trash2,Download,ExternalLink,Save,Search,PenLine,FolderOpen,X,AlertTriangle} from "lucide-react";
import {connectWorkspaceDrive,driveSession,listWorkspaceFiles,createWorkspaceText,uploadWorkspaceFile,getWorkspaceText,updateWorkspaceText,trashWorkspaceFile,renameWorkspaceFile,getWorkspaceBlob,isTextFile,type WorkspaceFile} from "./cloud-drive";
import {parseWorkbook,parseCSV} from "./sheets-model";
import {parseFileCommand,type FileCommand} from "./file-commands";

type Editor={file:WorkspaceFile;text:string;baseline:string};
export default function CloudFiles(){
 const [session,setSession]=useState(driveSession);
 const [files,setFiles]=useState<WorkspaceFile[]>([]);
 const [filter,setFilter]=useState("");
 const [editor,setEditor]=useState<Editor|null>(null);
 const [status,setStatus]=useState("");
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [createType,setCreateType]=useState<"txt"|"md"|"csv"|"json">("txt");
 const [createName,setCreateName]=useState("");
 const [commandText,setCommandText]=useState("");
 const [pendingCommand,setPendingCommand]=useState<FileCommand|null>(null);
 const uploadRef=useRef<HTMLInputElement>(null);
 const token=session?.token;
 const refresh=useCallback(async(t?:string)=>{
  const access=t||driveSession()?.token;
  if(!access){setSession(null);setFiles([]);setStatus("請先授權 Google Drive，才能查看 Vanilla 建立的檔案");return;}
  setLoading(true);
  try{
   const all=await listWorkspaceFiles(access);
   setFiles(all);
   setStatus("找到 "+all.length+" 個由 Vanilla 管理的雲端檔案");
  }catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{
  void refresh();
  const changed=()=>void refresh();
  window.addEventListener("vanilla-workspace-changed",changed);
  window.addEventListener("vanilla-drive-connected",changed);
  window.addEventListener("vanilla-memory-changed",changed);
  return()=>{
   window.removeEventListener("vanilla-workspace-changed",changed);
   window.removeEventListener("vanilla-drive-connected",changed);
   window.removeEventListener("vanilla-memory-changed",changed);
  };
 },[refresh]);
 async function connect(){
  setBusy(true);
  try{const authorized=await connectWorkspaceDrive();setSession(authorized);await refresh(authorized.token);}
  catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function create(){
  if(!token||busy)return;
  const name=(createName.trim()||"未命名")+"."+createType;
  const initial=createType==="csv"?"欄位 A,欄位 B\n,\n":createType==="json"?"{}\n":createType==="md"?"# 新文件\n":"";
  setBusy(true);
  try{
   const mimetype=createType==="json"?"application/json":createType==="csv"?"text/csv":createType==="md"?"text/markdown":"text/plain";
   const result=await createWorkspaceText(token,name,initial,mimetype);
   await refresh(token);setCreateName("");
   setStatus("已建立："+result.name);
   setEditor({file:result,text:initial,baseline:initial});
  }catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function upload(incoming:FileList|null){
  if(!incoming?.length||!token||busy)return;
  setBusy(true);let success=0;
  try{
   for(const file of Array.from(incoming).slice(0,15)){
    await uploadWorkspaceFile(token,file.name,file);
    success++;
   }
   await refresh(token);setStatus("已上傳 "+success+" 個檔案。");
  }catch(e){setStatus("上傳 "+success+" 個後停止："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);if(uploadRef.current)uploadRef.current.value="";}
 }
 async function open(file:WorkspaceFile){
  if(!token||busy)return;
  if(file.name.toLowerCase().endsWith(".vanilla-sheet.json")){
   try{
    setBusy(true);
    const data=parseWorkbook(JSON.parse(await getWorkspaceText(token,file.id)) as unknown);
    window.dispatchEvent(new CustomEvent("vanilla-open-sheet",{detail:{workbook:{...data,driveFileId:file.id,driveVersion:file.version}}}));
    setStatus("正在 Vanilla 表格中開啟："+file.name);
   }catch(e){setStatus(e instanceof Error?e.message:String(e));}
   finally{setBusy(false);}
   return;
  }
  if(!isTextFile(file)){setStatus("這個檔案不是可編輯的純文字。請使用「開啟／下載」檢視。");return;}
  if(editor?.text!==editor?.baseline&&!window.confirm("目前有未儲存修改，確定捨棄並開啟另一個檔案？"))return;
  setBusy(true);
  try{const text=await getWorkspaceText(token,file.id);setEditor({file,text,baseline:text});setStatus("已載入："+file.name);}
  catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function openCSVInSheets(file:WorkspaceFile){
  if(!token||busy)return;
  setBusy(true);
  try{
   const text=await getWorkspaceText(token,file.id);
   const rows=parseCSV(text).slice(0,200).map(row=>row.slice(0,26));
   window.dispatchEvent(new CustomEvent("vanilla-open-sheet",{detail:{rows}}));
   setStatus("正在 Sheets 建立「"+file.name+"」的可編輯副本");
  }catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
  async function save(){
  if(!token||!editor||busy)return;
  setBusy(true);
  try{
   const updated=await updateWorkspaceText(token,editor.file,editor.text);
   setEditor({...editor,file:updated,baseline:editor.text});
   await refresh(token);setStatus("已儲存至 Google Drive："+updated.name);
  }catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function rename(file:WorkspaceFile){
  if(!token||busy)return;
  if(editor&&editor.text!==editor.baseline&&!window.confirm("編輯器仍有未儲存內容。重新命名會關閉編輯器，確定捨棄嗎？"))return;
  const name=window.prompt("新的檔案名稱",file.name);
  if(!name||!name.trim()||name===file.name)return;
  setBusy(true);
  try{
   await renameWorkspaceFile(token,file,name);
   await refresh(token);setEditor(null);setStatus("已重新命名");
  }catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function trash(file:WorkspaceFile){
  if(!token||busy||!window.confirm("確定要將「"+file.name+"」移至 Google Drive 垃圾桶？可從 Google Drive 垃圾桶還原。"))return;
  setBusy(true);
  try{await trashWorkspaceFile(token,file);const after=await listWorkspaceFiles(token);if(after.some(x=>x.id===file.id))throw Error("Google Drive 刪除請求已送出，但檔案仍在工作區列表；請檢查權限");if(editor?.file.id===file.id)setEditor(null);setFiles(after);setStatus("已確認移至 Google Drive 垃圾桶："+file.name);}
  catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function download(file:WorkspaceFile){
  if(!token)return;
  setBusy(true);
  try{
   if(file.mimeType.startsWith("application/vnd.google-apps.")){if(file.webViewLink)window.open(file.webViewLink,"_blank","noopener,noreferrer");else setStatus("Google 原生文件請到 Google Drive 開啟");return;}
   const blob=await getWorkspaceBlob(token,file.id);const href=URL.createObjectURL(blob);
   const link=document.createElement("a");link.href=href;link.download=file.name;link.click();setTimeout(()=>URL.revokeObjectURL(href),2000);
   setStatus("已準備下載："+file.name);
  }catch(e){setStatus(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function executeCommand(){
  if(!pendingCommand||busy)return;
  const command=pendingCommand;
  setPendingCommand(null);
  if(command.kind==="search"){setFilter(command.query);setStatus("已搜尋："+(command.query||"全部檔案"));return;}
  if(command.kind==="open"){await open(command.file);return;}
  if(command.kind==="trash"){await trash(command.file);return;}
  if(command.kind==="rename"){
   if(!token)return;
   if(editor&&editor.text!==editor.baseline&&!window.confirm("目前編輯器有未儲存內容，繼續將捨棄它。確定嗎？"))return;
   setBusy(true);
   try{await renameWorkspaceFile(token,command.file,command.name);await refresh(token);setEditor(null);setStatus("已重新命名："+command.name);}
   catch(e){setStatus(e instanceof Error?e.message:String(e));}
   finally{setBusy(false);}
   return;
  }
  if(command.kind==="create"){
   if(!token)return;
   const ext=command.name.split(".").pop()?.toLowerCase()||"txt";
   const type=ext==="json"?"application/json":ext==="csv"?"text/csv":ext==="md"?"text/markdown":"text/plain";
   const initial=ext==="json"?"{}\n":"";
   setBusy(true);
   try{const result=await createWorkspaceText(token,command.name,initial,type);await refresh(token);setEditor({file:result,text:initial,baseline:initial});setStatus("已建立："+result.name);}
   catch(e){setStatus(e instanceof Error?e.message:String(e));}
   finally{setBusy(false);}
   return;
  }
  if(command.kind==="append"){
   if(!token)return;
   if(!isTextFile(command.file)){setStatus("這不是可編輯文字檔案");return;}
   if(editor&&editor.text!==editor.baseline&&!window.confirm("目前編輯器有未儲存修改，確定放棄嗎？"))return;
   setBusy(true);
   try{const current=await getWorkspaceText(token,command.file.id);setEditor({file:command.file,baseline:current,text:current+(current.endsWith("\n")?"":"\n")+command.text});setStatus("已在編輯器預覽追加內容，請檢查後按儲存變更");}
   catch(e){setStatus(e instanceof Error?e.message:String(e));}
   finally{setBusy(false);}
  }
 }
  const visible=files.filter(x=>x.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
 return <div className="files-studio">
  <div className="workspace-banner"><div className="workspace-banner-icon"><Cloud size={25}/></div><div><h2>Vanilla Cloud Files</h2><p>在同一個工作區搜尋、建立、編輯、整理及移至垃圾桶。採 Google Drive 最小權限，只顯示 Vanilla 有權管理的檔案。</p></div></div>
  <div className="workspace-notice"><AlertTriangle size={16}/><div><strong>雲端檔案不是端對端加密保險庫。</strong>這裡新增的檔案會以一般 Google Drive 檔案形式儲存；不要放入私密模式的對話或敏感內容。Google Docs／Sheets／Slides 原生格式目前仍需在 Google 編輯器編輯。</div></div>
  {!session?<div className="workspace-connect"><CloudOff size={27}/><h3>尚未連接 Google Drive</h3><p>使用現有 Google 帳號授權 Vanilla 建立與管理自己的雲端檔案。已登入過的帳號可能需要重新授權新增的檔案權限。</p><button type="button" disabled={busy} onClick={()=>void connect()}>連接 Google Drive</button></div>:<>
   <div className="files-toolbar"><div className="files-account"><Cloud size={15}/><span>{session.email}</span><button type="button" disabled={busy||loading} onClick={()=>void refresh()} title="重新整理檔案"><RefreshCcw size={15}/></button><button type="button" onClick={()=>void connect()} disabled={busy}>重新授權</button></div>
   <div className="files-controls"><label className="files-search"><Search size={16}/><input type="search" placeholder="搜尋 Vanilla 雲端檔案…" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
    <button type="button" className="workspace-primary" disabled={busy} onClick={()=>uploadRef.current?.click()}><Upload size={15}/>上傳</button>
    <input ref={uploadRef} type="file" multiple hidden onChange={e=>{void upload(e.target.files);}}/>
   </div></div>
   <section className="files-command-bar"><div className="files-command-title"><PenLine size={16}/><strong>對 Vanilla 說你想管理什麼檔案</strong><span>先預覽，再確認</span></div>
    <div className="files-command-input"><input value={commandText} onChange={e=>{setCommandText(e.target.value);setPendingCommand(null);}} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();try{setPendingCommand(parseFileCommand(commandText,files));setStatus("請確認下方操作方案");}catch(error){setStatus(error instanceof Error?error.message:String(error));}}}} placeholder="例如：搜尋 合約、建立 旅行.md、刪除 舊檔案.txt"/><button type="button" onClick={()=>{try{setPendingCommand(parseFileCommand(commandText,files));setStatus("請確認下方操作方案");}catch(error){setStatus(error instanceof Error?error.message:String(error));}}}>解析指令</button></div>
    {pendingCommand&&<div className="files-command-preview"><span>執行方案：{pendingCommand.label}</span><div><button className="workspace-primary" type="button" disabled={busy} onClick={()=>void executeCommand()}>確認執行</button><button type="button" onClick={()=>setPendingCommand(null)}>取消</button></div></div>}
    <p>支援搜尋、建立、讀取、重新命名、移至垃圾桶、文字追加；不會未經你確認就修改檔案。</p>
   </section>
   <div className="files-create"><input aria-label="新檔案名稱" value={createName} onChange={e=>setCreateName(e.target.value)} placeholder="輸入新檔案名稱（不含副檔名）"/><select value={createType} aria-label="選擇檔案格式" onChange={e=>setCreateType(e.target.value as typeof createType)}><option value="txt">文字 .txt</option><option value="md">Markdown .md</option><option value="csv">表格 .csv</option><option value="json">資料 .json</option></select><button type="button" disabled={busy} onClick={()=>void create()}><Plus size={16}/>建立檔案</button></div>
   <div className="files-browser">
    <div className="files-browser-top"><FolderOpen size={16}/>Vanilla Workspace <span>{visible.length} 個檔案</span></div>
    {loading?<p className="files-empty">正在讀取 Google Drive…</p>:visible.length===0?<p className="files-empty">{filter?"找不到符合搜尋的檔案":"尚無檔案。建立文字、Markdown 或 CSV，或從裝置上傳檔案。"}</p>:<div className="files-list">
     {visible.map(file=><div className="files-item" key={file.id}><span className="files-type">{/\.csv$|\.vanilla-sheet\.json$/i.test(file.name)?<FileSpreadsheet size={20}/>:<FileText size={20}/>}</span><div className="files-info"><strong title={file.name}>{file.name}</strong><small>{file.modifiedTime?new Date(file.modifiedTime).toLocaleString("zh-TW"):""} · {file.size?Math.ceil(Number(file.size)/1024)+" KB":file.mimeType}</small></div>
      <div className="files-actions">
       <button type="button" disabled={busy} title="預覽或在表格開啟" onClick={()=>void open(file)}><FolderOpen size={16}/><span>開啟</span></button>
       {/\.csv$/i.test(file.name)&&<button type="button" disabled={busy} title="在 Vanilla Sheets 建立表格副本" onClick={()=>void openCSVInSheets(file)}><FileSpreadsheet size={16}/></button>}
       <button type="button" disabled={busy} title="下載檔案" onClick={()=>void download(file)}><Download size={16}/></button>
       {file.webViewLink&&<a href={file.webViewLink} target="_blank" rel="noreferrer" title="在 Google Drive 開啟"><ExternalLink size={16}/></a>}
       <button type="button" disabled={busy} title="重新命名" onClick={()=>void rename(file)}><PenLine size={15}/></button>
       <button type="button" disabled={busy} title="移至垃圾桶" onClick={()=>void trash(file)}><Trash2 size={15}/></button>
      </div></div>)}
    </div>}
   </div>
   {editor&&<section className="files-editor"><div className="files-editor-top"><div><span>檔案編輯器</span><strong>{editor.file.name}</strong><small>{editor.text===editor.baseline?"已儲存":"有尚未儲存的修改"}</small></div><div><button type="button" disabled={busy||editor.text===editor.baseline} className="workspace-primary" onClick={()=>void save()}><Save size={15}/>儲存變更</button><button type="button" aria-label="關閉編輯器" onClick={()=>{if(editor.text===editor.baseline||window.confirm("捨棄未儲存修改？"))setEditor(null);}}><X size={17}/></button></div></div>
    <textarea spellCheck={false} aria-label="檔案內容" value={editor.text} onChange={e=>setEditor({...editor,text:e.target.value})} rows={14}/></section>}
  </>}
  <p className="workspace-status" role="status">{busy?"處理中…":status}</p>
  <p className="workspace-footnote">只管理 Vanilla 建立或被明確授權的檔案；不是搜尋整個 Google Drive。相同帳號重新登入後可讀取資料。修改前會比對雲端版本，避免直接覆蓋其他裝置的更新。</p>
 </div>;
}
