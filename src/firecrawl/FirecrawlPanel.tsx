import {useState} from "react";
import {scrapeFirecrawl,searchFirecrawl,exportFirecrawlEvidenceJSONL,publishFirecrawlEvidence,clearFirecrawlEvidence,firecrawlSelectedEvidence,type FirecrawlEvidence} from "./firecrawl-research";
export default function FirecrawlPanel(){
 const [url,setUrl]=useState("");
 const [query,setQuery]=useState("");
 const [domain,setDomain]=useState("");
 const [suggestions,setSuggestions]=useState<FirecrawlEvidence[]>([]);
 const [apiKey,setApiKey]=useState("");
 const [approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [result,setResult]=useState(firecrawlSelectedEvidence);
 async function scrape(){
  if(!approved||busy)return;
  setBusy(true);setStatus("正在透過 Firecrawl API 擷取單篇網頁正文…");
  try{
   const evidence=await scrapeFirecrawl(url,apiKey);
   publishFirecrawlEvidence(evidence);
   setResult(evidence);setStatus("確實取得網頁正文 "+evidence.markdown.length+" 字元；已附上來源供一般模式下一次聊天參考（非訓練完成）。");
  }catch(error){setStatus(error instanceof Error?error.message:String(error));}
  finally{setBusy(false);}
 }

 async function search(){
  if(!approved||busy)return;
  setBusy(true);setStatus("正在查詢指定網站（最多 3 筆，可產生服務費用）…");
  try{
   const found=await searchFirecrawl(query,domain,apiKey);
   setSuggestions(found);
   setStatus(found.length?"取得 "+found.length+" 筆真實搜尋結果；尚未選入聊天，也未取得訓練授權。":"沒有取得符合網站範圍且有內容的結果。");
  }catch(error){setStatus(error instanceof Error?error.message:String(error));}
  finally{setBusy(false);}
 }
 async function exportForReview(){
  const unique=[...(result?[result]:[]),...suggestions]
   .filter((item,index,all)=>all.findIndex(x=>x.url===item.url)===index).slice(0,5);
  try{
   const records=await exportFirecrawlEvidenceJSONL(unique);
   const href=URL.createObjectURL(new Blob([records],{type:"application/x-ndjson;charset=utf-8"}));
   const anchor=document.createElement("a");
   anchor.href=href;anchor.download="octuber-firecrawl-unreviewed-evidence.jsonl";
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   // Keep URL alive until the browser has processed the click. Don't persist it.
   setTimeout(()=>URL.revokeObjectURL(href),1500);
   setStatus("已產生 "+unique.length+" 筆未審核證據檔。請使用 training/octuber-knowledge/review.py 對照逐筆授權與人工編寫的問答，未審核不得進入 30B 訓練。");
  }catch(error){setStatus("無法匯出："+(error instanceof Error?error.message:String(error)));}
 }
 return <section className="source-add" aria-label="Firecrawl 網頁研究" style={{display:"grid",gap:9,marginTop:16}}>
  <strong>Firecrawl · 實際網頁擷取</strong>
  <p>你可使用自己的 Firecrawl Key 逐篇擷取公開 HTTPS 網頁，取得正文並在下一輪 OCTUBER 一般模式聊天中引用。不會自動訓練權重、不繞過網站授權、不執行網頁上的指令。瀏覽器若受 CORS 限制，請改用程式庫內的 Python 後端匯入工具。</p>
  <label>合法且已同意擷取的網站網址<input type="url" placeholder="https://example.com/article" spellCheck={false} value={url} onChange={e=>setUrl(e.target.value)}/></label>
  <label>Firecrawl API Key（僅保留在目前頁面記憶體）<input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="fc-…"/></label>
  <label style={{display:"flex",gap:8}}><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>我有權讀取此網頁，了解 Firecrawl 可能計費，並同意將提供的網址送至 Firecrawl。</label>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <button type="button" disabled={!approved||!url||!apiKey||busy} onClick={()=>void scrape()}>{busy?"擷取中…":"實測擷取並加入聊天依據"}</button>
   <button type="button" onClick={()=>{clearFirecrawlEvidence();setResult(null);setSuggestions([]);setStatus("已清除本分頁已擷取的研究資料。");}}>清除證據</button>
  </div>
  <details>
   <summary>進階：在指定網站搜尋實際來源（Firecrawl Search）</summary>
   <p>必須限制為你有權研究的公開 HTTPS 網域。搜尋結果不自動進入對話；只有按下「作為聊天參考」才會送給下一輪 OCTUBER。</p>
   <label>網站主機名稱（僅此網域）<input type="text" spellCheck={false} autoCapitalize="none" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="例如 docs.firecrawl.dev"/></label>
   <label>研究查詢<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如模型資料收集的正確做法"/></label>
   <button type="button" disabled={!approved||busy||query.trim().length<3||!domain.trim()||!apiKey.trim()} onClick={()=>void search()}>
    {busy?"查詢中…":"實測搜尋 3 筆"}
   </button>
   {suggestions.map((item,i)=><div key={item.url+"_"+i} style={{padding:"8px 0",borderBottom:"1px solid var(--border, #ddd)"}}>
    <strong>{item.title}</strong> <small>{item.kind==="search-snippet"?"僅搜尋摘要":"已取得網頁正文"}</small>
    <p><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></p>
    <p>{item.markdown.slice(0,300)}</p>
    <button type="button" onClick={()=>{publishFirecrawlEvidence(item);setResult(item);setStatus("已選取來源，下一輪一般聊天可參考。"+(item.kind==="search-snippet"?"此筆僅摘要，並非全文。":""));}}>作為聊天參考</button>
   </div>)}
  </details>
  {(result||suggestions.length>0)&&<button type="button" disabled={busy} onClick={()=>void exportForReview()}>
   匯出未審核 JSONL 證據（供人工審核／後續模型訓練使用）
  </button>}
    {result&&<details><summary>已選研究來源：{result.title}（{result.kind==="search-snippet"?"摘要":"網頁正文"}，{result.markdown.length} 字）</summary><p>來源：<a href={result.url} target="_blank" rel="noreferrer">{result.url}</a></p><pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:240,overflowY:"auto",fontSize:12}}>{result.markdown.slice(0,3000)}</pre></details>}
  <small>匯出檔保留網址、SHA-256 與未審核狀態；要將內容用於訓練，還須人工審核、著作權／使用權、原創問答及資料集切分。<a href="https://github.com/easylearnfromtw/vanilla/tree/main/training/octuber-knowledge" target="_blank" rel="noreferrer">查看 Hermes + Firecrawl 資料工具</a></small>
  <p role="status">{status}</p>
 </section>;
}
