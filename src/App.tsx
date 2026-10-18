import LocalChat from "./local-ai/LocalChat";
import BuildStudio from "./builder/BuildStudio";
import FeatureRuntime from "./builder/FeatureRuntime";
import {loadFeatures,type FeatureSpec} from "./builder/feature-schema";
import ToneSettings from "./ai/ToneSettings";
import Sheets from "./workspace/Sheets";
import CloudFiles from "./workspace/CloudFiles";
import DriveConnection from "./vault/DriveConnection";
import ModelConnections from "./ai/ModelConnections";
import {useState,useEffect} from "react";
import {loadProviderConfigs} from "./vault/provider-sync";
import {BrainCircuit,MessageCircle,Users,ListTodo,Database,Plane,HeartPulse,Settings2,Upload,ShieldCheck,Menu,PanelLeftClose,Plus,LockKeyhole,Table2,FolderOpen,WandSparkles,Puzzle} from "lucide-react";
type Section="chat"|"sheets"|"files"|"builder"|"feature"|"agents"|"tasks"|"memory"|"travel"|"health"|"line"|"settings";
const items:{id:Section;label:string;icon:typeof BrainCircuit;description:string}[]=[
{id:"chat",label:"AI 對話",icon:MessageCircle,description:"你的私人裝置端 AI 助手"},
{id:"sheets",label:"Vanilla 表格",icon:Table2,description:"多工作表、公式、AI 編輯預覽與雲端保存"},
{id:"files",label:"雲端檔案",icon:FolderOpen,description:"Google Drive 建立、讀取、編輯、上傳與垃圾桶"},
{id:"builder",label:"Self-Build Studio",icon:WandSparkles,description:"用自然語言新增與改進 Vanilla 自建工具"},
{id:"agents",label:"AI 團隊",icon:Users,description:"多領域 AI Agent 工作台"},
{id:"tasks",label:"任務中心",icon:ListTodo,description:"任務、核准與執行紀錄"},
{id:"memory",label:"永久記憶",icon:Database,description:"加密知識庫與個人記憶"},
{id:"travel",label:"旅行與導遊",icon:Plane,description:"家庭旅行規劃與即時導覽"},
{id:"health",label:"健康中心",icon:HeartPulse,description:"個人健康與研究助手"},
{id:"line",label:"LINE 匯入",icon:Upload,description:"手動匯入聊天紀錄"},
{id:"settings",label:"系統設定",icon:Settings2,description:"模型、隱私與雲端授權"}
];
export default function App(){
const [section,setSection]=useState<Section>("chat");
const [fontMode,setFontMode]=useState(()=>localStorage.getItem("vanilla.font.mode")||"auto");
useEffect(()=>{document.documentElement.dataset.fontMode=fontMode;localStorage.setItem("vanilla.font.mode",fontMode);},[fontMode]);
useEffect(()=>{try{const raw=sessionStorage.getItem("vanilla.drive.session.v1");if(!raw)return;const session=JSON.parse(raw) as {token?:string;expiresAt?:number};if(session.token&&session.expiresAt&&session.expiresAt>Date.now()+60000){void loadProviderConfigs(session.token).catch(()=>{});}}catch{}},[]);
const [menuOpen,setMenuOpen]=useState(false);
const [filename,setFilename]=useState("");
const [chatKey,setChatKey]=useState(0);
const [features,setFeatures]=useState<FeatureSpec[]>(loadFeatures);
const [activeFeatureId,setActiveFeatureId]=useState("");
const [editFeatureId,setEditFeatureId]=useState<string|null>(null);
useEffect(()=>{const refresh=()=>setFeatures(loadFeatures());window.addEventListener("vanilla-features-changed",refresh);return()=>window.removeEventListener("vanilla-features-changed",refresh);},[]);
function openFeature(id:string){setActiveFeatureId(id);setSection("feature");setMenuOpen(false);}
function editFeature(id:string|null){setEditFeatureId(id);setSection("builder");setMenuOpen(false);}
useEffect(()=>{
 const openSheet=(event:Event)=>{
  const detail=(event as CustomEvent<{workbook?:unknown;rows?:string[][]}>).detail;
  if(!detail||(!detail.workbook&&!detail.rows))return;
  try{localStorage.setItem("vanilla.sheets.pending-import.v1",JSON.stringify(detail));setSection("sheets");setMenuOpen(false);}catch{window.alert("無法暫存表格，請檢查裝置儲存空間");}
 };
 const openFiles=()=>{setSection("files");setMenuOpen(false);};
 const openSheets=()=>{setSection("sheets");setMenuOpen(false);};
 const openBuilder=(event:Event)=>{
  const detail=(event as CustomEvent<{idea?:string}>).detail;
  if(detail?.idea){try{sessionStorage.setItem("vanilla.builder.pending-idea.v1",detail.idea.slice(0,1800));}catch{}}
  setEditFeatureId(null);setSection("builder");setMenuOpen(false);
 };
 window.addEventListener("vanilla-open-sheet",openSheet);
 window.addEventListener("vanilla-open-files",openFiles);
 window.addEventListener("vanilla-open-sheets",openSheets);
 window.addEventListener("vanilla-open-builder",openBuilder);
 return()=>{window.removeEventListener("vanilla-open-sheet",openSheet);window.removeEventListener("vanilla-open-files",openFiles);window.removeEventListener("vanilla-open-sheets",openSheets);window.removeEventListener("vanilla-open-builder",openBuilder);};
},[]);
const activeFeature=features.find(x=>x.id===activeFeatureId);
const selected=items.find(x=>x.id===section)||{id:"feature" as const,label:activeFeature?.name||"自建工具",icon:Puzzle,description:activeFeature?.description||"Vanilla 自建模組"};
function navigate(next:Section){setSection(next);setMenuOpen(false);}
return <div className="shell">
{menuOpen&&<button className="nav-backdrop" aria-label="關閉選單" onClick={()=>setMenuOpen(false)}/>}
<aside className={"sidebar "+(menuOpen?"sidebar-open":"")}>
<div className="brand"><span className="brand-mark"><BrainCircuit size={22}/></span><div><strong>vanilla</strong><small>PERSONAL INTELLIGENCE</small></div><button className="sidebar-collapse" aria-label="收合選單" onClick={()=>setMenuOpen(false)}><PanelLeftClose size={19}/></button></div>
<button className="new-chat" onClick={()=>{try{localStorage.removeItem("vanilla.chat.history.v1");}catch{}setChatKey(k=>k+1);navigate("chat");}}><Plus size={18}/> 新對話</button>
<div className="nav-caption">工作空間</div>
<nav aria-label="主要導覽">{items.map(x=><button key={x.id} className={section===x.id?"nav active":"nav"} onClick={()=>navigate(x.id)}><x.icon size={18}/><span>{x.label}</span></button>)}</nav>
{features.length>0&&<><div className="nav-caption nav-caption-features">我的自建工具</div><nav aria-label="已安裝的自建工具">{features.map(f=><button key={f.id} className={section==="feature"&&activeFeatureId===f.id?"nav active":"nav"} onClick={()=>openFeature(f.id)}><Puzzle size={17}/><span>{f.name}</span></button>)}</nav></>}
<div className="sidebar-footer"><ShieldCheck size={16}/> 本地優先 · 隱私優先</div>
</aside>
<main className={"main "+(section==="chat"?"main-chat":"")}>
<header className="topbar">
<div className="topbar-leading"><button className="menu-toggle" aria-label="開啟選單" onClick={()=>setMenuOpen(true)}><Menu size={22}/></button><div className="topbar-title">{section==="chat"?"Vanilla AI":selected.label}<span className="topbar-chevron"> ▾</span></div></div>
<div className="privacy-chip">{section==="files"?<><FolderOpen size={14}/> Google Drive 檔案</>:section==="sheets"||section==="builder"||section==="feature"?<><ShieldCheck size={14}/> 本機草稿 · 手動確認</>:<><LockKeyhole size={14}/> 裝置端優先</>}</div>
</header>
{section==="chat"?<LocalChat key={chatKey}/>:
section==="sheets"?<div className="workspace-page"><Sheets/></div>:
section==="files"?<div className="workspace-page"><CloudFiles/></div>:
section==="builder"?<div className="workspace-page"><BuildStudio onOpen={openFeature} editingId={editFeatureId} onEditingChange={editFeature}/></div>:
section==="feature"?<div className="workspace-page">{activeFeature?<FeatureRuntime key={activeFeature.id} spec={activeFeature} onEdit={editFeature}/>:<div className="builder-feature-not-found"><h2>找不到這項功能</h2><p>可能已在此裝置移除。</p><button type="button" onClick={()=>navigate("builder")}>返回 Self-Build Studio</button></div>}</div>:
<div className="content-page"><div className="eyebrow">VANILLA / WORKSPACE</div><h1>{selected.label}</h1><p className="content-description">{selected.description}</p>
{section==="settings"?<section className="panel"><h2>系統設定</h2><p>全家共用同一個 Google Drive 加密保險庫；私密模式只儲存在本機。</p><div className="font-settings"><h3>字型自動切換</h3><p>自動模式依文字語系使用系統字型備援；也可以手動指定字型，設定會保留在此裝置。</p><label htmlFor="font-mode">顯示字型 </label><select id="font-mode" value={fontMode} onChange={e=>setFontMode(e.target.value)}><option value="auto">自動（推薦）</option><option value="system">系統預設</option><option value="sans">無襯線字型</option><option value="serif">襯線字型</option><option value="mono">等寬字型</option></select><p className="font-preview">Vanilla AI · 中文 English 日本語 12345</p></div><ToneSettings/><ModelConnections/><DriveConnection/></section>:
section==="line"?<section className="panel"><h2>LINE Intelligence</h2><p>LINE 為選用的輔助匯入工具，不是 Vanilla 的主要對話介面。</p><label className="upload">選擇 LINE .txt 紀錄<input type="file" accept=".txt,text/plain" onChange={e=>setFilename(e.target.files?.[0]?.name||"")}/></label>{filename&&<p className="file-note">已選取：{filename}（尚未上傳）</p>}</section>:
<section className="panel placeholder-panel"><div className="section-icon"><selected.icon size={26}/></div><h2>{selected.label}</h2><p>{selected.description}</p><div className="placeholder">此功能正在開發中，尚未連接真實資料。</div></section>}
</div>}
</main></div>;
}
