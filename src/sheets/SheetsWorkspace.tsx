import {useEffect,useMemo,useRef,useState} from "react";
import type {ClipboardEvent} from "react";
import {Plus,Download,Upload,Undo2,Redo2,Sparkles,Check,X,Table2,FilePlus2,Trash2,Save,Copy} from "lucide-react";
import {availableProviders} from "../vault/providers";
import {isLocalModelReady} from "../local-ai/engine";
import {isOllamaConfigured} from "../ai/ollama";
import {applyPlan,describePlan,proposeSheetEdit,remoteRoute,resolveRoute,routeIsReady,type SheetPlan,type SheetRoute} from "./ai";
import {LIMIT_COLS,LIMIT_ROWS,COLORS,addressOf,colName,parseAddress,loadWorkbook,saveWorkbook,makeSheet,uniqueSheetName,setCell,setCellStyle,cloneBook,now,displayValue,parseDelimited,rowsToSheet,csvForSheet,download,isWorkbook,emptyWorkbook,type Workbook,type CellFormat,type CellStyle} from "./model";
import "./sheets.css";
import {takeChatTable} from "./bridge";

function starter(kind:"budget"|"travel"|"training"):Workbook{
 const book=emptyWorkbook();const sheet=book.sheets[0];
 const rows=kind==="budget"?[
  ["分類","預算","實際支出","差額"],["住房","","","=B2-C2"],["飲食","","","=B3-C3"],["交通","","","=B4-C4"],["醫療","","","=B5-C5"],["娛樂","","","=B6-C6"],["其他","","","=B7-C7"],["合計","=SUM(B2:B7)","=SUM(C2:C7)","=B8-C8"]
 ]:kind==="travel"?[
  ["日期","時間","城市／景點","交通方式","預估費用","備註"],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["總計","","","","=SUM(E2:E5)",""]
 ]:[
  ["日期","活動","時間（分鐘）","距離（km）","主觀疲勞（1–10）","備註"],["","","","","",""],["","","","","",""],["","","","","",""],["","","","","",""],["總計","","=SUM(C2:C5)","=SUM(D2:D5)","",""]
 ];
 sheet.name=kind==="budget"?"家庭預算":kind==="travel"?"旅行行程":"運動紀錄";
 book.title=sheet.name;
 rowsToSheet(sheet,rows);
 for(let col=0;col<rows[0].length;col++)setCellStyle(sheet,addressOf(0,col),{bold:true,fill:"#e8edfa"});
 const total=rows.length-1;for(let col=0;col<rows[0].length;col++)setCellStyle(sheet,addressOf(total,col),{bold:true,fill:"#e3f4ec"});
 book.updatedAt=now();return book;
}
function copyText(value:string){return navigator.clipboard.writeText(value);}
export default function SheetsWorkspace(){
 const [book,setBook]=useState<Workbook>(loadWorkbook);
 const [activeId,setActiveId]=useState(()=>book.sheets[0].id);
 const [selected,setSelected]=useState("A1");
 const [visibleRows,setVisibleRows]=useState(40);
 const [visibleCols,setVisibleCols]=useState(12);
 const [aiOpen,setAiOpen]=useState(true);
 const [prompt,setPrompt]=useState("");
 const [route,setRoute]=useState<SheetRoute>("auto");
 const [busy,setBusy]=useState(false);
 const [pending,setPending]=useState<SheetPlan|null>(null);
 const [pendingRevision,setPendingRevision]=useState("");
 const [notification,setNotification]=useState("");
 const [saveError,setSaveError]=useState(false);
 const [historyVersion,setHistoryVersion]=useState(0);
 const fileRef=useRef<HTMLInputElement>(null);
 const history=useRef<Workbook[]>([]);
 const future=useRef<Workbook[]>([]);
 const active=book.sheets.find(s=>s.id===activeId)||book.sheets[0];
 const selectedCell=active.cells[selected];
 const selectedPosition=parseAddress(selected)||{row:0,col:0};
 const selectedDisplay=displayValue(active,selected);
 const cols=useMemo(()=>Array.from({length:visibleCols},(_,col)=>colName(col)),[visibleCols]);
 const rows=useMemo(()=>Array.from({length:visibleRows},(_,row)=>row),[visibleRows]);
 useEffect(()=>{try{saveWorkbook(book);setSaveError(false);}catch{setSaveError(true);}},[book]);
 useEffect(()=>{const rows=takeChatTable();if(!rows)return;if(book.sheets.length>=24){setNotification("工作表已達上限，無法匯入聊天表格");return;}const draft=cloneBook(book);const sheet=makeSheet(uniqueSheetName(draft,"AI 對話表格"));rowsToSheet(sheet,rows);draft.sheets.push(sheet);draft.updatedAt=now();setBook(draft);setActiveId(sheet.id);setSelected("A1");setNotification("已從 AI 對話匯入表格");},[]);
 function change(update:(draft:Workbook)=>void){
  const next=cloneBook(book);
  update(next);next.updatedAt=now();
  history.current.push(book);if(history.current.length>35)history.current.shift();
  future.current=[];setHistoryVersion(v=>v+1);setBook(next);
  if(pending)setPending(null);
 }
 function replace(next:Workbook){
  history.current.push(book);future.current=[];setBook(next);setActiveId(next.sheets[0].id);setSelected("A1");setPending(null);setHistoryVersion(v=>v+1);
 }
 function undo(){const prev=history.current.pop();if(!prev)return;future.current.push(book);setBook(prev);setActiveId(prev.sheets.some(s=>s.id===activeId)?activeId:prev.sheets[0].id);setPending(null);setHistoryVersion(v=>v+1);}
 function redo(){const next=future.current.pop();if(!next)return;history.current.push(book);setBook(next);setActiveId(next.sheets.some(s=>s.id===activeId)?activeId:next.sheets[0].id);setPending(null);setHistoryVersion(v=>v+1);}
 function editCell(address:string,value:string){if(value===active.cells[address]?.value)return;change(draft=>setCell(draft.sheets.find(s=>s.id===active.id)!,address,value));}
 function styleSelected(style:CellStyle){change(draft=>setCellStyle(draft.sheets.find(s=>s.id===active.id)!,selected,style));}
 function addSheet(){if(book.sheets.length>=24){setNotification("最多 24 個工作表");return;}const name=uniqueSheetName(book,"工作表");const sheet=makeSheet(name);change(draft=>draft.sheets.push(sheet));setActiveId(sheet.id);setSelected("A1");}
 function renameSheet(){const name=window.prompt("工作表新名稱",active.name)?.trim();if(!name||name===active.name)return;if(name.length>64||book.sheets.some(s=>s.name===name)){setNotification("名稱重複或太長");return;}change(draft=>{draft.sheets.find(s=>s.id===active.id)!.name=name;});}
 function deleteSheet(){if(book.sheets.length<=1){setNotification("至少需要一張工作表");return;}if(!window.confirm("確定刪除「"+active.name+"」？可用復原恢復。"))return;change(draft=>{draft.sheets=draft.sheets.filter(s=>s.id!==active.id);});setActiveId(book.sheets.find(s=>s.id!==active.id)!.id);}
 function template(kind:"budget"|"travel"|"training"){if(!window.confirm("載入範本會取代目前的工作簿，確定嗎？可以使用復原。"))return;replace(starter(kind));setNotification("已建立可編輯的範本");}
 function jump(row:number,col:number){const r=Math.max(0,Math.min(LIMIT_ROWS-1,row)),c=Math.max(0,Math.min(LIMIT_COLS-1,col));setVisibleRows(v=>Math.max(v,r+1));setVisibleCols(v=>Math.max(v,c+1));setSelected(addressOf(r,c));}
 function paste(event:ClipboardEvent<HTMLDivElement>){
  const text=event.clipboardData.getData("text/plain");
  if(!text.includes("\t")&&!text.includes("\n"))return;
  event.preventDefault();const rows=parseDelimited(text);if(!rows.length)return;
  const base=selectedPosition;let count=0;
  change(draft=>{const sheet=draft.sheets.find(s=>s.id===active.id)!;
   rows.forEach((r,ri)=>r.forEach((value,ci)=>{const row=base.row+ri,col=base.col+ci;if(row<LIMIT_ROWS&&col<LIMIT_COLS){setCell(sheet,addressOf(row,col),value);count++;}}));
  });
  setVisibleRows(v=>Math.min(LIMIT_ROWS,Math.max(v,base.row+rows.length)));
  setVisibleCols(v=>Math.min(LIMIT_COLS,Math.max(v,base.col+Math.max(...rows.map(x=>x.length)))));
  setNotification("已貼上 "+count+" 個儲存格");
 }
 async function importFile(file?:File){
  if(!file)return;
  try{
   if(file.size>2*1024*1024)throw new Error("檔案上限 2 MB");
   const text=await file.text();
   if(file.name.toLowerCase().endsWith(".json")){
    const data=JSON.parse(text) as unknown;if(!isWorkbook(data))throw new Error("不支援的備份檔格式");
    if(window.confirm("這將取代現有工作簿，確定還原備份嗎？")){replace(data);setNotification("已還原 JSON 工作簿");}
    return;
   }
   const rows=parseDelimited(text.replace(/^\uFEFF/,""));if(!rows.length)throw new Error("CSV 沒有資料");
   if(book.sheets.length>=24)throw new Error("工作表數量已達上限");
   const sheet=makeSheet(uniqueSheetName(book,file.name.replace(/\.[^.]+$/,"").slice(0,50)));
   rowsToSheet(sheet,rows);
   change(draft=>draft.sheets.push(sheet));setActiveId(sheet.id);setSelected("A1");setNotification("CSV 已匯入為新工作表");
  }catch(error){setNotification(error instanceof Error?error.message:"匯入失敗");}
 }
 async function runAI(value=prompt){
  if(!value.trim()||busy)return;const actualRoute=resolveRoute(route);
  if(!routeIsReady(actualRoute)){setNotification("模型未就緒：請在 Vanilla 設定中連接或載入模型");return;}
  if(remoteRoute(actualRoute)&&!window.confirm("Vanilla 將把你的指令及目前工作簿的部分儲存格內容傳送至 "+actualRoute+" 處理。你可以取消並選用已載入的本地模型。是否同意？"))return;
  setBusy(true);setPending(null);setNotification("正在產生修改方案…");
  try{const result=await proposeSheetEdit(book,active.name,value,route);setPending(result.plan);setPendingRevision(book.updatedAt);setNotification("方案已產生，確認內容後才會修改表格（"+result.route+"）");}
  catch(error){setNotification(error instanceof Error?error.message:"AI 規劃失敗");}
  finally{setBusy(false);}
 }
 function approve(){
  if(!pending)return;
  if(pendingRevision!==book.updatedAt){setPending(null);setNotification("表格已有新修改，請重新產生方案");return;}
  try{const next=applyPlan(book,pending);const newNames=pending.operations.filter(x=>x.type==="add_sheet").map(x=>x.name);const target=newNames.length?next.sheets.find(s=>s.name===newNames[newNames.length-1]):undefined;history.current.push(book);if(history.current.length>35)history.current.shift();future.current=[];setBook(next);if(target)setActiveId(target.id);setPending(null);setHistoryVersion(v=>v+1);setNotification("已套用 AI 修改，可按復原還原");}catch(error){setNotification(error instanceof Error?error.message:"套用失敗");}
 }
 return <div className="vs-root">
  <div className="vs-head">
   <div className="vs-head-title"><Table2 size={20}/><input aria-label="工作簿名稱" value={book.title} maxLength={160} onChange={e=>change(draft=>{draft.title=e.target.value;})}/><span className="vs-autosave"><Save size={13}/>{saveError?"儲存失敗":"本機自動儲存"}</span></div>
   <div className="vs-head-actions">
    <input ref={fileRef} type="file" accept=".csv,.tsv,.json,text/csv,application/json" hidden onChange={e=>{void importFile(e.target.files?.[0]);e.target.value="";}}/>
    <button onClick={()=>fileRef.current?.click()}><Upload size={15}/> 匯入</button>
    <button onClick={()=>download("\uFEFF"+csvForSheet(active),active.name+".csv","text/csv;charset=utf-8")}><Download size={15}/> CSV</button>
    <button onClick={()=>download(JSON.stringify(book,null,2),book.title+".json","application/json;charset=utf-8")} title="備份所有工作表、公式與格式"><Download size={15}/> 備份</button>
    <button className={"vs-ai-button "+(aiOpen?"selected":"")} onClick={()=>setAiOpen(v=>!v)}><Sparkles size={16}/> Vanilla AI</button>
   </div>
  </div>
  <div className="vs-body">
   <div className="vs-editor">
    <div className="vs-toolbar">
     <button disabled={!history.current.length} title="復原" onClick={undo}><Undo2 size={16}/></button>
     <button disabled={!future.current.length} title="重做" onClick={redo}><Redo2 size={16}/></button>
     <span className="vs-tool-sep"/>
     <button aria-pressed={Boolean(selectedCell?.style?.bold)} onClick={()=>styleSelected({bold:!selectedCell?.style?.bold})} title="粗體"><strong>B</strong></button>
     <label className="vs-color-label" title="背景色"><span>填色</span><select value={selectedCell?.style?.fill||"#ffffff"} onChange={e=>styleSelected({fill:e.target.value})}>{COLORS.map(color=><option key={color} value={color}>{color}</option>)}</select></label>
     <select aria-label="儲存格格式" value={selectedCell?.style?.format||"plain"} onChange={e=>styleSelected({format:e.target.value as CellFormat})}><option value="plain">一般</option><option value="number">數字</option><option value="currency">新臺幣 NT$</option><option value="percent">百分比</option></select>
     <select aria-label="文字對齊" value={selectedCell?.style?.align||"left"} onChange={e=>styleSelected({align:e.target.value as "left"|"center"|"right"})}><option value="left">靠左</option><option value="center">置中</option><option value="right">靠右</option></select>
     <span className="vs-tool-sep"/>
     <button onClick={()=>setVisibleRows(v=>Math.min(LIMIT_ROWS,v+20))} disabled={visibleRows>=LIMIT_ROWS}>＋20 列</button>
     <button onClick={()=>setVisibleCols(v=>Math.min(LIMIT_COLS,v+4))} disabled={visibleCols>=LIMIT_COLS}>＋4 欄</button>
    </div>
    <div className="vs-formula"><span>{selected}</span><strong>ƒx</strong><input aria-label="公式與儲存格內容" value={selectedCell?.value||""} onChange={e=>editCell(selected,e.target.value)} placeholder="輸入數值、文字或 =SUM(A1:A10)"/></div>
    <div className="vs-grid-scroll" onPaste={paste}>
     <table className="vs-grid"><thead><tr><th className="vs-corner"/>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map(row=><tr key={row}><th className="vs-row-header">{row+1}</th>{cols.map((_,col)=>{
       const address=addressOf(row,col),cell=active.cells[address],chosen=selected===address;
       return <td key={address} className={chosen?"vs-selected":""} style={{background:cell?.style?.fill||undefined,color:cell?.style?.color||undefined,textAlign:cell?.style?.align||"left",fontWeight:cell?.style?.bold?700:400}}>
        {chosen?<input key={active.id+address} autoFocus aria-label={"儲存格 "+address} value={cell?.value||""} onChange={e=>editCell(address,e.target.value)} onKeyDown={event=>{
         if(event.key==="Enter"){event.preventDefault();jump(row+(event.shiftKey?-1:1),col);}
         else if(event.key==="Tab"){event.preventDefault();jump(row,col+(event.shiftKey?-1:1));}
         else if(event.key==="ArrowDown"&&event.altKey){event.preventDefault();jump(row+1,col);}
         else if(event.key==="ArrowUp"&&event.altKey){event.preventDefault();jump(row-1,col);}
        }}/>:
        <button title={cell?.value||address} onClick={()=>setSelected(address)} onKeyDown={e=>{if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();editCell(address,"");}}}>{displayValue(active,address)}</button>}
       </td>;
      })}</tr>)}</tbody>
     </table>
    </div>
    <div className="vs-tabs"><div className="vs-tab-list">{book.sheets.map(s=><button key={s.id} className={s.id===active.id?"on":""} onClick={()=>{setActiveId(s.id);setSelected("A1");}}>{s.name}</button>)}</div><button title="新增工作表" onClick={addSheet}><Plus size={16}/></button><button title="重新命名此工作表" onClick={renameSheet}><FilePlus2 size={16}/></button><button title="刪除目前工作表" onClick={deleteSheet}><Trash2 size={15}/></button></div>
    <div className="vs-status"><span>{active.name} · {visibleRows} 列 × {visibleCols} 欄</span><span>{selected} {selectedDisplay?"= "+selectedDisplay:""}</span></div>
   </div>
   {aiOpen&&<aside className="vs-assistant">
    <div className="vs-assistant-head"><div><span className="vs-pulse"><Sparkles size={17}/></span><strong>Vanilla Sheets AI</strong></div><button title="關閉 AI 面板" onClick={()=>setAiOpen(false)}><X size={17}/></button></div>
    <p className="vs-subtitle">描述你想建立的表格，或讓 Vanilla 幫你整理資料、填入公式、設計格式。</p>
    <div className="vs-routes"><label htmlFor="vs-model">執行模型</label><select id="vs-model" value={route} onChange={e=>setRoute(e.target.value as SheetRoute)}><option value="auto">智慧選擇</option><option value="local">本地 AI {isLocalModelReady()?"✓":"（未載入）"}</option><option value="ollama">Ollama {isOllamaConfigured()?"✓":"（未連接）"}</option><option value="gemini">Gemini {availableProviders().includes("gemini")?"✓":"（未連接）"}</option><option value="deepseek">DeepSeek {availableProviders().includes("deepseek")?"✓":"（未連接）"}</option></select></div>
    <label className="vs-request-label" htmlFor="vs-request">自然語言指令</label><textarea id="vs-request" value={prompt} onChange={e=>setPrompt(e.target.value)} rows={5} maxLength={1600} placeholder="例如：新增一張 12 個月的收支表，第一列為月份、收入、支出、結餘，加入 SUM 公式…"/>
    <button className="vs-generate" disabled={busy||!prompt.trim()} onClick={()=>{void runAI();}}><Sparkles size={15}/>{busy?"正在規劃…":"產生修改提案"}</button>
    <div className="vs-templates"><strong>快速建立空白範本</strong><div>{(["budget","travel","training"] as const).map((kind,i)=><button key={kind} onClick={()=>template(kind)}>{["家庭預算","旅行行程","運動紀錄"][i]}</button>)}</div></div>
    {pending&&<div className="vs-plan"><div className="vs-plan-label">修改前預覽</div><p>{pending.summary}</p><ul>{describePlan(pending).map((line,i)=><li key={i}>{line}</li>)}</ul><details className="vs-plan-detail"><summary>查看逐格修改內容（最多顯示前 30 格）</summary><div>{pending.operations.flatMap(op=>op.type==="set_cells"?op.cells.map(c=>({sheet:op.sheet,...c})):[]).slice(0,30).map((cell,i)=><div className="vs-plan-cell" key={i}><strong>{cell.sheet}!{cell.address}</strong><span>{cell.value||"（清空）"}</span></div>)}</div></details><div className="vs-plan-actions"><button onClick={()=>setPending(null)}><X size={14}/> 取消</button><button onClick={approve}><Check size={14}/> 確認套用</button></div></div>}
    {notification&&<div className="vs-notification" role="status">{notification}</div>}
    <div className="vs-privacy"><span>資料控制</span><p>AI 不會直接修改表格。雲端模型送出前會先徵求同意；此版本的表格儲存在目前瀏覽器，尚未連接家庭權限與雲端同步。</p></div>
    <button className="vs-copy" onClick={()=>{void copyText(selectedCell?.value||"").then(()=>setNotification("已複製 "+selected)).catch(()=>setNotification("無法複製"));}}><Copy size={14}/> 複製目前儲存格內容</button>
   </aside>}
  </div>
 </div>;
}
