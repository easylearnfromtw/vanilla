import {useState} from "react";
import {Search,Plus,Trash2,ExternalLink,BookOpen} from "lucide-react";
import {getSources,setSources,addSource,searchLinks,type PreferredSource} from "./source-preferences";
import {getSearchBridge,setSearchBridge,getWebReaderToken,setWebReaderToken,fetchSearchBridge} from "./search-bridge";
import {getScoutsRegion,setScoutsRegion} from "./scouts-region";
import {googleGroundingAvailable} from "./google-grounding";
export default function SourceSettings(){
 const [sources,setList]=useState<PreferredSource[]>(getSources);
 const [domain,setDomain]=useState(""),[label,setLabel]=useState("");
 const [query,setQuery]=useState(""),[status,setStatus]=useState("");
 const [bridge,setBridge]=useState(getSearchBridge);
 const [readerToken,setReaderToken]=useState("");
 const [testing,setTesting]=useState(false);
 const [region,setRegion]=useState(getScoutsRegion);
 function update(list:PreferredSource[]){
  try{setSources(list);setList(getSources());setStatus("已更新網站偏好（本裝置設定）");}catch(e){setStatus(e instanceof Error?e.message:String(e));}
 }
 function add(){
  try{addSource(domain,label);setList(getSources());setDomain("");setLabel("");setStatus("已新增網站權重設定");}catch(e){setStatus(e instanceof Error?e.message:String(e));}
 }
 return <section className="source-settings">
  <header><BookOpen size={20}/><div><h3>偏好網站與搜尋權重</h3><p>設定常用的資料來源，讓 Vanilla 在需要搜尋時優先顯示指定網站的查詢入口。</p></div></header>
  <div className="source-add" style={{display:"grid",gap:8,marginTop:12}}>
   <strong>Scouts · Google 搜尋與地區來源</strong>
   <p>有連接 Gemini 時，Scouts 會優先使用官方 Google Search Grounding，取得最多 3 個主要引用來源，再尋找 1 個地區相關來源。每個連結會嘗試讀取正文；只能取得 Google 引用的項目會如實標示。使用前會先詢問同意 Google API 可能產生的用量費用。</p>
   <label>預設搜尋地區（國家／地區，不需要精確定位）
    <input aria-label="Scouts 預設地區" type="text" value={region} maxLength={40} onChange={e=>setRegion(e.target.value)} placeholder="台灣"/>
   </label>
   <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
    <button type="button" onClick={()=>{try{setScoutsRegion(region);setStatus("Scouts 地區已設定為："+getScoutsRegion());}catch(e){setStatus(String(e));}}}>保存預設地區</button>
    <small>{googleGroundingAvailable()?"已連接 Gemini，可呼叫 Google Search Grounding":"尚未連接 Gemini：仍可使用其他已連接的網路搜尋來源"}</small>
   </div>
  </div>
  <div className="source-list">{sources.map(source=><div key={source.host}>
   <label className="source-enabled"><input type="checkbox" checked={source.enabled} onChange={e=>update(sources.map(x=>x.host===source.host?{...x,enabled:e.target.checked}:x))}/><span><strong>{source.label}</strong><small>{source.host}</small></span></label>
   <label className="source-weight"><span>權重</span><select value={source.weight} aria-label={source.label+" 的搜尋權重"} onChange={e=>update(sources.map(x=>x.host===source.host?{...x,weight:Number(e.target.value)}:x))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <button type="button" title={"移除 "+source.host} aria-label={"移除 "+source.host} onClick={()=>update(sources.filter(x=>x.host!==source.host))}><Trash2 size={15}/></button>
  </div>)}</div>
  <div className="source-add"><input type="text" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="網站網域，例如 cdc.gov.tw" aria-label="網站網域"/><input type="text" value={label} onChange={e=>setLabel(e.target.value)} placeholder="網站名稱（選填）" aria-label="網站名稱"/><button type="button" onClick={add} disabled={!domain.trim()}><Plus size={15}/>新增來源</button></div>
  <div className="source-test"><label><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="試搜尋：例如糖尿病診療指引"/></label>{query.trim()&&<div>{searchLinks(query).map(item=><a key={item.url} href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{item.label}</a>)}</div>}</div>
  <div className="source-add" style={{display:"grid",gap:8,marginTop:12}}>
   <strong>進階：其他搜尋後端（備援，選用）</strong>
   <p>已連接 Gemini 的情況不需要另外設置搜尋 Worker。只有希望使用自行管理的 Brave／其他搜尋後端或代理抓取正文時才需填此欄，格式為 <code>https://你的網域/search</code>，另提供配對的 <code>/read</code>。API 金鑰應由後端保存。</p>
   <input aria-label="HTTPS 搜尋後端網址" type="url" value={bridge} placeholder="https://your-search.example/search" onChange={e=>setBridge(e.target.value)} />
   <label>後端存取權杖（僅本次分頁保存）
    <input type="password" autoComplete="off" placeholder={getWebReaderToken()?"已設定（留白不更動）":"與 Worker 的 WEB_READER_TOKEN 一致"} value={readerToken} onChange={e=>setReaderToken(e.target.value)}/>
   </label>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <button type="button" onClick={()=>{try{setSearchBridge(bridge);if(readerToken.trim()){setWebReaderToken(readerToken);setReaderToken("");}setStatus(bridge.trim()?"已儲存搜尋後端，下一次搜尋會嘗試連線；尚未驗證 API。":"已停用額外搜尋後端");}catch(e){setStatus(String(e));}}}>儲存搜尋設定</button>
    <button type="button" disabled={!getSearchBridge()||testing} onClick={async()=>{
     setTesting(true);setStatus("正在驗證後端是否能回傳真實搜尋結果…");
     try{
      const hits=await fetchSearchBridge(query.trim()||"臺灣衛生福利部");
      setStatus(hits.length?"搜尋測試成功：實際取得 "+hits.length+" 筆結果，第一筆為「"+hits[0].title+"」。":"後端有正常回應，但沒有搜尋結果；請檢查搜尋服務配額或查詢內容。");
     }catch(error){setStatus("Scouts 後端測試失敗："+(error instanceof Error?error.message:String(error))+"。HTTP 401 請確認存取權杖；403 請確認 CORS 允許的 Vanilla 網域。");}
     finally{setTesting(false);}
    }}>{testing?"測試中…":"實測搜尋後端"}</button>
    <button type="button" onClick={()=>{setBridge("");setSearchBridge("");setWebReaderToken("");setReaderToken("");setStatus("已移除自訂搜尋後端與權杖");}}>停用</button>
   </div>
  </div>
  <p role="status" className="source-status">{status}</p>
  <small>Google Search Grounding 需已授權的 Gemini API 與可用額度，且回傳引用不等於完整讀取網站。若 Google 無引用，系統才退回現有搜尋來源；未取得的來源不會補造。地區設定僅在本裝置儲存。</small>
 </section>;
}
