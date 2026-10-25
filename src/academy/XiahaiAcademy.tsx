import {useRef,useState,type FormEvent} from "react";
import {ArrowUpRight,BookOpen,LibraryBig,Search,ShieldCheck} from "lucide-react";
import EvidenceCard from "./EvidenceCard";
import {getScholarlyRankTable,getScholarlyAuthorityLedger,searchOpenAlexWorks,type AcademicHit} from "../search/scholarly-discovery";
import "./xiahai-academy.css";

export default function XiahaiAcademy(){
 const [query,setQuery]=useState("");
 const [submitted,setSubmitted]=useState("");
 const [results,setResults]=useState<AcademicHit[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [batchSize,setBatchSize]=useState<8|100>(8);
 const current=useRef(0);
 const rankingCount=Object.keys(getScholarlyRankTable()).length;
 const authorityCount=getScholarlyAuthorityLedger().length;
 async function search(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const text=query.trim();
  if(text.length<2){setMessage("請輸入至少兩個字的論文名稱、主題或 DOI。");return;}
  const serial=++current.current;
  setBusy(true);setMessage("");setSubmitted("");setResults([]);
  try{
   const papers=await searchOpenAlexWorks(text,batchSize);
   if(serial!==current.current)return;
   setSubmitted(text);setResults(papers);
   if(!papers.length)setMessage("OpenAlex 未回傳可引用的論文；可改用英文關鍵詞，或開啟 arXiv 原站搜尋。");
  }catch(error){
   if(serial!==current.current)return;
   setMessage("未能取得 OpenAlex 即時資料："+(error instanceof Error?error.message:"來源連線失敗")+
    "。請使用下方原站連結查找；未取得的論文不會被假造。");
  }finally{if(serial===current.current)setBusy(false);}
 }
 return <div className="xiahai">
  <div className="xiahai-topline"><span className="xiahai-seal" aria-hidden="true">霞海</span><span>VANILLA RESEARCH · SCHOLARLY LIBRARY</span></div>
  <header className="xiahai-hero">
   <div className="xiahai-kicker">研經讀論 · 引而有據</div>
   <h1>霞海書院</h1>
   <p>學術論文來源索引</p>
   <div className="xiahai-line" aria-hidden="true"/>
   <p className="xiahai-intro">以 OpenAlex 為論文索引主入口，辨識 arXiv 預印本來源。每一次引用都能回到原始研究，不以校名聲望取代實證。</p>
  </header>
  <section className="xiahai-search" aria-label="檢索學術論文">
   <form onSubmit={e=>void search(e)}>
    <Search size={19} aria-hidden="true"/>
    <label className="sr-only" htmlFor="xiahai-query">論文標題、研究主題或 DOI</label>
    <input id="xiahai-query" value={query} onChange={e=>setQuery(e.target.value)}
      autoComplete="off" maxLength={180} placeholder="搜尋論文標題、研究主題或 DOI…" />
    <button type="submit" disabled={busy||query.trim().length<2}>{busy?"檢索中…":"檢索文獻"}</button>
   </form>
   <div className="xiahai-batch-choice">
    <span>單次檢索</span>
    <button type="button" className={batchSize===8?"selected":""} onClick={()=>setBatchSize(8)}>8 篇 · 快速</button>
    <button type="button" className={batchSize===100?"selected":""} onClick={()=>setBatchSize(100)}>100 篇 · Evidence 批次練習</button>
   </div>
   <div className="xiahai-source-links">
    <span>學術來源</span>
    <a href="https://openalex.org/" target="_blank" rel="noopener noreferrer">OpenAlex <ArrowUpRight size={14}/></a>
    <a href={"https://arxiv.org/search/?query="+encodeURIComponent(query.trim()||"machine learning")+"&searchtype=all"}
     target="_blank" rel="noopener noreferrer">arXiv 原站搜尋 <ArrowUpRight size={14}/></a>
   </div>
   <p className="xiahai-note">僅在你按下「檢索文獻」時傳送關鍵字給 OpenAlex。查詢取得的是文獻中繼資料，不代表下載或閱讀論文全文。</p>
  </section>
  <section className="xiahai-policy" aria-label="1,000 篇學術全文訓練的實測報告">
   <div className="xiahai-policy-heading"><BookOpen size={18}/><strong>真實全文知識庫 · 1,000 篇</strong></div>
   <div className="xiahai-tiers" role="list">
    <span role="listitem"><b>1,000</b> PMC 真實論文全文</span>
    <span role="listitem"><b>41,796</b> 原文分段</span>
    <span role="listitem"><b>250,000</b> CPU 模型更新步數</span>
   </div>
   <p>已實際建立 1,000 篇開放授權論文的離線全文索引，使用原文片段訓練檢索小模型。每篇保留原始作者、DOI 與 CC BY 授權出處；尚未進行 Qwen 的 GPU 神經模型微調。</p>
   <p className="xiahai-muted">本頁上方的即時搜尋仍使用 OpenAlex 書目資料，尚未直接連線至離線全文 SQLite。CPU 的 99.987% 分段匹配測試結果，不代表專業建議的正確率。</p>
   <div className="xiahai-source-links"><a href="https://github.com/easylearnfromtw/vanilla/actions/runs/40168229489" target="_blank" rel="noopener noreferrer">查看原始訓練與來源驗證紀錄 <ArrowUpRight size={14}/></a></div>
  </section>
  <section className="xiahai-policy" aria-label="引用權重制度">
   <div className="xiahai-policy-heading"><ShieldCheck size={18}/><strong>學術引用優先級</strong></div>
   <div className="xiahai-tiers" role="list">
    <span role="listitem"><b>5</b> 世界前 100</span>
    <span role="listitem"><b>4</b> 101–300</span>
    <span role="listitem"><b>3</b> 301–500</span>
    <span role="listitem"><b>2</b> 501–700</span>
    <span role="listitem"><b>1</b> 701 後及未核實</span>
   </div>
   <p>經查證的非大學產業權威、專家或經典理論可列權重 5；其餘非大學論文為 1。權重僅作引用排序，<strong>不排除任何低權重論文的學習機會</strong>。撤稿、證據不足及授權問題另行檢查。</p>
   <p className="xiahai-muted">本裝置已匯入 {rankingCount} 個排名識別碼、{authorityCount} 筆權威例外。未核實學校名次時預設權重 1，可在「設定 → 語氣與來源」匯入具授權的 QS 排名資料。</p>
  </section>
  <section className="xiahai-results" aria-label="論文檢索結果" aria-live="polite">
   <div className="xiahai-section-title"><LibraryBig size={18}/><h2>學術文獻</h2>{submitted&&<span>「{submitted}」 · {results.length} 筆</span>}</div>
   {message&&<p className="xiahai-feedback" role="status">{message}</p>}
   {!busy&&!submitted&&!message&&<div className="xiahai-empty"><BookOpen size={26}/><p>從一個研究問題開始，查找可追溯的論文來源。</p><small>書院提供即時書目引用及 VANILLA Evidence 書目可追溯評級；全文模型訓練仍為獨立流程。</small></div>}
   {results.length>0&&<ol className="xiahai-list">{results.map((paper,index)=><EvidenceCard key={paper.source_id} paper={paper} index={index}/>)}</ol>}
  </section>
  <footer className="xiahai-footer">霞海書院 · 論文來源索引　｜　來源可追溯，知識不設門第。</footer>
 </div>;
}
