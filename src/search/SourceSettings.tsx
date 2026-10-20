import {useState} from "react";
import {Search,Plus,Trash2,ExternalLink,BookOpen} from "lucide-react";
import {getSources,setSources,addSource,searchLinks,type PreferredSource} from "./source-preferences";
import {getSearchBridge,setSearchBridge,getWebReaderToken,setWebReaderToken,fetchSearchBridge} from "./search-bridge";
import {getScoutsRegion,setScoutsRegion} from "./scouts-region";
import {googleGroundingAvailable,googleGroundingQuotaMessage} from "./google-grounding";
import {canSearchViaWeiGuo,getWeiGuoScoutsStatus,searchWeiGuoScouts,type ScoutsFamilyStatus} from "../weiguo/api";
export default function SourceSettings(){
 const [sources,setList]=useState<PreferredSource[]>(getSources);
 const [domain,setDomain]=useState(""),[label,setLabel]=useState("");
 const [query,setQuery]=useState(""),[status,setStatus]=useState("");
 const [bridge,setBridge]=useState(getSearchBridge);
 const [readerToken,setReaderToken]=useState("");
 const [testing,setTesting]=useState(false);
 const [region,setRegion]=useState(getScoutsRegion);
 const [scoutsStatus,setScoutsStatus]=useState<ScoutsFamilyStatus|null>(null);
 const [scoutsLoading,setScoutsLoading]=useState(false);
 function update(list:PreferredSource[]){
  try{setSources(list);setList(getSources());setStatus("已更新網站偏好（本裝置設定）");}catch(e){setStatus(e instanceof Error?e.message:String(e));}
 }
 function add(){
  try{addSource(domain,label);setList(getSources());setDomain("");setLabel("");setStatus("已新增網站權重設定");}catch(e){setStatus(e instanceof Error?e.message:String(e));}
 }
 return <section className="source-settings">
  <header><BookOpen size={20}/><div><h3>偏好網站與搜尋權重</h3><p>設定常用的資料來源，讓 Vanilla 在需要搜尋時優先顯示指定網站的查詢入口。</p></div></header>
  <div className="source-add" style={{display:"grid",gap:8,marginTop:12}}>
   <strong>Scouts · 獨立搜尋與地區來源</strong>
   <p>Scouts 優先使用已登入衞國所連接的獨立 Brave／Tavily 網路搜尋，再以 Google Search Grounding 與百科／學術來源備援。將真實查得的 3 個主要來源及最多 1 個地區來源送入你選擇的本地或雲端模型，由爾雅整理引用；搜尋摘要不冒稱已讀全文。Brave／Tavily 金鑰僅放衞國 Railway 後端，不放在 iPhone 設定或聊天中。若供應商尚未設定則無法保證全網搜尋。</p>
   <label>預設搜尋地區（國家／地區，不需要精確定位）
    <input aria-label="Scouts 預設地區" type="text" value={region} maxLength={40} onChange={e=>setRegion(e.target.value)} placeholder="台灣"/>
   </label>
   <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
    <button type="button" onClick={()=>{try{setScoutsRegion(region);setStatus("Scouts 地區已設定為："+getScoutsRegion());}catch(e){setStatus(String(e));}}}>保存預設地區</button>
    <small>{googleGroundingQuotaMessage()|| (googleGroundingAvailable()?"Gemini 已連接，但是否有 Google 搜尋額度仍以實際 API 回應為準":"尚未連接 Gemini：可使用其他已連接的網路搜尋來源")}</small>
   </div>
  </div>
  <div className="source-add" style={{display:"grid",gap:8,marginTop:12}}>
   <strong>衞國 Scouts · 搜尋供應商連線狀態</strong>
   <p>這裡檢查既有衞國後端，不會要求你在聊天、iPhone 或公開網頁輸入 API 金鑰。只有在 Railway 後端配置 Brave 或 Tavily 金鑰，且以既有家庭 Google 帳號登入衞國後，才能使用獨立搜尋。</p>
   {scoutsStatus&&<p role="status">{scoutsStatus.ready?"已連接獨立搜尋服務："+scoutsStatus.providers.join("、"):"衞國可連線，但未設定 Brave／Tavily 搜尋供應商金鑰。"} </p>}
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <button type="button" disabled={scoutsLoading} onClick={async()=>{
     setScoutsLoading(true);
     try{
      if(!canSearchViaWeiGuo())throw Error("請先使用 Vanilla 的同一個 Google 帳號登入衞國，且確認已連接 HTTPS 後端");
      const state=await getWeiGuoScoutsStatus();
      setScoutsStatus(state);
      setStatus(state.ready?"Scouts 供應商已就緒："+state.providers.join("、")+
       "。可按「實測獨立搜尋」驗證實際引用。":"Scouts 後端在線，但尚未配置 Brave 或 Tavily 金鑰。請在 Railway 的 weiguo-browser 服務變數中設定 WEIGUO_SCOUTS_BRAVE_API_KEY 或 WEIGUO_SCOUTS_TAVILY_API_KEY，然後重新部署。");
     }catch(error){setScoutsStatus(null);setStatus("Scouts 連線檢查："+String(error instanceof Error?error.message:error));}
     finally{setScoutsLoading(false);}
    }}>{scoutsLoading?"檢查中…":"檢查衞國 Scouts"}</button>
    <button type="button" disabled={scoutsLoading||!scoutsStatus?.ready} onClick={async()=>{
     setScoutsLoading(true);setStatus("正在向已配置的獨立搜尋服務查詢實際來源（可能計入第三方 API 用量）…");
     try{
      const result=await searchWeiGuoScouts(query.trim()||"衛生福利部 台灣 2027 PGY",region.trim()||getScoutsRegion());
      setStatus(result.results.length?"獨立搜尋實測成功：取得 "+result.results.length+" 筆真實來源；供應商 "+
       result.providers.join("、")+"；地區來源"+(result.results.some(x=>x.regionSpecific)?"已找到":"尚未找到")+"；第一筆："+result.results[0].title+" "+result.results[0].url:
       "衞國搜尋已回應，但本次沒有可引用結果："+result.errors.join("；"));
     }catch(error){setStatus("獨立搜尋實測失敗："+String(error instanceof Error?error.message:error));}
     finally{setScoutsLoading(false);}
    }}>實測獨立搜尋</button>
   </div>
  </div>
  <p>如果 Gemini Google 搜尋出現 HTTP 429，可在 <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer">Google AI Studio 使用量</a> 查看 Google 配額。但獨立的 Brave／Tavily 搜尋不消耗 Gemini Grounding 額度。Wikipedia／Crossref 仍只是專門資料來源，不等於全網搜尋。</p>
  <div className="source-list">{sources.map(source=><div key={source.host}>
   <label className="source-enabled"><input type="checkbox" checked={source.enabled} onChange={e=>update(sources.map(x=>x.host===source.host?{...x,enabled:e.target.checked}:x))}/><span><strong>{source.label}</strong><small>{source.host}</small></span></label>
   <label className="source-weight"><span>權重</span><select value={source.weight} aria-label={source.label+" 的搜尋權重"} onChange={e=>update(sources.map(x=>x.host===source.host?{...x,weight:Number(e.target.value)}:x))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <button type="button" title={"移除 "+source.host} aria-label={"移除 "+source.host} onClick={()=>update(sources.filter(x=>x.host!==source.host))}><Trash2 size={15}/></button>
  </div>)}</div>
  <div className="source-add"><input type="text" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="網站網域，例如 cdc.gov.tw" aria-label="網站網域"/><input type="text" value={label} onChange={e=>setLabel(e.target.value)} placeholder="網站名稱（選填）" aria-label="網站名稱"/><button type="button" onClick={add} disabled={!domain.trim()}><Plus size={15}/>新增來源</button></div>
  <div className="source-test"><label><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="試搜尋：例如糖尿病診療指引"/></label>{query.trim()&&<div>{searchLinks(query).map(item=><a key={item.url} href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{item.label}</a>)}</div>}</div>
  <div className="source-add" style={{display:"grid",gap:8,marginTop:12}}>
   <strong>進階：其他搜尋後端（備援，選用）</strong>
   <p>衞國已提供 Brave／Tavily 的安全後端，不必再填寫下列 Worker。此區僅供額外自建的 HTTPS <code>/search</code>／<code>/read</code> 搜尋服務使用。所有第三方 API 金鑰都應留在各自後端，不能填到公開前端。未取得真實結果時，Scouts 不會假稱已搜尋。</p>
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
  <small>Scouts 優先採用已驗證衞國家庭登入的 Brave／Tavily；未配置或無來源時才回退到 Google 與其他公開索引。全部搜尋需保留來源網址，不能把摘要冒稱為全文。地區偏好僅保存在本裝置。</small>
 </section>;
}
