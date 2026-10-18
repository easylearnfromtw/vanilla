import LocalChat from "./local-ai/LocalChat";
import DriveConnection from "./vault/DriveConnection";
import { useState } from "react";
import { BrainCircuit, MessageCircle, Users, ListTodo, Database, Plane, HeartPulse, Settings2, Upload, ShieldCheck, WifiOff } from "lucide-react";
type Section = "chat"|"agents"|"tasks"|"memory"|"travel"|"health"|"line"|"settings";
const items: {id:Section; label:string; icon:typeof BrainCircuit; description:string}[] = [
{id:"chat",label:"AI 對話",icon:MessageCircle,description:"Vanilla 的主要互動入口"},
{id:"agents",label:"AI 團隊",icon:Users,description:"總指揮、秘書、醫學、藥學、工程與研究"},
{id:"tasks",label:"任務中心",icon:ListTodo,description:"跨 Agent 任務、核准與執行紀錄"},
{id:"memory",label:"永久記憶",icon:Database,description:"文件、RAG、家庭獨立記憶"},
{id:"travel",label:"旅行與導遊",icon:Plane,description:"家庭行程、預算、景點與導覽"},
{id:"health",label:"健康中心",icon:HeartPulse,description:"個人健康資訊與研究助手"},
{id:"line",label:"LINE 匯入",icon:Upload,description:"輔助功能：手動匯入聊天紀錄"},
{id:"settings",label:"系統設定",icon:Settings2,description:"模型、伺服器、隱私與權限"}
];
export default function App(){
const [section,setSection]=useState<Section>("chat");
const [filename,setFilename]=useState("");
const selected=items.find(x=>x.id===section)!;
return <div className="shell">
<aside className="sidebar"><div className="brand"><BrainCircuit size={29}/><div><strong>VANILLA</strong><small>PERSONAL AI ORGANIZATION</small></div></div><nav>{items.map(x=><button key={x.id} className={section===x.id?"nav active":"nav"} onClick={()=>setSection(x.id)}><x.icon size={19}/>{x.label}{x.id==="line"&&<span className="aux">輔助</span>}</button>)}</nav><div className="sidebar-footer"><ShieldCheck size={16}/> Local-first · Privacy-first</div></aside>
<main className="main"><header><div><div className="eyebrow">VANILLA / WORKSPACE</div><h1>{selected.label}</h1><p>{selected.description}</p></div><span className="status"><WifiOff size={15}/> 本地 AI · WebGPU 測試版</span></header>
{section==="chat"?<LocalChat/>:
section==="settings"?<section className="panel"><div className="section-icon"><Settings2/></div><h2>系統設定</h2><p>Google Drive 加密雲端授權與連線檢查</p><DriveConnection/></section>:
section==="line"?<section className="panel"><div className="section-icon"><Upload/></div><h2>LINE Intelligence</h2><p>LINE 是 Vanilla 的輔助資料入口，不是主要介面。你可以先選擇 LINE 匯出的 .txt 檔案；正式解析與儲存將在後端上線後開放。</p><label className="upload">選擇 LINE 聊天紀錄<input type="file" accept=".txt,text/plain" onChange={e=>setFilename(e.target.files?.[0]?.name||"")}/></label>{filename&&<p className="file-note">已選取：{filename}（尚未上傳）</p>}</section>:
<section className="panel"><div className="section-icon"><selected.icon/></div><h2>{selected.label}</h2><p>{selected.description}</p><div className="placeholder">模組入口已建立 · 功能將分階段接入家庭伺服器</div></section>}
</main></div>}
