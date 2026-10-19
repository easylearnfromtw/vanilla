import {useState,useEffect,useRef,lazy,Suspense} from "react";
import type {OrchestraChart} from "./orchestra/cream-chart";
import LocalChat from "./local-ai/LocalChat";
import TabBar from "./ui/TabBar";
import {loadFeatures,type FeatureSpec} from "./builder/feature-schema";
import {connectWorkspaceDrive,driveSession} from "./workspace/cloud-drive";
import {chatSyncEnabled,initializeChatSync,stopChatSync} from "./vault/chat-sync";
import {loadProviderConfigs} from "./vault/provider-sync";
import {startNewConversation,recentConversations,reopenConversation,currentChatMode,CHAT_ARCHIVE_EVENT} from "./local-ai/chat-session";
import type {ArchiveSummary} from "./library/conversation-archive";
import {Code2,BarChart3,MessageCircle,Settings2,Menu,X,Plus,Table2,FolderOpen,Images,WandSparkles,Globe2,Puzzle,ShieldCheck,Clock3,SquarePen,Mail} from "lucide-react";

// Heavy sections load on demand so the chat opens fast on iPhone.
const CreamLongitudinal=lazy(()=>import("./cream/CreamLongitudinal"));
const ProjectHub=lazy(()=>import("./projects/ProjectHub"));
const ConversationLibrary=lazy(()=>import("./library/ConversationLibrary"));
const Sheets=lazy(()=>import("./workspace/Sheets"));
const CloudFiles=lazy(()=>import("./workspace/CloudFiles"));
const BuildStudio=lazy(()=>import("./builder/BuildStudio"));
const FeatureRuntime=lazy(()=>import("./builder/FeatureRuntime"));
const SettingsPage=lazy(()=>import("./settings/SettingsPage"));
const DetroitStudio=lazy(()=>import("./detroit/DetroitStudio"));
const OrchestraStudio=lazy(()=>import("./orchestra/OrchestraStudio"));
const LunaStudio=lazy(()=>import("./luna/LunaStudio"));
const WeiGuoConsole=lazy(()=>import("./weiguo/WeiGuoConsole"));
const EmailStudio=lazy(()=>import("./email/EmailStudio"));

const BASE=import.meta.env.BASE_URL;
type Section="luna"|"email"|"orchestra"|"weiguo"|"detroit"|"chat"|"cream"|"projects"|"library"|"sheets"|"files"|"builder"|"feature"|"settings";
type NavItem={id:Section;label:string;icon:typeof MessageCircle;description:string;tone:"blue"|"red"|"yellow"|"ink"};
const items:NavItem[]=[
 {id:"chat",label:"AI 對話",icon:MessageCircle,description:"家庭專屬的 AI 助理",tone:"blue"},
 {id:"cream",label:"CREAM 長期分析",icon:BarChart3,description:"長期數據追蹤、目標與研究分析",tone:"red"},
 {id:"projects",label:"PROJECT HUB",icon:Code2,description:"專案原始碼、API 與功能整合",tone:"yellow"},
 {id:"library",label:"對話圖片與資料",icon:Images,description:"聊天附件、圖片預覽、更新與刪除",tone:"yellow"},
 {id:"settings",label:"系統設定",icon:Settings2,description:"模型、隱私、雲端與外觀",tone:"ink"}
];
const tools:NavItem[]=[
 {id:"weiguo",label:"衞國系統",icon:Globe2,description:"瀏覽器自動化與自訂外部工具整合",tone:"blue"},
 {id:"detroit",label:"Detroit Studio",icon:WandSparkles,description:"Retina 文件、Bard 生圖、安全及背景任務",tone:"red"},
 {id:"orchestra",label:"Orchestra Studio",icon:Puzzle,description:"Craft 七引擎調度、CREAM 跨格式輸出與作品製作",tone:"yellow"},
 {id:"luna",label:"LUNA 視覺設計",icon:Images,description:"Detroit 原生海報畫布、圖層、模板與本機匯出",tone:"yellow"},
 {id:"sheets",label:"Vanilla 表格",icon:Table2,description:"多工作表、公式、AI 編輯預覽與雲端保存",tone:"red"},
 {id:"email",label:"Email Studio",icon:Mail,description:"郵件模板設計、HTML 與 Unlayer 編輯器",tone:"yellow"},
 {id:"files",label:"雲端檔案",icon:FolderOpen,description:"Google Drive 建立、讀取、編輯與垃圾桶",tone:"blue"},
 {id:"builder",label:"Self-Build Studio",icon:WandSparkles,description:"用自然語言新增與改進 Vanilla 工具",tone:"ink"}
];
const tabs=[
 {id:"chat",label:"對話",icon:MessageCircle},{id:"cream",label:"CREAM",icon:BarChart3},
 {id:"projects",label:"專案",icon:Code2},{id:"library",label:"資料",icon:Images},{id:"settings",label:"設定",icon:Settings2}
];
function Loading(){return <div className="vh-loading" role="status"><span className="vh-loading-bar"/>載入中…</div>;}

export default function App(){
const [section,setSection]=useState<Section>("chat");
const [menuOpen,setMenuOpen]=useState(false);
const [chatKey,setChatKey]=useState(0);
const [retinaSeed,setRetinaSeed]=useState<string|null>(null);
const [orchestraSeed,setOrchestraSeed]=useState<string|null>(null);
const [orchestraSource,setOrchestraSource]=useState<"manual"|"cream">("manual");
const [orchestraChart,setOrchestraChart]=useState<OrchestraChart|null>(null);
const [compactTabs,setCompactTabs]=useState(false);
const [recent,setRecent]=useState<ArchiveSummary[]>([]);
const mainRef=useRef<HTMLElement|null>(null);
useEffect(()=>{const onRemote=()=>setChatKey(x=>x+1);window.addEventListener("vanilla-chat-remote-loaded",onRemote);return()=>window.removeEventListener("vanilla-chat-remote-loaded",onRemote);},[]);
useEffect(()=>{try{const raw=sessionStorage.getItem("vanilla.drive.session.v1");if(!raw)return;const session=JSON.parse(raw) as {token?:string;expiresAt?:number};if(session.token&&session.expiresAt&&session.expiresAt>Date.now()+60000){void loadProviderConfigs(session.token).catch(()=>{});}}catch{}},[]);
const [signedIn,setSignedIn]=useState(()=>driveSession());
const [loginBusy,setLoginBusy]=useState(false);
const [loginNotice,setLoginNotice]=useState("");
useEffect(()=>{const refresh=()=>{setSignedIn(driveSession());setChatKey(x=>x+1);if(driveSession()&&chatSyncEnabled())void initializeChatSync();else stopChatSync();};window.addEventListener("vanilla-drive-connected",refresh);window.addEventListener("vanilla-drive-disconnected",refresh);return()=>{window.removeEventListener("vanilla-drive-connected",refresh);window.removeEventListener("vanilla-drive-disconnected",refresh);};},[]);
async function connectAccount(){setLoginBusy(true);try{const session=await connectWorkspaceDrive();setSignedIn(session);await loadProviderConfigs(session.token);setLoginNotice("已登入："+session.email);}catch(e){setLoginNotice(e instanceof Error?e.message:String(e));}finally{setLoginBusy(false);}}
const [features,setFeatures]=useState<FeatureSpec[]>(loadFeatures);
const [activeFeatureId,setActiveFeatureId]=useState("");
const [editFeatureId,setEditFeatureId]=useState<string|null>(null);
useEffect(()=>{const refresh=()=>setFeatures(loadFeatures());window.addEventListener("vanilla-features-changed",refresh);return()=>window.removeEventListener("vanilla-features-changed",refresh);},[]);
function openFeature(id:string){setActiveFeatureId(id);setSection("feature");setMenuOpen(false);}
function editFeature(id:string|null){setEditFeatureId(id);setSection("builder");setMenuOpen(false);}
const refreshRecent=()=>{void recentConversations(currentChatMode()).then(setRecent);};
useEffect(()=>{refreshRecent();window.addEventListener(CHAT_ARCHIVE_EVENT,refreshRecent);return()=>window.removeEventListener(CHAT_ARCHIVE_EVENT,refreshRecent);},[]);
useEffect(()=>{if(menuOpen)refreshRecent();},[menuOpen]);
useEffect(()=>{
 const go=(next:Section)=>()=>{setSection(next);setMenuOpen(false);};
 const openSheet=(event:Event)=>{
  const detail=(event as CustomEvent<{workbook?:unknown;rows?:string[][]}>).detail;
  if(!detail||(!detail.workbook&&!detail.rows))return;
  try{localStorage.setItem("vanilla.sheets.pending-import.v1",JSON.stringify(detail));setSection("sheets");setMenuOpen(false);}catch{window.alert("無法暫存表格，請檢查裝置儲存空間");}
 };
 const openBuilder=(event:Event)=>{
  const detail=(event as CustomEvent<{idea?:string;mode?:"code"|"visual"}>).detail;
  if(detail?.idea){try{sessionStorage.setItem("vanilla.builder.pending-idea.v1",detail.idea.slice(0,1800));}catch{}}
  if(detail?.mode==="code"){try{sessionStorage.setItem("vanilla.builder.pending-mode.v1","code");}catch{}}
  setEditFeatureId(null);setSection("builder");setMenuOpen(false);
 };
 const handlers:Array<[string,(e:Event)=>void]>=[
  ["vanilla-open-sheet",openSheet],["vanilla-open-builder",openBuilder],
  ["vanilla-open-weiguo",go("weiguo")],
  ["vanilla-open-luna",go("luna")],
  ["vanilla-open-orchestra",(event:Event)=>{const detail=(event as CustomEvent<{body?:string;source?:string;chart?:OrchestraChart}>).detail;
   setOrchestraSeed(typeof detail?.body==="string"?detail.body.slice(0,50000):null);
   setOrchestraSource(detail?.source==="cream"?"cream":"manual");setOrchestraChart(detail?.chart||null);setSection("orchestra");setMenuOpen(false);}],
  ["vanilla-open-detroit",(event:Event)=>{const body=(event as CustomEvent<{body?:string}>).detail?.body;setRetinaSeed(typeof body==="string"?body.slice(0,160000):null);setSection("detroit");setMenuOpen(false);}],
  ["vanilla-open-cream",go("cream")],["vanilla-open-email",go("email")],["vanilla-open-projects",go("projects")],["vanilla-open-files",go("files")],
  ["vanilla-open-settings",go("settings")],["vanilla-open-sheets",go("sheets")],["vanilla-open-library",go("library")]
 ];
 for(const [name,fn] of handlers)window.addEventListener(name,fn);
 return()=>{for(const [name,fn] of handlers)window.removeEventListener(name,fn);};
},[]);
// Tab bar shrinks while reading downward and returns when scrolling up (iOS behaviour).
useEffect(()=>{
 const main=mainRef.current;if(!main)return;
 const last=new WeakMap<EventTarget,number>();
 const onScroll=(event:Event)=>{
  const el=event.target as HTMLElement;if(!el||typeof el.scrollTop!=="number")return;
  const prev=last.get(el)??el.scrollTop;const delta=el.scrollTop-prev;last.set(el,el.scrollTop);
  if(Math.abs(delta)<6)return;
  setCompactTabs(delta>0&&el.scrollTop>40);
 };
 main.addEventListener("scroll",onScroll,true);
 return()=>main.removeEventListener("scroll",onScroll,true);
},[]);
const all=[...items,...tools];
const activeFeature=features.find(x=>x.id===activeFeatureId);
const selected=all.find(x=>x.id===section)||{id:"feature" as const,label:activeFeature?.name||"自建工具",icon:Puzzle,description:activeFeature?.description||"Vanilla 自建模組",tone:"ink" as const};
function navigate(next:Section){setSection(next);setMenuOpen(false);}
async function newChat(){
 const result=await startNewConversation();
 if(result.error){window.alert("目前對話無法封存，為避免遺失已停止："+result.error);return;}
 setChatKey(k=>k+1);navigate("chat");
}
async function openRecent(id:string){
 try{await reopenConversation(id);setChatKey(k=>k+1);navigate("chat");}
 catch(e){window.alert(String(e instanceof Error?e.message:e));}
}
const initial=(signedIn?.email||"V").trim().charAt(0).toUpperCase();
const navButton=(x:NavItem)=><button key={x.id} className={section===x.id?"nav active":"nav"} onClick={()=>navigate(x.id)} aria-current={section===x.id?"page":undefined}><span className={"nav-icon tone-"+x.tone}><x.icon size={17}/></span><span>{x.label}</span></button>;
return <div className="shell">
{menuOpen&&<button className="nav-backdrop" aria-label="關閉選單" onClick={()=>setMenuOpen(false)}/>}
<aside className={"sidebar "+(menuOpen?"sidebar-open":"")} aria-label="Vanilla 選單">
<div className="brand">
 <img className="brand-icon" src={BASE+"brand/icon-64.png"} alt="" width={38} height={38}/>
 <div><strong>VANILLA AI</strong><small>A MORE HUMAN AI</small></div>
 <button className="sidebar-collapse" aria-label="收合選單" onClick={()=>setMenuOpen(false)}><X size={19}/></button>
</div>
<button className="new-chat" onClick={()=>void newChat()}><Plus size={18}/> 新對話</button>
<div className="nav-caption">WORKSPACE · 工作空間</div>
<nav aria-label="主要導覽">{items.map(navButton)}</nav>
<div className="nav-caption">TOOLS · 工具</div>
<nav aria-label="工具">{tools.map(navButton)}{features.slice(0,6).map(f=><button key={f.id} className={section==="feature"&&activeFeatureId===f.id?"nav active":"nav"} onClick={()=>openFeature(f.id)}><span className="nav-icon tone-ink"><Puzzle size={16}/></span><span>{f.name}</span></button>)}</nav>
{recent.length>0&&<><div className="nav-caption">RECENT · 最近對話</div>
<div className="recent-list">{recent.slice(0,8).map(r=><button key={r.id} type="button" className="recent-item" onClick={()=>void openRecent(r.id)} title={r.title}><Clock3 size={14}/><span>{r.title}</span></button>)}</div></>}
<div className="sidebar-footer"><ShieldCheck size={14}/><span>家庭專用 · 本地優先</span></div>
</aside>
<main ref={el=>{mainRef.current=el;}} className={"main "+(section==="chat"?"main-chat":"has-tabbar")}>
<header className="topbar">
<div className="topbar-leading"><button className="menu-toggle" aria-label="開啟選單" onClick={()=>setMenuOpen(true)}><Menu size={22}/></button><div className="topbar-title">{section==="chat"?<span className="topbar-wordmark">VANILLA AI</span>:selected.label}</div></div>
<div className="topbar-trailing">
 {section==="chat"&&<button type="button" className="topbar-icon" aria-label="新對話" title="新對話" onClick={()=>void newChat()}><SquarePen size={19}/></button>}
 <div className="topbar-account">{signedIn?<button type="button" className="account-avatar" title={"登入帳號："+signedIn.email} aria-label={"帳號 "+signedIn.email} onClick={()=>navigate("settings")}>{initial}</button>:<button type="button" disabled={loginBusy} onClick={()=>void connectAccount()} className="google-login">{loginBusy?"連線中…":"Google 登入"}</button>}{loginNotice&&<span className="sr-only" role="status">{loginNotice}</span>}</div>
</div>
</header>
{section==="chat"?<LocalChat key={chatKey} onNavigate={s=>navigate(s)}/>:
<Suspense fallback={<Loading/>}>
{section==="cream"?<div className="workspace-page"><CreamLongitudinal/></div>:
section==="projects"?<div className="workspace-page"><ProjectHub/></div>:
section==="library"?<div className="workspace-page"><ConversationLibrary onFiles={()=>navigate("files")}/></div>:
section==="sheets"?<div className="workspace-page"><Sheets/></div>:
section==="email"?<div className="workspace-page"><EmailStudio/></div>:
section==="files"?<div className="workspace-page"><CloudFiles/></div>:
section==="weiguo"?<div className="workspace-page"><WeiGuoConsole/></div>:
section==="detroit"?<div className="workspace-page"><DetroitStudio initialBody={retinaSeed}/></div>:
section==="orchestra"?<div className="workspace-page"><OrchestraStudio initialBody={orchestraSeed} source={orchestraSource} chart={orchestraChart}/></div>:
section==="luna"?<div className="workspace-page"><LunaStudio key={signedIn?.email||"guest"} owner={signedIn?.email||"guest"}/></div>:
section==="builder"?<div className="workspace-page"><BuildStudio onOpen={openFeature} editingId={editFeatureId} onEditingChange={editFeature}/></div>:
section==="feature"?<div className="workspace-page">{activeFeature?<FeatureRuntime key={activeFeature.id} spec={activeFeature} onEdit={editFeature}/>:<div className="builder-feature-not-found"><h2>找不到這項功能</h2><p>可能已在此裝置移除。</p><button type="button" onClick={()=>navigate("builder")}>返回 Self-Build Studio</button></div>}</div>:
<div className="content-page"><div className="eyebrow">VANILLA / SETTINGS</div><h1>{selected.label}</h1><p className="content-description">{selected.description}</p><SettingsPage/></div>}
</Suspense>}
{section!=="chat"&&<TabBar items={tabs} active={section} onSelect={id=>navigate(id as Section)} compact={compactTabs}/>}
</main></div>;
}
