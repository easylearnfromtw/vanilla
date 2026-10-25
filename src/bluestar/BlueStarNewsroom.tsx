import {useEffect,useRef,useState,type FormEvent} from "react";
import {ArrowUpRight,Archive,BookOpen,Globe2,Newspaper,RefreshCw,Search,ShieldCheck} from "lucide-react";
import {
 NEWS_MARKETS,NEWS_TOPICS,fetchLiveNews,parseArchiveSnapshot,
 type ArchiveSnapshot,type NewsItem,type NewsMarket,type NewsTopic
} from "./news-source";
import "./bluestar.css";

type Mode="live"|"archive";
function timestamp(date:string):string{
 if(!date)return "時間未提供";
 const d=new Date(date);
 return Number.isNaN(d.getTime())?"時間未提供":d.toLocaleString("zh-TW",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Taipei"});
}
function NewsCard({article}:{article:NewsItem}){
 return <article className="bluestar-story">
   <div className="bluestar-story-rule"><span>{NEWS_MARKETS.find(c=>c.id===article.market)?.name||article.market}</span>
    <span>{article.kind==="live"?"來源收錄時間":"原始刊出日期"} · {timestamp(article.detectedAt)}</span></div>
   <h3><a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}<ArrowUpRight size={16} aria-hidden="true"/></a></h3>
   <div className="bluestar-story-footer"><span>原始媒體：{article.source}</span>
     {article.language&&<span>語言：{article.language}</span>}
     <span>僅有標題及來源索引</span></div>
 </article>;
}
export default function BlueStarNewsroom(){
 const [mode,setMode]=useState<Mode>("live");
 const [market,setMarket]=useState<NewsMarket>("TW");
 const [topic,setTopic]=useState<NewsTopic>("general");
 const [keyword,setKeyword]=useState("");
 const [submitted,setSubmitted]=useState("");
 const [nonce,setNonce]=useState(0);
 const [news,setNews]=useState<NewsItem[]>([]);
 const [snapshot,setSnapshot]=useState<ArchiveSnapshot|null>(null);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState("");
 const [page,setPage]=useState(1);
 const requestId=useRef(0);
 useEffect(()=>{
  const number=++requestId.current;
  const ctrl=new AbortController();
  setLoading(true);setMessage("");setNews([]);setPage(1);
  if(mode==="live"){
   void fetchLiveNews(market,topic,submitted,ctrl.signal).then(rows=>{
    if(number!==requestId.current)return;
    setNews(rows);
    if(!rows.length)setMessage("這個條件暫時沒有可核實的新聞，請更換市場、主題或關鍵字。");
   }).catch(e=>{
    if(ctrl.signal.aborted||number!==requestId.current)return;
    setMessage((e instanceof Error?e.message:"新聞資料取得失敗")+"；可稍後重試，或前往 GDELT 官方網站查詢。");
   }).finally(()=>{if(number===requestId.current)setLoading(false);});
  }else{
   // Same-origin public snapshot: metadata only, never embeds licensed full text.
   void fetch(import.meta.env.BASE_URL+"bluestar/archive.json",{signal:ctrl.signal,headers:{Accept:"application/json"}}).then(async response=>{
    if(!response.ok)throw Error("歷史索引尚未發佈（HTTP "+response.status+"）");
    return parseArchiveSnapshot(await response.json());
   }).then(data=>{
    if(number!==requestId.current)return;
    setSnapshot(data);
    setNews(data.articles.filter(row=>row.market===market));
   }).catch(e=>{
    if(ctrl.signal.aborted||number!==requestId.current)return;
    setSnapshot(null);setMessage(e instanceof Error?e.message:"歷史索引讀取失敗");
   }).finally(()=>{if(number===requestId.current)setLoading(false);});
  }
  return()=>{ctrl.abort();};
 },[mode,market,topic,submitted,nonce]);
 function search(e:FormEvent<HTMLFormElement>){e.preventDefault();setSubmitted(keyword.trim());setNonce(n=>n+1);}
 const filteredNews=mode==="archive"?(snapshot?.articles.filter(row=>row.market===market)??[]):news;
 const shown=filteredNews.slice(0,page*12);
 return <div className="bluestar">
  <div className="bluestar-inner">
   <header className="bluestar-masthead">
    <div className="bluestar-stamp"><Globe2 size={18}/><span>VANILLA / GLOBAL NEWS ARCHIVE</span><span>EST. 2026</span></div>
    <div className="bluestar-heading"><div className="bluestar-orbit" aria-hidden="true">✶</div><h1>藍星報社</h1><p>BLUE STAR PRESS</p></div>
    <p className="bluestar-deck">以世界為版面，以來源為準繩。收錄五國新聞線索，保留原始媒體、日期與事件脈絡。</p>
   </header>
   <div className="bluestar-mode" role="group" aria-label="新聞檢視模式">
    <button type="button" className={mode==="live"?"selected":""} aria-pressed={mode==="live"} onClick={()=>setMode("live")}><Newspaper size={17}/> 最新新聞</button>
    <button type="button" className={mode==="archive"?"selected":""} aria-pressed={mode==="archive"} onClick={()=>setMode("archive")}><Archive size={17}/> 20 年歷史檔案</button>
   </div>
   <section className="bluestar-toolbar" aria-label="新聞篩選">
    <div className="bluestar-markets" role="group" aria-label="原始媒體所在地">
     {NEWS_MARKETS.map(c=><button type="button" aria-pressed={market===c.id} className={market===c.id?"selected":""} key={c.id} onClick={()=>setMarket(c.id)}>{c.name}</button>)}
    </div>
    {mode==="live"&&<div className="bluestar-filters">
     <div className="bluestar-topics" role="group" aria-label="新聞主題">{NEWS_TOPICS.map(t=><button type="button" aria-pressed={topic===t.id} key={t.id} className={topic===t.id?"selected":""} onClick={()=>{setTopic(t.id);setSubmitted("");setKeyword("");}}>{t.name}</button>)}</div>
     <form className="bluestar-search" role="search" onSubmit={search}>
      <Search size={17} aria-hidden="true"/><label className="sr-only" htmlFor="bluestar-keyword">新聞關鍵字</label>
      <input id="bluestar-keyword" value={keyword} maxLength={90} onChange={e=>setKeyword(e.target.value)} placeholder="輸入新聞關鍵字（建議英文）"/>
      <button type="submit">搜尋</button>
     </form></div>}
   </section>
   <section className="bluestar-results" aria-live="polite" aria-label="新聞結果">
    <div className="bluestar-results-header">
     <div><span className="bluestar-overline">{mode==="live"?"LIVE MEDIA MONITOR":"HISTORICAL INDEX"}</span>
      <h2>{mode==="live"?"國際新聞觀測":"新聞史料索引"}</h2>
     </div>
     <button type="button" className="bluestar-refresh" disabled={loading} onClick={()=>setNonce(n=>n+1)}><RefreshCw size={15}/> {loading?"讀取中":"重新整理"}</button>
    </div>
    {mode==="live"?<p className="bluestar-explain">即時向 GDELT 查詢最近一週各地媒體報導。來源國指媒體所在地，不一定是新聞事件發生地；時間為 GDELT 收錄時間，不代表原始發稿時間。</p>:
    <div className="bluestar-archive-stats"><div><span>目標</span><strong>20,000,000</strong><small>篇經授權全文 · 尚未達成</small></div>
      <div><span>已索引元資料</span><strong>{(snapshot?.totalIndexed??0).toLocaleString("en-US")}</strong><small>僅計已發佈的實際索引</small></div>
      <div><span>具審核條件的全文</span><strong>{(snapshot?.totalApproved??0).toLocaleString("en-US")}</strong><small>不等於已進行模型訓練</small></div></div>}
    {loading&&<p className="bluestar-notice" role="status">正在讀取可追溯的新聞來源…</p>}
    {!loading&&message&&<div className="bluestar-notice" role="status">{message}</div>}
    {!loading&&!message&&filteredNews.length===0&&<div className="bluestar-empty"><BookOpen size={27}/>
     <p>{mode==="archive"?"目前尚無已發佈的歷史新聞，待匯入經驗證的資料後才會顯示。":"目前沒有符合條件的新聞來源紀錄。"}</p>
    </div>}
    {shown.length>0&&<><div className="bluestar-grid">{shown.map(story=><NewsCard key={story.id} article={story}/>)}</div>
     {shown.length<filteredNews.length&&<button type="button" className="bluestar-more" onClick={()=>setPage(n=>n+1)}>顯示更多新聞（尚有 {filteredNews.length-shown.length} 筆）</button>}</>}
   </section>
   <footer className="bluestar-footer"><ShieldCheck size={18}/>
    <p>藍星報社是來源索引，不是原新聞出版者。新聞標題、來源與外部原文連結可供查證；除非逐篇取得合法授權，本站不儲存、轉載新聞全文，也不將搜尋結果自動算入 OCTUBER 已訓練資料。歷史全文訓練與 GPU 權重更新另需實際執行與驗證。</p>
    <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">新聞線索：GDELT <ArrowUpRight size={14}/></a>
   </footer>
  </div>
 </div>;
}
