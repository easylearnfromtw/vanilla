import {useState} from "react";
import {scrapeFirecrawl,publishFirecrawlEvidence,clearFirecrawlEvidence,firecrawlSelectedEvidence} from "./firecrawl-research";
export default function FirecrawlPanel(){
 const [url,setUrl]=useState("");
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
 return <section className="source-add" aria-label="Firecrawl 網頁研究" style={{display:"grid",gap:9,marginTop:16}}>
  <strong>Firecrawl · 實際網頁擷取</strong>
  <p>你可使用自己的 Firecrawl Key 逐篇擷取公開 HTTPS 網頁，取得正文並在下一輪 OCTUBER 一般模式聊天中引用。不會自動訓練權重、不繞過網站授權、不執行網頁上的指令。瀏覽器若受 CORS 限制，請改用程式庫內的 Python 後端匯入工具。</p>
  <label>合法且已同意擷取的網站網址<input type="url" placeholder="https://example.com/article" spellCheck={false} value={url} onChange={e=>setUrl(e.target.value)}/></label>
  <label>Firecrawl API Key（僅保留在目前頁面記憶體）<input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="fc-…"/></label>
  <label style={{display:"flex",gap:8}}><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>我有權讀取此網頁，了解 Firecrawl 可能計費，並同意將提供的網址送至 Firecrawl。</label>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <button type="button" disabled={!approved||!url||!apiKey||busy} onClick={()=>void scrape()}>{busy?"擷取中…":"實測擷取並加入聊天依據"}</button>
   <button type="button" onClick={()=>{clearFirecrawlEvidence();setResult(null);setStatus("已清除本分頁已擷取的研究資料。");}}>清除證據</button>
  </div>
  {result&&<details><summary>已擷取：{result.title}（{result.markdown.length} 字）</summary><p>來源：<a href={result.url} target="_blank" rel="noreferrer">{result.url}</a></p><pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:240,overflowY:"auto",fontSize:12}}>{result.markdown.slice(0,3000)}</pre></details>}
  <small>要將網頁資料製作成訓練資料，還須另外執行審核、標明著作權／使用權、編寫問答與資料集切分。<a href="https://github.com/easylearnfromtw/vanilla/tree/main/training/octuber-knowledge" target="_blank" rel="noreferrer">查看 Hermes + Firecrawl 資料工具</a></small>
  <p role="status">{status}</p>
 </section>;
}
