import {useMemo,useState} from "react";
import {Database,Search,ExternalLink,ShieldAlert} from "lucide-react";
import {currentChatMode} from "../local-ai/chat-session";
import {zeusSuggestApiCandidates} from "./zeus";
import {API_DIRECTORY_CATEGORIES,API_DIRECTORY_REFERENCES,fetchApiDirectory,reviewApiCandidate,type ApiCandidate,type ApiDirectoryCategory} from "./api-registry";
export default function ApiRegistryPanel(){
 const [category,setCategory]=useState<ApiDirectoryCategory>("open-source");
 const [query,setQuery]=useState("");
 const [items,setItems]=useState<ApiCandidate[]>([]);
 const [selected,setSelected]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("按「載入公開目錄」才會向 GitHub 取得公開清單。");
 const privateMode=currentChatMode()==="private";
 const results=useMemo(()=>zeusSuggestApiCandidates(query,items),[query,items]);
 const inspected=items.find(x=>x.id===selected);
 async function load(){
  if(busy)return;
  setBusy(true);setMessage("讀取目錄中繼資料…");setItems([]);setSelected("");
  try{
   const list=await fetchApiDirectory(category,{privateMode,online:navigator.onLine});
   setItems(list);
   setMessage("已讀取 "+list.length+" 個候選項目；沒有呼叫任何候選 API。");
  }catch(e){setMessage("載入失敗："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <section className="detroit-studio-form detroit-api-registry">
  <h2><Database size={23}/> Detroit · 開源能力索引</h2>
  <p>Zeus 比對公開 API 與 Python 專案，Diana 建議適用模組，Athena／Quirinus 提供安全檢查。索引唯讀，不安裝、不執行，也不傳送聊天資料。</p>
  <div className="detroit-api-sources">{API_DIRECTORY_REFERENCES.map(s=><a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.label} <ExternalLink size={14}/></a>)}</div>
  <div className="detroit-api-filters">
   <label>分類<select value={category} onChange={e=>{setCategory(e.target.value as ApiDirectoryCategory);setItems([]);setSelected("");setMessage("分類已變更；請手動重新載入。");}}>{API_DIRECTORY_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
   <label>搜尋工具／API <span className="detroit-api-input"><Search size={16}/><input value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} placeholder="agent、Python、Data Analysis、FastAPI"/></span></label>
  </div>
  <button type="button" className="detroit-primary" onClick={()=>void load()} disabled={busy||privateMode}>{busy?"讀取中…":"載入公開目錄"}</button>
  {privateMode&&<p>私人模式禁止外部目錄請求，請切換一般模式後再手動載入。</p>}
  <p role="status" aria-live="polite">{message}</p>
  {items.length>0&&<><p>Zeus 搜尋結果 {results.length} 筆（每次最多顯示 30 筆）；狀態均為「未驗證」。</p>
   <div className="detroit-api-results">{results.map(item=><article key={item.id}>
    <div className="detroit-api-result-head"><strong>{item.name}</strong><span>未驗證</span></div>
    <p>{item.description||"來源尚無說明。"}</p>
    {item.subCategory&&<p className="detroit-api-source-category">Python / {item.subCategory}</p>}
    <div className="detroit-api-actions">
     <button type="button" onClick={()=>setSelected(item.id)} aria-pressed={selected===item.id}>Athena 審核</button>
     <a href={item.listingUrl} target="_blank" rel="noopener noreferrer">原始頁面 <ExternalLink size={13}/></a>
    </div>
   </article>)}</div>
  </>}
  {inspected&&<div className="detroit-api-review">
   <h3><ShieldAlert size={18}/> Athena · {inspected.name}</h3>
   <p>Diana／Zeus 建議評估模組：{reviewApiCandidate(inspected).recommendedEngine.toUpperCase()}；目前無執行權限。</p>
   <ul>{reviewApiCandidate(inspected).checks.map(x=><li key={x}>{x}</li>)}</ul>
  </div>}
  <p className="detroit-api-footnote">來源為第三方專案清單，不代表套件獲安全或授權認證。Python 工具不能直接在瀏覽器內安裝；未完成逐項審核、後端隔離及明確授權前，Diana 僅能提出建議，不會執行。</p>
 </section>;
}
