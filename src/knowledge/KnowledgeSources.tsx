import {useEffect,useRef,useState,type FormEvent} from "react";
import {BookOpen,LibraryBig,GraduationCap,ExternalLink,Search,ShieldCheck,BookMarked,Copy,Check,ArrowRight} from "lucide-react";
import {BRAND,BOOK_SEEDS,attribution,citationPriority,evidenceLabel,validSourceUrl,type SourceRecord} from "./evidence";
import "./knowledge.css";

type Mode="book"|"paper";
type OpenLibraryBook={key?:string;title?:string;author_name?:string[];first_publish_year?:number;isbn?:string[]};
type OpenAlexWork={id?:string;display_name?:string;publication_year?:number;doi?:string|null;open_access?:{is_oa?:boolean};
  abstract_inverted_index?:Record<string,number[]>|null;
  authorships?:Array<{author?:{display_name?:string};institutions?:Array<{display_name?:string}>}>;
  primary_location?:{landing_page_url?:string|null;source?:{display_name?:string}}};

function bookResults(json:unknown):SourceRecord[]{
 if(!json||typeof json!=="object")return [];
 const raw=(json as {docs?:OpenLibraryBook[]}).docs;
 if(!Array.isArray(raw))return [];
 return raw.slice(0,12).flatMap((x):SourceRecord[]=>{
  const url=typeof x.key==="string"&&/^\/works\/OL\d+W$/.test(x.key)?"https://openlibrary.org"+x.key:null;
  if(!url||!x.title)return [];
  const isbn=Array.isArray(x.isbn)?x.isbn.find(v=>/^(?:[0-9]{13}|[0-9]{9}[0-9X])$/.test(v)):undefined;
  return [{id:x.key!,kind:"book",title:x.title.slice(0,300),authors:Array.isArray(x.author_name)?x.author_name.slice(0,4):[],
    originalUrl:url,sourceName:"Open Library",year:Number.isInteger(x.first_publish_year)?x.first_publish_year:undefined,
    isbn,tier:"metadata",verified:true}];
 });
}
function paperResults(json:unknown):SourceRecord[]{
 if(!json||typeof json!=="object")return [];
 const data=(json as {results?:OpenAlexWork[]}).results;
 if(!Array.isArray(data))return [];
 return data.slice(0,12).flatMap((x):SourceRecord[]=>{
  const originalUrl=validSourceUrl(x.doi)||validSourceUrl(x.primary_location?.landing_page_url)||validSourceUrl(x.id);
  if(!originalUrl||typeof x.display_name!=="string"||!x.display_name.trim())return [];
  const authors=Array.isArray(x.authorships)?x.authorships.map(a=>a.author?.display_name||"").filter(Boolean).slice(0,6):[];
  const institutes=Array.isArray(x.authorships)?x.authorships.flatMap(a=>a.institutions||[]).map(a=>a.display_name).filter(Boolean):[];
  const hasAbstract=Boolean(x.abstract_inverted_index&&Object.keys(x.abstract_inverted_index).length);
  return [{
    id:typeof x.id==="string"?x.id:originalUrl,kind:"paper",title:x.display_name.slice(0,500),
    authors,originalUrl,sourceName:x.primary_location?.source?.display_name||"OpenAlex",
    year:x.publication_year,doi:validSourceUrl(x.doi)||undefined,openAccess:x.open_access?.is_oa===true,
    description:institutes.length?"機構（OpenAlex 作者資料）："+[...new Set(institutes)].slice(0,3).join("、"):undefined,
    tier:hasAbstract?"abstract":"metadata",verified:true,
    // Rankings are not present in OpenAlex works; never invent university top-100 membership.
    institutionRank:undefined
  }];
 });
}
function cover(isbn?:string){
 return isbn&&/^(?:[0-9]{13}|[0-9]{9}[0-9X])$/.test(isbn)?
   "https://covers.openlibrary.org/b/isbn/"+isbn+"-M.jpg?default=false":null;
}
function Result({source,mode}:{source:SourceRecord;mode:Mode}){
 const [missing,setMissing]=useState(false);
 const [copied,setCopied]=useState(false);
 const img=mode==="book"?cover(source.isbn):null;
 const priority=mode==="paper"?citationPriority(source.institutionRank,source.expertReviewed):null;
 return <article className="knowledge-entry">
  <div className="knowledge-entry-icon">
   {img&&!missing?<img src={img} alt={source.title+" 的 ISBN 封面"} loading="lazy" onError={()=>setMissing(true)}/>:mode==="book"?<BookMarked size={27}/>:<GraduationCap size={29}/>}
  </div>
  <div className="knowledge-entry-content">
   <div className="knowledge-tag">{mode==="book"?"柳岸書城 · 書籍來源":"霞海書院 · 研究論文"} <span>· {source.tier==="reviewed-fulltext"?"已建全文試點":source.tier==="abstract"?"有摘要索引":"僅元資料"}</span></div>
   <h3>{source.title}</h3>
   <div className="knowledge-entry-meta">{source.authors.join("、")||"作者待核對"}{source.year?" · "+source.year:""} · {source.sourceName}</div>
   {source.description&&<p className="knowledge-desc">{source.description}</p>}
   <p className="knowledge-evidence"><ShieldCheck size={14}/>{evidenceLabel(source.tier)}</p>
   {mode==="paper"&&<p className="knowledge-weight">引用優先權重 {priority}/5{!source.institutionRank?" · 大學排名未提供認證對照表，暫按預設權重 1":""} · {source.openAccess?"標示開放取用":"未確認開放取用"}</p>}
   <div className="knowledge-entry-actions">
    <a href={source.originalUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/> 原始來源</a>
    <button type="button" onClick={()=>{void navigator.clipboard?.writeText(attribution(source)).then(()=>setCopied(true)).catch(()=>setCopied(false));}}>
      {copied?<Check size={14}/>:<Copy size={14}/>} {copied?"已複製":"複製引用"}
    </button>
   </div>
  </div>
 </article>;
}
const seedQueries={book:["行為經濟學","股票投資心理","哲學 倫理"],paper:["behavioral economics consumer decisions","risk communication finance","clinical decision making"]};
export default function KnowledgeSources({mode,onNavigate}:{mode:Mode;onNavigate:(next:"book"|"paper")=>void}){
 const [query,setQuery]=useState("");
 const [results,setResults]=useState<SourceRecord[]>(mode==="book"?BOOK_SEEDS:[]);
 const [searched,setSearched]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>{controller.current?.abort();setQuery("");setResults(mode==="book"?BOOK_SEEDS:[]);setSearched(false);setBusy(false);setError("");},[mode]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function search(q:string){
  if(!q.trim())return;
  controller.current?.abort();
  const ctrl=new AbortController();controller.current=ctrl;
  setBusy(true);setError("");setSearched(true);setResults([]);
  try{
   let data:unknown;
   if(mode==="book"){
    // User-triggered public discovery, never bulk harvest or an AI training license.
    const url="https://openlibrary.org/search.json?q="+encodeURIComponent(q.trim())+"&limit=12&fields=key,title,author_name,first_publish_year,isbn";
    const resp=await fetch(url,{signal:ctrl.signal,headers:{"Accept":"application/json"}});
    if(!resp.ok)throw Error("Open Library 暫時無法提供查詢（HTTP "+resp.status+"）");
    data=await resp.json();
    if(!ctrl.signal.aborted)setResults(bookResults(data));
   }else{
    const url="https://api.openalex.org/works?search.title_and_abstract="+encodeURIComponent(q.trim())+"&per_page=12&filter=type:article";
    const resp=await fetch(url,{signal:ctrl.signal,headers:{"Accept":"application/json"}});
    if(!resp.ok)throw Error("OpenAlex 查詢失敗（HTTP "+resp.status+"，可能需要 API Key 或達到額度）");
    data=await resp.json();
    if(!ctrl.signal.aborted)setResults(paperResults(data));
   }
  }catch(e){
   if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:"查詢失敗，請稍後重試");
  }finally{if(!ctrl.signal.aborted)setBusy(false);}
 }
 function submit(e:FormEvent){e.preventDefault();void search(query);}
 const isBook=mode==="book";
 return <div className={"knowledge-page "+(isBook?"knowledge-book":"knowledge-paper")}>
  <div className="knowledge-inner">
   <nav className="knowledge-switch" aria-label="知識索引分館">
     <button className={isBook?"active":""} type="button" aria-current={isBook?"page":undefined} onClick={()=>onNavigate("book")}><BookOpen size={16}/> 柳岸書城</button>
     <button className={!isBook?"active":""} type="button" aria-current={!isBook?"page":undefined} onClick={()=>onNavigate("paper")}><GraduationCap size={16}/> 霞海書院</button>
   </nav>
   <header className="knowledge-hero">
    <div className="knowledge-kicker">VANILLA · KNOWLEDGE ARCHIVE / {isBook?"BOOKS":"RESEARCH"}</div>
    <h1>{BRAND[mode]}</h1>
    <p className="knowledge-subheading">{isBook?"萬卷藏思，循書問理。":"循證求真，與學術對話。"}</p>
    <p className="knowledge-intro">{isBook?
      "專門索引書名、作者、版次與原始圖書來源。阿土伯用經審核的知識解釋原理，不整本轉貼電子書。":
      "以 OpenAlex／arXiv 等學術資料為研究入口，整理作者、發表年份、期刊與 DOI；有證據才能轉化成專業建議。"}
    </p>
   </header>
   <section className="knowledge-search-area">
    <form onSubmit={submit} role="search" className="knowledge-search">
     <Search size={20}/>
     <input aria-label={isBook?"搜尋柳岸書城":"搜尋霞海書院"} value={query} onChange={e=>setQuery(e.target.value)}
       maxLength={120} placeholder={isBook?"搜尋書名、作者、主題…":"搜尋論文主題、關鍵詞（可使用英文）…"}/>
     <button type="submit" disabled={busy||!query.trim()}>{busy?"搜尋中":"搜尋來源"}</button>
    </form>
    <div className="knowledge-chips">{seedQueries[mode].map(q=><button type="button" key={q} onClick={()=>{setQuery(q);void search(q);}}>{q}</button>)}</div>
    <p className="knowledge-provider">來源：{isBook?"Open Library 即時公共書目／已驗證古典書試點":"OpenAlex 即時論文元資料"}。即時搜尋不代表已取得全文或取得 AI 訓練授權。</p>
   </section>
   <section className="knowledge-records" aria-live="polite">
     <div className="knowledge-heading">
       <h2>{searched?"查詢結果":isBook?"已核對的全文試點":"研究資料索引"}</h2>
       <span>{results.length} 筆顯示結果</span>
     </div>
     {busy&&<p className="knowledge-message" role="status">正在向原始書目／研究資料服務查詢…</p>}
     {error&&<p className="knowledge-message knowledge-error" role="alert">{error}。你仍可從 <a href={isBook?"https://openlibrary.org/search":"https://openalex.org/works"} target="_blank" rel="noopener noreferrer">來源網站</a>直接搜尋。</p>}
     {!busy&&!error&&results.length===0&&<p className="knowledge-message">{searched?"這次未取得可核對的來源，沒有生成虛構書目。":"輸入一個研究主題，開始查詢最新公開學術索引。"}</p>}
     <div className="knowledge-results">{results.map(s=><Result source={s} mode={mode} key={s.id}/>)}</div>
   </section>
   <footer className="knowledge-footer">
    <div className="knowledge-footer-mark"><LibraryBig size={22}/><strong>知識用於理解，不用於冒充權威。</strong></div>
    <p>顯示「引用自{BRAND[mode]}」代表由本索引整理來源，並不表示原書、論文由本館出版。每筆均保留作者與外部原始出處。關聯排序與學術機構權重不等於研究品質判定；專業建議應考量方法、時效、個人適用性及相反證據。</p>
    <a href={isBook?"https://www.gutenberg.org/":"https://www.arxiv.org/"} target="_blank" rel="noopener noreferrer">{isBook?"探索可合法取用的古典作品":"探索 arXiv 公開研究"} <ArrowRight size={14}/></a>
   </footer>
  </div>
 </div>;
}
