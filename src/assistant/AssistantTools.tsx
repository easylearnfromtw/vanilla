import {useState} from "react";
import {Wrench,ChevronDown,ExternalLink,FileSpreadsheet,Database,FolderOpen,Code,Search} from "lucide-react";
import {PROJECTS} from "./intent-router";
import {searchLinks} from "../search/source-preferences";
import {driveSession} from "../workspace/cloud-drive";
export default function AssistantTools({onPrompt}:{onPrompt:(query:string)=>void}){
 const [expanded,setExpanded]=useState(false),[query,setQuery]=useState("");
 const signed=Boolean(driveSession());
 return <section className="assistant-tool-shelf">
  <button type="button" className="assistant-tool-toggle" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}><Wrench size={15}/>工具與專案<span>{signed?"Google Drive 已連線":"資料留在此裝置"}</span><ChevronDown size={14} className={expanded?"open":""}/></button>
  {expanded&&<div className="assistant-tool-content">
   <p>所有工具以對話為入口。只有你要求時才開啟其他介面或操作專案資料。</p>
   <div className="assistant-tool-shortcuts">
    <button type="button" onClick={()=>onPrompt("幫我建立家庭收支表格")}><FileSpreadsheet size={15}/>表格</button>
    <button type="button" onClick={()=>onPrompt("查詢健人最近的訓練數據")}><Database size={15}/>健人數據</button>
    <button type="button" onClick={()=>onPrompt("開啟雲端檔案")}><FolderOpen size={15}/>檔案</button>
    <button type="button" onClick={()=>onPrompt("開啟 Self-Build")}><Code size={15}/>新增功能</button>
   </div>
   <h4>已識別的其他專案</h4>
   <div className="assistant-project-list">{PROJECTS.map(project=><a key={project.id} href={project.url} target="_blank" rel="noreferrer"><span>{project.name}</span><ExternalLink size={13}/></a>)}</div>
   <h4>搜尋可信來源</h4>
   <div className="assistant-search-input"><Search size={15}/><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="輸入主題後選擇網站" aria-label="網站搜尋主題"/></div>
   {query.trim()&&<div className="assistant-source-results">{searchLinks(query).map(x=><a key={x.url} href={x.url} target="_blank" rel="noreferrer">{x.label}<ExternalLink size={12}/></a>)}</div>}
   <small>專案連結是已識別的入口，不代表已獲得跨裝置或其他帳號的資料權限。網站搜尋會開啟外部搜尋結果，並非已完成內容擷取或引用。</small>
  </div>}
 </section>;
}
