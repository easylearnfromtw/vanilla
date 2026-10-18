import LocalChat from "./local-ai/LocalChat";
import DriveConnection from "./vault/DriveConnection";
import {useState,useEffect} from "react";
import {loadProviderConfigs} from "./vault/provider-sync";
import {BrainCircuit,MessageCircle,Users,ListTodo,Database,Plane,HeartPulse,Settings2,Upload,ShieldCheck,Menu,PanelLeftClose,Plus,LockKeyhole} from "lucide-react";
type Section="chat"|"agents"|"tasks"|"memory"|"travel"|"health"|"line"|"settings";
const items:{id:Section;label:string;icon:typeof BrainCircuit;description:string}[]=[
{id:"chat",label:"AI 對話",icon:MessageCircle,description:"你的私人裝置端 AI 助手"},
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
useEffect(()=>{try{const raw=sessionStorage.getItem("vanilla.drive.session.v1");if(!raw)return;const session=JSON.parse(raw) as {token?:string;expiresAt?:number};if(session.token&&session.expiresAt&&session.expiresAt>Date.now()+60000){void loadProviderConfigs(session.token).catch(()=>{});}}catch{}},[]);
const [menuOpen,setMenuOpen]=useState(false);
const [filename,setFilename]=useState("");
const [chatKey,setChatKey]=useState(0);
const selected=items.find(x=>x.id===section)!;
function navigate(next:Section){setSection(next);setMenuOpen(false);}
return <div className="shell">
{menuOpen&&<button className="nav-backdrop" aria-label="關閉選單" onClick={()=>setMenuOpen(false)}/>}
<aside className={"sidebar "+(menuOpen?"sidebar-open":"")}>
<div className="brand"><span className="brand-mark"><BrainCircuit size={22}/></span><div><strong>vanilla</strong><small>PERSONAL INTELLIGENCE</small></div><button className="sidebar-collapse" aria-label="收合選單" onClick={()=>setMenuOpen(false)}><PanelLeftClose size={19}/></button></div>
<button className="new-chat" onClick={()=>{try{localStorage.removeItem("vanilla.chat.history.v1");}catch{}setChatKey(k=>k+1);navigate("chat");}}><Plus size={18}/> 新對話</button>
<div className="nav-caption">工作空間</div>
<nav aria-label="主要導覽">{items.map(x=><button key={x.id} className={section===x.id?"nav active":"nav"} onClick={()=>navigate(x.id)}><x.icon size={18}/><span>{x.label}</span></button>)}</nav>
<div className="sidebar-footer"><ShieldCheck size={16}/> 本地優先 · 隱私優先</div>
</aside>
<main className={"main "+(section==="chat"?"main-chat":"")}>
<header className="topbar">
<div className="topbar-leading"><button className="menu-toggle" aria-label="開啟選單" onClick={()=>setMenuOpen(true)}><Menu size={22}/></button><div className="topbar-title">{section==="chat"?"Vanilla AI":selected.label}<span className="topbar-chevron"> ▾</span></div></div>
<div className="privacy-chip"><LockKeyhole size={14}/> 裝置端優先</div>
</header>
{section==="chat"?<LocalChat key={chatKey}/>:
<div className="content-page"><div className="eyebrow">VANILLA / WORKSPACE</div><h1>{selected.label}</h1><p className="content-description">{selected.description}</p>
{section==="settings"?<section className="panel"><h2>系統設定</h2><p>全家共用同一個 Google Drive 加密保險庫；私密模式只儲存在本機。</p><DriveConnection/></section>:
section==="line"?<section className="panel"><h2>LINE Intelligence</h2><p>LINE 為選用的輔助匯入工具，不是 Vanilla 的主要對話介面。</p><label className="upload">選擇 LINE .txt 紀錄<input type="file" accept=".txt,text/plain" onChange={e=>setFilename(e.target.files?.[0]?.name||"")}/></label>{filename&&<p className="file-note">已選取：{filename}（尚未上傳）</p>}</section>:
<section className="panel placeholder-panel"><div className="section-icon"><selected.icon size={26}/></div><h2>{selected.label}</h2><p>{selected.description}</p><div className="placeholder">此功能正在開發中，尚未連接真實資料。</div></section>}
</div>}
</main></div>;
}
