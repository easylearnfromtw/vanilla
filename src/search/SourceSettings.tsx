import {useState} from "react";
import {saveScholarlyRankCsv,getScholarlyRankTable,saveScholarlyAuthorityLedger,getScholarlyAuthorityLedger} from "./scholarly-discovery";
import FirecrawlPanel from "../firecrawl/FirecrawlPanel";
import {Search,Plus,Trash2,ExternalLink,BookOpen} from "lucide-react";
import {getSources,setSources,addSource,searchLinks,type PreferredSource} from "./source-preferences";
import {getSearchBridge,setSearchBridge,getWebReaderToken,setWebReaderToken,fetchSearchBridge} from "./search-bridge";
import {getScoutsRegion,setScoutsRegion} from "./scouts-region";
import {googleGroundingAvailable,googleGroundingQuotaMessage} from "./google-grounding";
export default function SourceSettings(){
 const [sources,setList]=useState<PreferredSource[]>(getSources);
 const [domain,setDomain]=useState(""),[label,setLabel]=useState("");
 const [query,setQuery]=useState(""),[status,setStatus]=useState("");
 const [bridge,setBridge]=useState(getSearchBridge);
 const [readerToken,setReaderToken]=useState("");
 const [testing,setTesting]=useState(false);
 const [scholarlyStatus,setScholarlyStatus]=useState(()=>Object.keys(getScholarlyRankTable()).length+" 個已匯入的排名識別碼（僅此裝置）");
 const [authorityStatus,setAuthorityStatus]=useState(()=>getScholarlyAuthorityLedger().length+" 筆已審核的非大學研究例外");
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
   <p>Scouts 優先使用已登入衞國所連接的獨立 Brave／Tavily 網路搜尋，再以 Google Search Grounding 與百科／學術來源備援。將真實查得的 3 個主要來源及最多 1 個地區來源送入你選擇的本地或雲端模型，由爾雅整理引用；搜尋摘要不冒稱已讀全文。Brave／Tavily 金鑰僅放衞國 Railway 後端，不放在 iPhone 設定或聊天中。若供應商尚未設定則無法保證全網搜尋。</p>
   <label>預設搜尋地區（國家／地區，不需要精確定位）
    <input aria-label="Scouts 預設地區" type="text" value={region} maxLength={40} onChange={e=>setRegion(e.target.value)} placeholder="台灣"/>
   </label>
   <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
    <button type="button" onClick={()=>{try{setScoutsRegion(region);setStatus("Scouts 地區已設定為："+getScoutsRegion());}catch(e){setStatus(String(e));}}}>保存預設地區</button>
    <small>{googleGroundingQuotaMessage()|| (googleGroundingAvailable()?"Gemini 已連接，但是否有 Google 搜尋額度仍以實際 API 回應為準":"尚未連接 Gemini：可使用其他已連接的網路搜尋來源")}</small>
   </div>
  </div>
  <p>若出現 HTTP 429，請開啟 <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer">Google AI Studio 使用量與限制</a> 查看目前模型配額。若你希望在 Google 配額用完時仍能搜尋一般網站，需要設定另一個獨立且合法的搜尋服務；免費的 Wikipedia／Crossref 不等同全網搜尋。</p>
  <div className="source-list">{sources.map(source=><div key={source.host}>
   <label className="source-enabled"><input type="checkbox" checked={source.enabled} onChange={e=>update(sources.map(x=>x.host===source.host?{...x,enabled:e.target.checked}:x))}/><span><strong>{source.label}</strong><small>{source.host}</small></span></label>
   <label className="source-weight"><span>權重</span><select value={source.weight} aria-label={source.label+" 的搜尋權重"} onChange={e=>update(sources.map(x=>x.host===source.host?{...x,weight:Number(e.target.value)}:x))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <button type="button" title={"移除 "+source.host} aria-label={"移除 "+source.host} onClick={()=>update(sources.filter(x=>x.host!==source.host))}><Trash2 size={15}/></button>
  </div>)}</div>
  <div className="source-add"><input type="text" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="網站網域，例如 cdc.gov.tw" aria-label="網站網域"/><input type="text" value={label} onChange={e=>setLabel(e.target.value)} placeholder="網站名稱（選填）" aria-label="網站名稱"/><button type="button" onClick={add} disabled={!domain.trim()}><Plus size={15}/>新增來源</button></div>
  <div className="source-test"><label><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="試搜尋：例如糖尿病診療指引"/></label>{query.trim()&&<div>{searchLinks(query).map(item=><a key={item.url} href={item.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>{item.label}</a>)}</div>}</div>
  <div className="source-add" style={{display:"grid",gap:8,marginTop:12}}>
   <strong>進階：其他搜尋後端（備援，選用）</strong>
   <p>Google 有可用搜尋配額時，不需要另外設置 Worker。若要在 HTTP 429 時繼續一般網站搜尋，可用獨立的 Brave 等供應商在你的 HTTPS 後端提供 <code>/search</code> 和 <code>/read</code>。API 金鑰只能留在後端。沒有已部署且有權限的後端時，系統不會假稱成功搜尋。</p>
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

  <div className="source-add" style={{display:"grid",gap:8,marginTop:12}}>
   <strong>學術論文 · OpenAlex／arXiv 引用優先級</strong>
   <p>研究問題優先查 OpenAlex，若其索引顯示 arXiv 來源則保留預印本標示。大學 QS-2027 名次依你的 5／4／3／2／1 規則調整引用順序；來源內容的證據品質仍比學校聲望重要，所有符合授權的論文都可以進入後續訓練資料集。</p>
   <label>匯入已取得授權且由你核對的大學 QS-2027 CSV 排名（欄位：ror,openalex_id,rank）
    <input type="file" accept=".csv,text/csv" aria-label="匯入世界大學排名 CSV" onChange={async e=>{
     const file=e.currentTarget.files?.[0];e.currentTarget.value="";
     if(!file)return;
     try{
      if(file.size>350000)throw Error("CSV 超過 350 KB");
      const count=saveScholarlyRankCsv(await file.text());
      setScholarlyStatus("已儲存 "+count+" 個機構識別碼；請自行確認排名授權與正確性。");
     }catch(error){setScholarlyStatus("匯入失敗："+(error instanceof Error?error.message:String(error)));}
    }}/>
   </label>
   <small role="status">{scholarlyStatus}</small>
   <label>匯入非大學產業／學者／重要理論權重 5 審核名冊（JSONL）
    <input type="file" accept=".jsonl,.json,application/json" aria-label="匯入非大學權威審核名冊" onChange={async e=>{
     const file=e.currentTarget.files?.[0];e.currentTarget.value="";
     if(!file)return;
     try{
      if(file.size>350000)throw Error("審核名冊超過 350 KB");
      const count=saveScholarlyAuthorityLedger(await file.text());
      setAuthorityStatus("已儲存 "+count+" 筆權威例外；身分認定和依據須由審核者負責。");
     }catch(error){setAuthorityStatus("匯入失敗："+(error instanceof Error?error.message:String(error)));}
    }}/>
   </label>
   <small role="status">{authorityStatus}</small>

   <small>未匯入或無法核實學校時暫採權重 1；非大學權威例外須有審核紀錄。學術搜尋顯示中繼資料不等於下載全文或完成模型微調。</small>
  </div>
  <FirecrawlPanel/>
  <p role="status" className="source-status">{status}</p>
  <small>Google Search Grounding 需已授權的 Gemini API 與可用額度，且回傳引用不等於完整讀取網站。若 Google 無引用，系統才退回現有搜尋來源；未取得的來源不會補造。地區設定僅在本裝置儲存。</small>
 </section>;
}
