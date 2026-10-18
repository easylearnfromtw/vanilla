import {useCallback,useEffect,useRef,useState} from "react";
import {Cloud,CloudOff,RefreshCcw,Upload,Plus,FileText,FileSpreadsheet,Trash2,Download,ExternalLink,Save,Search,PenLine,FolderOpen,X,AlertTriangle} from "lucide-react";
import {connectWorkspaceDrive,driveSession,listWorkspaceFiles,createWorkspaceText,uploadWorkspaceFile,getWorkspaceText,updateWorkspaceText,trashWorkspaceFile,renameWorkspaceFile,getWorkspaceBlob,isTextFile,type WorkspaceFile} from "./cloud-drive";
import {parseWorkbook} from "./sheets-model";

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
 useEffect(()=>{void refresh();},[refresh]);
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
  try{await trashWorkspaceFile(token,file);if(editor?.file.id===file.id)setEditor(null);await refresh(token);setStatus("已移至垃圾桶："+file.name);}
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
   <div className="files-create"><input aria-label="新檔案名稱" value={createName} onChange={e=>setCreateName(e.target.value)} placeholder="輸入新檔案名稱（不含副檔名）"/><select value={createType} aria-label="選擇檔案格式" onChange={e=>setCreateType(e.target.value as typeof createType)}><option value="txt">文字 .txt</option><option value="md">Markdown .md</option><option value="csv">表格 .csv</option><option value="json">資料 .json</option></select><button type="button" disabled={busy} onClick={()=>void create()}><Plus size={16}/>建立檔案</button></div>
   <div className="files-browser">
    <div className="files-browser-top"><FolderOpen size={16}/>Vanilla Workspace <span>{visible.length} 個檔案</span></div>
    {loading?<p className="files-empty">正在讀取 Google Drive…</p>:visible.length===0?<p className="files-empty">{filter?"找不到符合搜尋的檔案":"尚無檔案。建立文字、Markdown 或 CSV，或從裝置上傳檔案。"}</p>:<div className="files-list">
     {visible.map(file=><div className="files-item" key={file.id}><span className="files-type">{/\.csv$|\.vanilla-sheet\.json$/i.test(file.name)?<FileSpreadsheet size={20}/>:<FileText size={20}/>}</span><div className="files-info"><strong title={file.name}>{file.name}</strong><small>{file.modifiedTime?new Date(file.modifiedTime).toLocaleString("zh-TW"):""} · {file.size?Math.ceil(Number(file.size)/1024)+" KB":file.mimeType}</small></div>
      <div className="files-actions">
       <button type="button" disabled={busy} title="預覽或在表格開啟" onClick={()=>void open(file)}><FolderOpen size={16}/><span>開啟</span></button>
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
