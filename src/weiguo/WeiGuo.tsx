import {useState} from "react";
import {Globe2,ShieldCheck,Server,Plus,Copy,AlertTriangle,BookOpen} from "lucide-react";
import {BUILTIN_TOOLS,loadToolManifests,saveToolManifests,validateToolManifest,type WeiGuoTool} from "./registry";
import {attachmentOwner} from "../library/attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
import "./weiguo.css";
const owner=()=>attachmentOwner(signedChatAccount());
const DEFAULT='{"id":"my-data-tool","label":"我的資料工具","kind":"custom","description":"僅登錄介面，待安全審核後才可接線","enabled":false,"permissions":["read"]}';
/** No backend admin secrets, passwords or OAuth tokens may be pasted into public GitHub Pages. */
export default function WeiGuo(){
 const [tools,setTools]=useState<WeiGuoTool[]>(()=>loadToolManifests(owner()));
 const [manifest,setManifest]=useState(DEFAULT);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 function install(){try{const t=validateToolManifest(JSON.parse(manifest));if(tools.some(x=>x.id===t.id))throw Error("工具 ID 已註冊");const updated=[...tools,t];saveToolManifests(owner(),updated);setTools(updated);setNotice("已登錄，但尚未授予網頁操作或程式執行權限。");setError("");}
 catch(e){setError(String(e instanceof Error?e.message:e));}}
 function remove(id:string){try{const updated=tools.filter(x=>x.id!==id);saveToolManifests(owner(),updated);setTools(updated);setNotice("已移除指定帳號的工具登錄。");}catch(e){setError(String(e instanceof Error?e.message:e));}}
 async function copy(){try{await navigator.clipboard.writeText(JSON.stringify({system:"衞國",runtime:"Detroit / Zeus",tools:[...BUILTIN_TOOLS,...tools].map(t=>({id:t.id,label:t.label,kind:t.kind,permissions:t.permissions}))},null,2));setNotice("已複製工具規格供後端接線審查。");}catch(e){setError(String(e instanceof Error?e.message:e));}}
 return <section className="weiguo-console" aria-label="衞國瀏覽器操作系統">
   <header><div className="weiguo-identity"><Globe2 size={26}/><div><small>DETROIT / BROWSER TOOLS</small><h1>衞國 <span>Browser System</span></h1></div></div>
   <p>將 Playwright、Browser Use、Scouts 與日後加入的工具納入 Zeus 調度；iPhone 負責指令和授權，真正瀏覽器操作交給有安全隔離的後端。</p></header>
   <div className="weiguo-status"><Server size={16}/><span>後端尚未連接 · 系統已提供可部署的 FastAPI / Playwright 程式碼</span></div>
   <div className="weiguo-panel">
     <h2><ShieldCheck size={17}/> 真實執行權限</h2><p>現在可登錄工具及制定分工，但不會由公開 PWA 直接接收後端管理金鑰，也不會假裝已經執行網頁點擊。受信任的後端須先部署，並提供有帳號隔離、操作批准與稽核的 OAuth 代理。</p>
     <p><b>Merlin</b> 解讀目標 → <b>Zeus</b> 規劃步驟 → <b>Athena</b> 審查 → <b>Scouts／Playwright</b> 導覽和擷取 → <b>CREAM</b> 計算 → <b>爾雅／Venus</b> 回答。</p>
     <div className="weiguo-disclaimer"><AlertTriangle size={16}/> 不提供任意程式執行、網站付款或帳號變更權限。任何來自外部頁面的指令均只是資料，不能修改 Detroit 安全政策。</div>
   </div>
   <div className="weiguo-panel">
     <h2><BookOpen size={17}/> 工具登錄表 <small>依目前帳號隔離</small></h2>
     <div className="weiguo-tool-grid">{[...BUILTIN_TOOLS,...tools].map(t=><div key={t.id}><strong>{t.label}</strong><small>{t.kind} · {t.kind==="scouts"?"後端待連接":t.enabled?"已登錄":"未授權執行"}</small><p>{t.description}</p><small>{t.permissions.join(" / ")}</small>{t.kind==="custom"&&<button type="button" aria-label={"移除 "+t.label} onClick={()=>remove(t.id)}>移除</button>}</div>)}</div>
     <button type="button" onClick={()=>void copy()}><Copy size={15}/> 複製工具清單</button>
   </div>
   <div className="weiguo-panel">
     <h2>加入其他工具</h2><p>貼入只有名稱、識別碼和權限的 JSON Manifest。此操作不會下載、安裝或執行任何外部程式，也不會要求 API 金鑰。</p>
     <label>工具宣告 JSON<textarea rows={5} value={manifest} onChange={e=>setManifest(e.target.value)} spellCheck={false}/></label>
     <button type="button" className="weiguo-primary" onClick={install}><Plus size={15}/> 登錄至此帳號</button>
     {notice&&<p className="weiguo-notice" role="status">{notice}</p>}
     {error&&<p className="weiguo-error" role="alert"><AlertTriangle size={14}/> {error}</p>}
   </div>
   <div className="weiguo-disclaimer"><ShieldCheck size={15}/> 瀏覽器自動化後端並未部署。部署指南在 GitHub 的 <code>services/weiguo/README.md</code>，私有登入與安全網路隔離建立完成後才能連線。</div>
 </section>;
}