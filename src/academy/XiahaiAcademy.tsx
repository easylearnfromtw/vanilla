import {useRef,useState,type FormEvent} from "react";
import {ArrowUpRight,BookOpen,LibraryBig,Search,ShieldCheck} from "lucide-react";
import EvidenceCard from "./EvidenceCard";
import {retrieveXiahaiEvidence,type Hit} from "./xiahai-evidence";
import {getScholarlyRankTable,getScholarlyAuthorityLedger,searchOpenAlexWorks,type AcademicHit} from "../search/scholarly-discovery";
import "./xiahai-academy.css";

export default function XiahaiAcademy(){
 const [query,setQuery]=useState("");
 const [submitted,setSubmitted]=useState("");
 const [results,setResults]=useState<AcademicHit[]>([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [batchSize,setBatchSize]=useState<8|100>(8);
 const [researchMode,setResearchMode]=useState<"metadata"|"body">("body");
 const [evidenceHits,setEvidenceHits]=useState<Hit[]>([]);
 const current=useRef(0);
 const rankingCount=Object.keys(getScholarlyRankTable()).length;
 const authorityCount=getScholarlyAuthorityLedger().length;
 async function search(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const text=query.trim();
  if(text.length<2){setMessage("請輸入至少兩個字的論文名稱、主題或 DOI。");return;}
  const serial=++current.current;
  setBusy(true);setMessage("");setSubmitted("");setResults([]);setEvidenceHits([]);
  try{
   if(researchMode==="body"){
    const hits=await retrieveXiahaiEvidence(text);
    if(serial!==current.current)return;
    setEvidenceHits(hits);setSubmitted(text);
    if(!hits.length)setMessage("這 1,000 篇的精簡原文證據尚未找到對應節錄。建議改用英文研究關鍵字，不會推測論文結論。");
    return;
   }
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
    <span>證據來源</span>
    <button type="button" className={researchMode==="body"?"selected":""} onClick={()=>setResearchMode("body")}>1,000 篇原文節錄</button>
    <button type="button" className={researchMode==="metadata"?"selected":""} onClick={()=>setResearchMode("metadata")}>OpenAlex 即時書目</button>
   </div>
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
   <p className="xiahai-note">{researchMode==="body"?
    "全文模式只向本站請求固定的 1,000 篇論文短節錄；原文片段可追溯，但尚未做臨床證據評讀，也不會公開整篇原文。":
    "即時書目模式才會將關鍵字傳送給 OpenAlex；書目檢索不代表下載或閱讀論文全文。"}</p>
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
   <div className="xiahai-section-title"><LibraryBig size={18}/><h2>{researchMode==="body"?"原文證據":"學術書目"}</h2>{submitted&&<span>「{submitted}」 · {researchMode==="body"?evidenceHits.length:results.length} 筆</span>}</div>
   {message&&<p className="xiahai-feedback" role="status">{message}</p>}
   {!busy&&!submitted&&!message&&<div className="xiahai-empty"><BookOpen size={26}/><p>從一個研究問題開始，查找可追溯的論文來源。</p><small>書院提供即時書目引用及 VANILLA Evidence 書目可追溯評級；全文模型訓練仍為獨立流程。</small></div>}
   {evidenceHits.length>0&&<ol className="xiahai-list">{evidenceHits.map(({paper,passages},index)=>
     <li key={paper.id} className="xiahai-paper">
      <div className="xiahai-paper-head"><span className="xiahai-index">{String(index+1).padStart(3,"0")}</span><span className="xiahai-provider">PMC · 已核對正文</span></div>
      <h3>{paper.title}</h3>
      <p>作者：{paper.authors.join("、")}　{paper.year||""}</p>
      <p className="xiahai-muted">DOI：{paper.doi||"來源未提供"}　|　節錄段落：{passages.length} 段</p>
      <blockquote><p>{passages[0].excerpt}</p></blockquote>
      <p className="xiahai-muted">原文段落：{passages[0].chunk_id} · SHA256：{passages[0].chunk_sha256.slice(0,16)}…</p>
      <div className="xiahai-actions"><a href={paper.source_url} target="_blank" rel="noopener noreferrer">原始全文 <ArrowUpRight size={14}/></a><a href={paper.license_url} target="_blank" rel="noopener noreferrer">授權：{paper.license} <ArrowUpRight size={14}/></a></div>
     </li>)}</ol>}
   {results.length>0&&<ol className="xiahai-list">{results.map((paper,index)=><EvidenceCard key={paper.source_id} paper={paper} index={index}/>)}</ol>}
  </section>
  <footer className="xiahai-footer">霞海書院 · 論文來源索引　｜　來源可追溯，知識不設門第。</footer>
 </div>;
}
