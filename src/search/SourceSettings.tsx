import {useState} from "react";
import {Search,Plus,Trash2,ExternalLink,BookOpen} from "lucide-react";
import {getSources,setSources,addSource,searchLinks,type PreferredSource} from "./source-preferences";
import {getSearchBridge,setSearchBridge} from "./search-bridge";
export default function SourceSettings(){
 const [sources,setList]=useState<PreferredSource[]>(getSources);
 const [domain,setDomain]=useState(""),[label,setLabel]=useState("");
 const [query,setQuery]=useState(""),[status,setStatus]=useState("");
 const [bridge,setBridge]=useState(getSearchBridge);
 function update(list:PreferredSource[]){
  try{setSources(list);setList(getSources());setStatus("已更新網站偏好（本裝置設定）");}catch(e){setStatus(e instanceof Error?e.message:String(e));}
 }
 function add(){
  try{addSource(domain,label);setList(getSources());setDomain("");setLabel("");setStatus("已新增網站權重設定");}catch(e){setStatus(e instanceof Error?e.message:String(e));}
 }
 return <section className="source-settings">
  <header><BookOpen size={20}/><div><h3>偏好網站與搜尋權重</h3><p>設定常用的資料來源，讓 Vanilla 在需要搜尋時優先顯示指定網站的查詢入口。</p></div></header>
  <div className="source-list">{sources.map(source=><div key={source.host}>
   <label className="source-enabled"><input type="checkbox" checked={source.enabled} onChange={e=>update(sources.map(x=>x.host===source.host?{...x,enabled:e.target.checked}:x))}/><span><strong>{source.label}</strong><small>{source.host}</small></span></label>
   <label className="source-weight"><span>權重</span><select value={source.weight} aria-label={source.label+" 的搜尋權重"} onChange={e=>update(sources.map(x=>x.host===source.host?{...x,weight:Number(e.target.value)}:x))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <button type="button" title={"移除 "+source.host} aria-label={"移除 "+source.host} onClick={()=>update(sources.filter(x=>x.host!==source.host))}><Trash2 size={15}/></button>
  </div>)}</div>
  <div className="source-add"><input type="text" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="網站網域，例如 cdc.gov.tw" aria-label="網站網域"/><input type="text" value={label} onChange={e=>setLabel(e.target.value)} placeholder="網站名稱（選填）" aria-label="網站名稱"/><button type="button" onClick={add} disabled={!domain.trim()}><Plus size={15}/>新增來源</button></div>
  <div className="source-test"><label><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="試搜尋：例如糖尿病診療指引"/></label>{query.trim()&&<div>{searchLinks(query).map(item=><a key={item.url} href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{item.label}</a>)}</div>}</div>
  <div className="source-add" style={{display:"grid",gap:8,marginTop:12}}>
   <strong>進階：自訂全網搜尋後端（選用）</strong>
   <p>Wikipedia 與 Crossref 可直接在 Safari 查詢。若要整合 Google、Brave 或自有搜尋服務的正式搜尋結果，請在你自己的安全後端設定該服務，並填入提供 <code>GET /search?q=...</code>、回傳標題／網址／摘要 JSON 的 HTTPS API。不要將搜尋服務金鑰放在這裡。</p>
   <input aria-label="HTTPS 搜尋後端網址" type="url" value={bridge} placeholder="https://your-search.example/search" onChange={e=>setBridge(e.target.value)} />
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <button type="button" onClick={()=>{try{setSearchBridge(bridge);setStatus(bridge.trim()?"已儲存搜尋後端，下一次搜尋會嘗試連線；尚未驗證 API。":"已停用額外搜尋後端");}catch(e){setStatus(String(e));}}}>儲存搜尋設定</button>
    <button type="button" onClick={()=>{setBridge("");setSearchBridge("");setStatus("已移除自訂搜尋後端");}}>停用</button>
   </div>
  </div>
  <p role="status" className="source-status">{status}</p>
  <small>搜尋指令目前會嘗試實際取得 Wikipedia／Crossref 的公開結果，並保留 Google 搜尋連結；自訂 HTTPS 搜尋後端可擴充可讀取的結果，但回傳內容仍需人工核對，不代表所有網站都能跨來源爬取。</small>
 </section>;
}
