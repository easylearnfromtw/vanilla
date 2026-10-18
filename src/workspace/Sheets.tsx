import {useEffect,useRef,useState,type ClipboardEvent} from "react";
import {Table2,Plus,FolderOpen,Download,Undo2,Redo2,Bold,AlignCenter,AlignLeft,AlignRight,Coins,Percent,Palette,CloudUpload,Trash2,Sparkles,Check,FileSpreadsheet,AlertTriangle} from "lucide-react";
import {newWorkbook,parseWorkbook,activeSheet,getCell,cellDisplay,setCell,cellAddress,columnName,decodeAddress,importRows,parseCSV,toCSV,type Workbook,type CellStyle} from "./sheets-model";
import {driveSession,connectWorkspaceDrive,createWorkspaceText,updateWorkspaceText,type WorkspaceFile} from "./cloud-drive";
import {availableProviders,generateCloudReply} from "../vault/providers";
import {isOllamaConfigured,generateOllamaReply} from "../ai/ollama";

const STORAGE_KEY="vanilla.sheets.workbooks.v1";
const CURRENT_KEY="vanilla.sheets.current.v1";
const PENDING_KEY="vanilla.sheets.pending-import.v1";
type Edit={cell:string;from:string;to:string};
function loadBooks():Workbook[]{
 try{
  const parsed:unknown=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
  const books=Array.isArray(parsed)?parsed.slice(0,30).map(x=>{try{return parseWorkbook(x);}catch{return null;}}).filter((x):x is Workbook=>Boolean(x)):[];
  return books.length?books:[newWorkbook("我的第一份表格")];
 }catch{return [newWorkbook("我的第一份表格")];}
}
function downloadBlob(filename:string,body:Blob){
 const url=URL.createObjectURL(body),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function safeName(name:string){return name.trim().replace(/[\\/]/g,"_").slice(0,90)||"未命名表格";}
function readAIChanges(raw:string,book:Workbook):Edit[]{
 const source=raw.trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
 let obj:unknown;
 try{obj=JSON.parse(source);}catch{
  const start=source.indexOf("{"),end=source.lastIndexOf("}");
  if(start<0||end<=start)throw Error("AI 沒有回傳可驗證的 JSON 修改方案");
  obj=JSON.parse(source.slice(start,end+1)) as unknown;
 }
 if(!obj||typeof obj!=="object"||!Array.isArray((obj as {changes?:unknown}).changes))throw Error("AI 修改格式無效");
 const arr=(obj as {changes:unknown[]}).changes;
 if(arr.length>100)throw Error("單次 AI 修改最多 100 格，請拆成多個任務");
 const result=new Map<string,Edit>();
 for(const item of arr){
  if(!item||typeof item!=="object")throw Error("AI 修改項目格式錯誤");
  const cell=(item as {cell?:unknown}).cell,value=(item as {value?:unknown}).value;
  if(typeof cell!=="string"||!decodeAddress(cell))throw Error("AI 修改包含超出 A1:Z200 的位置");
  if(typeof value!=="string"&&typeof value!=="number")throw Error("AI 儲存格內容必須是文字或數字");
  const addr=cell.toUpperCase(),to=String(value).slice(0,10000);
  result.set(addr,{cell:addr,from:getCell(book,addr).raw,to});
 }
 return [...result.values()].filter(x=>x.from!==x.to);
}
function localProposal(prompt:string,book:Workbook):Edit[]|null{
 const statements=prompt.split(/[\n;；]+/).map(x=>x.trim()).filter(Boolean);
 if(statements.length===0)return [];
 const changes:Edit[]=[];
 for(const line of statements){
  const m=/^(?:在|將|把)?\s*([A-Z]{1,2}[1-9][0-9]*)\s*(?:設為|改成|填入|輸入|=|:|：)\s*([\s\S]+)$/i.exec(line);
  const clear=/^(?:清空|清除)\s*([A-Z]{1,2}[1-9][0-9]*)$/i.exec(line);
  const addr=(m?.[1]||clear?.[1]||"").toUpperCase();
  if(!decodeAddress(addr))return null;
  const value=m?m[2]:"";
  changes.push({cell:addr,from:getCell(book,addr).raw,to:value});
 }
 return changes;
}
function CellInput({address,raw,display,active,onFocus,onCommit,onPaste,style}:{address:string;raw:string;display:string;active:boolean;onFocus:(cell:string)=>void;onCommit:(cell:string,value:string)=>void;onPaste:(e:ClipboardEvent<HTMLInputElement>,cell:string)=>void;style?:CellStyle}){
 const [draft,setDraft]=useState(display);
 useEffect(()=>{setDraft(active?raw:display);},[raw,display,active]);
 return <input aria-label={"儲存格 "+address} className={"sheet-input "+(style?.bold?"bold ":"")+(style?.fill&&style.fill!=="none"?"fill-"+style.fill:"")} style={{textAlign:style?.align||"left"}} value={draft} onFocus={()=>{onFocus(address);setDraft(raw);}} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==raw)onCommit(address,draft);}} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();e.currentTarget.blur();}}} onPaste={e=>onPaste(e,address)} />;
}
const TEMPLATE_LIST=[
 {id:"budget",label:"收支預算",rows:[["日期","項目","類別","收入","支出","餘額"],["2026-10-18","範例","日常",1000,200,"=D2-E2"],["","總計","","=SUM(D2:D30)","=SUM(E2:E30)","=D3-E3"]]},
 {id:"trip",label:"旅行規劃",rows:[["日期","時間","景點／活動","地址","交通","預算","備註"],["","","","","","",""]]},
 {id:"fitness",label:"健康運動",rows:[["日期","項目","距離 km","時間 min","心率 bpm","備註"],["","","","","",""]]}
] as const;
export default function Sheets(){
 const [books,setBooks]=useState<Workbook[]>(loadBooks);
 const [selectedId,setSelectedId]=useState(()=>{try{return localStorage.getItem(CURRENT_KEY)||"";}catch{return "";}});
 const book=books.find(x=>x.id===selectedId)||books[0];
 const [cell,setSelectedCell]=useState("A1");
 const [formula,setFormula]=useState("");
 const [rowsShown,setRowsShown]=useState(32);
 const [rowOffset,setRowOffset]=useState(0);
 const [colsShown,setColsShown]=useState(12);
 const [notice,setNotice]=useState("");
 const [aiPrompt,setAiPrompt]=useState("");
 const [aiPending,setAiPending]=useState<Edit[]>([]);
 const [aiBusy,setAiBusy]=useState(false);
 const [busy,setBusy]=useState(false);
 const [aiProvider,setAiProvider]=useState<"auto"|"gemini"|"ollama">("auto");
 const [undoCount,setUndoCount]=useState(0);
 const [redoCount,setRedoCount]=useState(0);
 const undo=useRef<Workbook[]>([]),redo=useRef<Workbook[]>([]);
 const importRef=useRef<HTMLInputElement>(null);
 const tab=activeSheet(book);
 useEffect(()=>{const wait=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(books));localStorage.setItem(CURRENT_KEY,book.id);}catch{setNotice("本機儲存空間不足，請先匯出 JSON 備份");}},450);return()=>clearTimeout(wait);},[books,book.id]);
 useEffect(()=>{setFormula(getCell(book,cell).raw);},[book,cell]);
 useEffect(()=>{
  const raw=localStorage.getItem(PENDING_KEY);
  if(!raw)return;
  localStorage.removeItem(PENDING_KEY);
  try{
   const pending=JSON.parse(raw) as {workbook?:unknown;rows?:string[][]};
   let fresh=pending.workbook?parseWorkbook(pending.workbook):newWorkbook("AI 生成表格");
   if(!pending.workbook&&Array.isArray(pending.rows))fresh=importRows(fresh,pending.rows);
   // Create a distinct local working copy rather than silently overwriting an existing book.
   fresh={...fresh,id:crypto.randomUUID(),name:safeName(fresh.name),updatedAt:new Date().toISOString()};
   setBooks(prev=>[...prev,fresh].slice(-30));setSelectedId(fresh.id);setNotice("已在 Vanilla Sheets 中建立可編輯副本："+fresh.name);
  }catch(e){setNotice("開啟表格失敗："+(e instanceof Error?e.message:String(e)));}
 },[]);
 function resetUndo(){undo.current=[];redo.current=[];setUndoCount(0);setRedoCount(0);}
 function chooseBook(id:string){setSelectedId(id);setSelectedCell("A1");setRowOffset(0);setAiPending([]);resetUndo();}
 function commit(next:Workbook){
  undo.current=[...undo.current,book].slice(-40);redo.current=[];setUndoCount(undo.current.length);setRedoCount(0);
  setBooks(prev=>prev.map(x=>x.id===book.id?next:x));
 }
 function undoLast(){
  const prev=undo.current.pop();if(!prev)return;
  redo.current.push(book);setBooks(books=>books.map(x=>x.id===book.id?prev:x));setUndoCount(undo.current.length);setRedoCount(redo.current.length);setAiPending([]);
 }
 function redoLast(){
  const next=redo.current.pop();if(!next)return;
  undo.current.push(book);setBooks(books=>books.map(x=>x.id===book.id?next:x));setUndoCount(undo.current.length);setRedoCount(redo.current.length);setAiPending([]);
 }
 function updateCell(address:string,value:string){if(getCell(book,address).raw===value)return;commit(setCell(book,address,value));setAiPending([]);}
 function changeStyle(patch:CellStyle){
  const current=getCell(book,cell),style={...current.style,...patch};
  commit(setCell(book,cell,current.raw,style));
 }
 function paste(e:ClipboardEvent<HTMLInputElement>,origin:string){
  const raw=e.clipboardData.getData("text/plain");
  if(!raw.includes("\n")&&!raw.includes("\t"))return;
  const position=decodeAddress(origin);if(!position)return;
  e.preventDefault();const lines=raw.trimEnd().split(/\r?\n/).map(row=>row.split("\t"));
  let next=book;
  for(let i=0;i<Math.min(lines.length,200-position.row);i++)for(let j=0;j<Math.min(lines[i].length,26-position.col);j++){
   next=setCell(next,cellAddress(position.row+i,position.col+j),lines[i][j]);
  }
  commit(next);setNotice("已貼上 "+lines.length+" 列資料");
 }
 function newBook(templateId?:string){
  if(books.length>=30){setNotice("本機最多保留 30 份表格，請先備份或刪除舊表格");return;}
  let fresh=newWorkbook(templateId?TEMPLATE_LIST.find(x=>x.id===templateId)?.label||"新表格":"新表格");
  if(templateId){
   const template=TEMPLATE_LIST.find(x=>x.id===templateId);
   if(template)fresh=importRows(fresh,template.rows.map(x=>x.map(String)));
  }
  setBooks(prev=>[...prev,fresh]);chooseBook(fresh.id);setNotice("已建立："+fresh.name);
 }
 function addSheet(){
  if(book.sheets.length>=20){setNotice("每份表格最多 20 個工作表");return;}
  const id=crypto.randomUUID(),sheets=[...book.sheets,{id,name:"工作表 "+(book.sheets.length+1),cells:{}}];
  commit({...book,sheets,active:id,updatedAt:new Date().toISOString()});setSelectedCell("A1");
 }
 function renameSheet(){
  const name=window.prompt("修改工作表名稱",tab.name)?.trim();if(!name)return;
  commit({...book,sheets:book.sheets.map(x=>x.id===tab.id?{...x,name:name.slice(0,60)}:x),updatedAt:new Date().toISOString()});
 }
 function removeSheet(){
  if(book.sheets.length<=1){setNotice("至少需要保留一個工作表");return;}
  if(!window.confirm("確定刪除工作表「"+tab.name+"」？可使用復原。"))return;
  const sheets=book.sheets.filter(x=>x.id!==tab.id);
  commit({...book,sheets,active:sheets[0].id,updatedAt:new Date().toISOString()});
 }
 async function openImport(input:FileList|null){
  const file=input?.[0];if(!file)return;
  if(file.size>5*1024*1024){setNotice("檔案不得超過 5 MB");return;}
  try{
   const text=await file.text();
   if(/\.json$/i.test(file.name)){
    const data=parseWorkbook(JSON.parse(text) as unknown);
    if(books.length>=30)throw Error("表格數量已達 30 份");
    const fresh={...data,id:crypto.randomUUID(),driveFileId:undefined,driveVersion:undefined,name:data.name+"（匯入）"};
    setBooks(prev=>[...prev,fresh]);chooseBook(fresh.id);setNotice("已匯入 "+fresh.sheets.length+" 個工作表");
   }else{
    const fresh=importRows(newWorkbook(file.name.replace(/\.[^.]+$/,"")),parseCSV(text));
    setBooks(prev=>[...prev,fresh].slice(-30));chooseBook(fresh.id);setNotice("已匯入 CSV");
   }
  }catch(e){setNotice("匯入失敗："+(e instanceof Error?e.message:String(e)));}
  finally{if(importRef.current)importRef.current.value="";}
 }
 function exportBook(format:"json"|"csv"){
  const name=safeName(book.name);
  const body=format==="json"?JSON.stringify(book,null,2):toCSV(book);
  downloadBlob(name+(format==="json"?".vanilla-sheet.json":".csv"),new Blob([body],{type:format==="json"?"application/json;charset=utf-8":"text/csv;charset=utf-8"}));
  setNotice("已匯出 "+format.toUpperCase());
 }
 async function cloudSave(copy=false){
  if(busy)return;
  setBusy(true);
  try{
   const session=driveSession()||await connectWorkspaceDrive();
   const content=JSON.stringify({...book,updatedAt:new Date().toISOString()},null,2);
   let metadata:WorkspaceFile;
   if(!copy&&book.driveFileId){
    metadata=await updateWorkspaceText(session.token,{id:book.driveFileId,name:safeName(book.name)+".vanilla-sheet.json",mimeType:"application/json",version:book.driveVersion},content);
   }else{
    metadata=await createWorkspaceText(session.token,safeName(book.name)+".vanilla-sheet.json",content,"application/json");
   }
   const next={...book,driveFileId:metadata.id,driveVersion:metadata.version,updatedAt:new Date().toISOString()};
   setBooks(prev=>prev.map(x=>x.id===book.id?next:x));
   setNotice("已"+(copy?"另存":"儲存")+"至 Google Drive 的 Vanilla Workspace："+metadata.name);
  }catch(e){setNotice("雲端儲存失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 async function previewAI(){
  if(!aiPrompt.trim()||aiBusy)return;
  const local=localProposal(aiPrompt,book);
  if(local){
   setAiPending(local);setNotice(local.length?"已產生本機修改預覽，尚未套用":"沒有需要變更的儲存格");return;
  }
  const provider=aiProvider==="auto"?(isOllamaConfigured()?"ollama":availableProviders().includes("gemini")?"gemini":null):aiProvider;
  if(!provider||(provider==="gemini"&&!availableProviders().includes("gemini"))||(provider==="ollama"&&!isOllamaConfigured())){setNotice("此複雜修改需要先連接 Ollama 或 Gemini；簡單修改可輸入：A1=姓名，B1=金額");return;}
  const rows=Object.entries(tab.cells).slice(0,120).map(([address,value])=>({cell:address,value:value.raw}));
  if(!window.confirm("這次將把目前工作表最多 120 個非空儲存格、工作表名稱及修改要求傳送到 "+(provider==="gemini"?"Gemini 雲端 API":"你設定的 Ollama 主機")+"，產生 JSON 修改草稿。草稿不會自動執行。是否同意？"))return;
  const instruction='請只回傳 JSON 物件，格式 {"changes":[{"cell":"A1","value":"文字或 =SUM(B1:B5)"}]}；不要 Markdown、不加說明。只能修改 A1 至 Z200、最多 100 個儲存格。目標：'+aiPrompt+"。工作表："+tab.name+"。現有非空儲存格："+JSON.stringify(rows);
  setAiBusy(true);setNotice("正在生成 AI 修改預覽…");
  try{
   const response=provider==="gemini"?await generateCloudReply("gemini",[{role:"user",content:instruction}]):await generateOllamaReply([{role:"user",content:instruction}]);
   const changes=readAIChanges(response,book);setAiPending(changes);setNotice("AI 已提出 "+changes.length+" 格修改，請先檢查差異再確認。");
  }catch(e){setNotice("AI 修改預覽失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setAiBusy(false);}
 }
 function applyAI(){if(!aiPending.length)return;let next=book;for(const edit of aiPending)next=setCell(next,edit.cell,edit.to);commit(next);setAiPending([]);setNotice("已套用 AI 修改，可按「復原」回到原始版本");}
 return <div className="sheets-studio">
  <div className="workspace-banner"><div className="workspace-banner-icon"><Table2 size={25}/></div><div><h2>Vanilla Sheets</h2><p>用自然語言規劃、逐格編輯與計算；AI 提案確認後才套用。本機編輯、手動同步雲端。</p></div></div>
  <div className="sheet-topbar">
   <div className="sheet-workbooks"><label htmlFor="sheet-workbook-select">工作簿</label><select id="sheet-workbook-select" value={book.id} onChange={e=>chooseBook(e.target.value)}>{books.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
    <button type="button" onClick={()=>newBook()}><Plus size={15}/>新表格</button>
    <button type="button" disabled={books.length<=1} title="刪除目前表格" onClick={()=>{if(!window.confirm("確定刪除本機工作簿「"+book.name+"」？請先匯出備份。"))return;setBooks(x=>x.filter(v=>v.id!==book.id));setSelectedId(books.find(x=>x.id!==book.id)?.id||"");resetUndo();}}><Trash2 size={15}/></button>
   </div>
   <div className="sheet-rename"><label htmlFor="sheet-book-title">名稱</label><input id="sheet-book-title" value={book.name} onChange={e=>setBooks(prev=>prev.map(x=>x.id===book.id?{...x,name:e.target.value.slice(0,120)}:x))} onBlur={()=>{if(!book.name.trim())setBooks(prev=>prev.map(x=>x.id===book.id?{...x,name:"未命名表格"}:x));}}/></div>
   <div className="sheet-actions">
    <button type="button" onClick={undoLast} disabled={undoCount===0} title="復原"><Undo2 size={16}/></button>
    <button type="button" onClick={redoLast} disabled={redoCount===0} title="重做"><Redo2 size={16}/></button>
    <button type="button" onClick={()=>exportBook("csv")}><Download size={15}/>CSV</button>
    <button type="button" onClick={()=>exportBook("json")}><Download size={15}/>JSON</button>
    <button type="button" onClick={()=>importRef.current?.click()}><FolderOpen size={15}/>匯入</button>
    <input ref={importRef} type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={e=>{void openImport(e.target.files);}}/>
    <button type="button" className="workspace-primary" disabled={busy} onClick={()=>void cloudSave()}><CloudUpload size={15}/>儲存雲端</button>
    {book.driveFileId&&<button type="button" disabled={busy} onClick={()=>void cloudSave(true)}>另存雲端副本</button>}
   </div>
  </div>
  <div className="sheet-toolstrip">
   <label htmlFor="sheet-address">儲存格</label><input id="sheet-address" className="sheet-address" value={cell} onChange={e=>{const val=e.target.value.toUpperCase();setSelectedCell(val);}} onBlur={()=>{if(!decodeAddress(cell))setSelectedCell("A1");}}/>
   <label htmlFor="sheet-formula">內容／公式</label><input id="sheet-formula" className="sheet-formula" value={formula} onChange={e=>setFormula(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();updateCell(cell,formula);}}} onBlur={()=>{if(decodeAddress(cell)&&formula!==getCell(book,cell).raw)updateCell(cell,formula);}} placeholder="輸入文字、數字或 =SUM(A1:A5)"/>
   <button title="粗體" aria-label="粗體" type="button" onClick={()=>changeStyle({bold:!getCell(book,cell).style?.bold})}><Bold size={16}/></button>
   <button title="靠左" aria-label="靠左" type="button" onClick={()=>changeStyle({align:"left"})}><AlignLeft size={16}/></button>
   <button title="置中" aria-label="置中" type="button" onClick={()=>changeStyle({align:"center"})}><AlignCenter size={16}/></button>
   <button title="靠右" aria-label="靠右" type="button" onClick={()=>changeStyle({align:"right"})}><AlignRight size={16}/></button>
   <button title="新臺幣" aria-label="新臺幣格式" type="button" onClick={()=>changeStyle({format:"currency"})}><Coins size={16}/></button>
   <button title="百分比" aria-label="百分比格式" type="button" onClick={()=>changeStyle({format:"percent"})}><Percent size={16}/></button>
   <button title="標記底色" aria-label="標記底色" type="button" onClick={()=>changeStyle({fill:getCell(book,cell).style?.fill==="accent"?"none":"accent"})}><Palette size={16}/></button>
  </div>
  <div className="sheet-grid-scroller" role="region" aria-label="工作表可編輯網格" tabIndex={0}><table className="sheet-grid"><thead><tr><th className="sheet-corner">#</th>{Array.from({length:colsShown},(_,i)=><th key={i}>{columnName(i)}</th>)}</tr></thead><tbody>
   {Array.from({length:Math.min(rowsShown,200-rowOffset)},(_,index)=>{const row=rowOffset+index;return <tr key={row}><th>{row+1}</th>{Array.from({length:colsShown},(_,col)=>{
    const address=cellAddress(row,col);
    return <td key={address} className={cell===address?"sheet-active":""}><CellInput address={address} raw={getCell(book,address).raw} display={cellDisplay(book,address)} active={cell===address} style={getCell(book,address).style} onFocus={addr=>setSelectedCell(addr)} onCommit={updateCell} onPaste={paste}/></td>;
   })}</tr>;})}
  </tbody></table></div>
  <div className="sheet-bottom"><div className="sheet-tabs">{book.sheets.map(x=><button type="button" key={x.id} className={x.id===book.active?"selected":""} onClick={()=>{commit({...book,active:x.id});setSelectedCell("A1");}}>{x.name}</button>)}<button type="button" onClick={addSheet} title="新增工作表"><Plus size={16}/></button><button type="button" onClick={renameSheet} title="重新命名此工作表">重新命名</button><button type="button" onClick={removeSheet} title="刪除目前工作表"><Trash2 size={14}/></button></div><div className="sheet-size"><button type="button" disabled={rowOffset===0} onClick={()=>setRowOffset(Math.max(0,rowOffset-rowsShown))}>上一頁</button><span>{rowOffset+1}–{Math.min(200,rowOffset+rowsShown)} / 200</span><button type="button" disabled={rowOffset+rowsShown>=200} onClick={()=>setRowOffset(Math.min(200-rowsShown,rowOffset+rowsShown))}>下一頁</button><button type="button" disabled={rowsShown>=80} onClick={()=>setRowsShown(Math.min(80,rowsShown+20))}>+20 列</button><button type="button" disabled={colsShown>=26} onClick={()=>setColsShown(Math.min(26,colsShown+4))}>+4 欄</button></div></div>
  <section className="sheet-ai"><div className="sheet-ai-heading"><Sparkles size={19}/><div><h3>Vanilla AI 表格助手</h3><p>例：A1=品項；B1=金額，或「替我做一份旅行預算表」。只有你確認後才改動工作簿。</p></div></div>
   <div className="sheet-template-list">{TEMPLATE_LIST.map(x=><button type="button" key={x.id} onClick={()=>newBook(x.id)}><FileSpreadsheet size={14}/>{x.label}</button>)}</div>
   <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="描述你想建立的表格或修改：例如在 A1 輸入月份；在 B1 輸入營收" rows={3}/>
   <div className="sheet-ai-actions"><select value={aiProvider} onChange={e=>setAiProvider(e.target.value as typeof aiProvider)} aria-label="選擇 AI 表格修改模型"><option value="auto">自動（優先 Ollama）</option><option value="ollama">Ollama（自架）</option><option value="gemini">Gemini API</option></select><button type="button" className="workspace-primary" disabled={aiBusy||!aiPrompt.trim()} onClick={()=>void previewAI()}><Sparkles size={15}/>{aiBusy?"規劃中…":"預覽修改"}</button></div>
   {aiPending.length>0&&<div className="sheet-ai-preview"><h4>AI 修改預覽 · {aiPending.length} 格</h4><p>以下修改尚未套用。建議檢查公式及重要數字。</p><div className="sheet-ai-diff">{aiPending.slice(0,100).map(x=><div key={x.cell}><strong>{x.cell}</strong><del>{x.from||"（空白）"}</del><span>→</span><ins>{x.to||"（清空）"}</ins></div>)}</div><div className="sheet-ai-buttons"><button type="button" className="workspace-primary" onClick={applyAI}><Check size={15}/>確認套用</button><button type="button" onClick={()=>setAiPending([])}>取消</button></div></div>}
  </section>
  <div className="workspace-notice"><AlertTriangle size={16}/><span>本機草稿會自動儲存，但不是端對端加密。按「儲存雲端」才會寫入 Google Drive。請勿把私人醫療資料或其他敏感內容上傳到一般雲端檔案區。支援 SUM、AVERAGE、IF、ROUND、COUNT、MAX、MIN；尚不等於完整 Excel。</span></div>
  <p role="status" className="workspace-status">{notice}</p>
  <p className="workspace-footnote">每份工作簿最多 20 個工作表，每個工作表支援 A1:Z200。JSON 可保留公式與格式，CSV 匯出目前工作表的計算結果。支援復原／重做、跨格貼上；Google Drive 遇到版本衝突時不會直接覆寫。</p>
 </div>;
}
