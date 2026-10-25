import {useState} from "react";
import {BookMarked,Copy,ExternalLink,UserRound,ChevronDown,ChevronUp} from "lucide-react";
import type {AcademicHit} from "../search/scholarly-discovery";
import {authorIdentityAdjustment,authorReferenceLinks,fetchEvidenceAuthorRecord,type AuthorRecord,type EvidenceAuthor} from "../search/vanilla-evidence";

export function citationText(paper:AcademicHit):string{
 const id=paper.evidence.id;
 return "引自霞海書院 VANILLA Evidence｜"+id+"\n"+
  paper.title+"\n原始來源："+paper.provider+"\n"+
  (paper.doi?"DOI: "+paper.doi+"\n":"")+
  "原始研究："+paper.url+"\n作者："+paper.authors.map(a=>a.name).join("、")+
  "\nEvidence "+paper.evidence.score+"/100（"+paper.evidence.verification+"，僅書目來源可追溯性）"+
  "\n引用權重 "+paper.citation_weight+"/5（不同於證據評級）";
}
export function effectiveEvidenceScore(paper:AcademicHit,remote?:AuthorRecord):number{
 if(!remote||!paper.authors.length)return paper.evidence.score;
 const first=paper.authors[0],signals=authorIdentityAdjustment(first,remote);
 return Math.min(80,Math.max(0,paper.evidence.score-
  paper.evidence.breakdown.author_identity-paper.evidence.breakdown.author_footprint+
  signals.identity+signals.footprint));
}
function AuthorDetails({author,onResolved}:{author:EvidenceAuthor;onResolved:(record:AuthorRecord)=>void}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [record,setRecord]=useState<AuthorRecord|null>(null);
 const [events,setEvents]=useState<Array<{title:string;url:string;year:number}>>([]);
 const urls=authorReferenceLinks(author);
 async function resolve(){
  if(busy||record)return;
  setBusy(true);setError("");
  try{
   const live=await fetchEvidenceAuthorRecord(author);
   setRecord(live);onResolved(live);
   const id=author.id.match(/A\d+$/)?.[0];
   if(id){
    try{
     const url=new URL("https://api.openalex.org/works");
     url.searchParams.set("filter","author.id:"+id);
     url.searchParams.set("sort","publication_date:desc");
     url.searchParams.set("per_page","3");
     url.searchParams.set("select","id,title,publication_year");
     const response=await fetch(url,{credentials:"omit",signal:AbortSignal.timeout(8500)});
     if(response.ok){
      const body=await response.text();if(body.length>150000)throw Error("TOO_LARGE");
      const hits=JSON.parse(body) as {results?:Array<{id?:string;title?:string;publication_year?:number}>};
      setEvents((hits.results||[]).filter(x=>/^https:\/\/openalex\.org\/W\d+$/.test(x.id||"")).slice(0,3).map(x=>({
       title:String(x.title||"").slice(0,130),url:x.id||"",year:Number(x.publication_year)||0
      })));
     }
    }catch{/* Research history optional; do not fabricate an event on failure. */}
   }
  }catch(e){setError("作者資料無法驗證："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 return <div className="xiahai-author-pop" aria-label={author.name+" 作者來源檔案"}>
  <div className="xiahai-author-profile"><UserRound size={19}/><div><strong>{author.name}</strong><small>{author.id}</small></div></div>
  <p>此檔案與論文作者的 OpenAlex ID 綁定。新聞或 Wikipedia 搜尋可能出現同名人物，必須核對身份，不把未證實指控直接計入評級。</p>
  <div className="xiahai-author-links">
   <a href={urls.openalex} target="_blank" rel="noopener noreferrer">OpenAlex 個人學術頁 ↗</a>
   {urls.orcid&&<a href={urls.orcid} target="_blank" rel="noopener noreferrer">ORCID 個人頁 ↗</a>}
   <a href={urls.wikipedia} target="_blank" rel="noopener noreferrer">Wikipedia 人物搜尋 ↗</a>
   <a href={urls.news} target="_blank" rel="noopener noreferrer">新聞與事件搜尋 ↗</a>
   <a href={urls.personal_search} target="_blank" rel="noopener noreferrer">個人官網搜尋 ↗</a>
  </div>
  <button type="button" className="xiahai-author-refresh" onClick={()=>void resolve()} disabled={busy||Boolean(record)}>
   {busy?"核對作者中…":record?"已核對 OpenAlex 作者":"核對作者資料並更新身分評分"}
  </button>
  {record&&<p>同一個 OpenAlex 作者 ID · 研究紀錄 {Number(record.works_count)||0} 篇；引用次數 {Number(record.cited_by_count)||0}。這些是公開學術活動指標，非品行或論文真確性的證明。</p>}
  {events.length>0&&<div className="xiahai-author-events"><strong>近期研究發表紀錄（不是新聞或爭議事件）</strong>
   <ol>{events.map(e=><li key={e.url}><a href={e.url} target="_blank" rel="noopener noreferrer">{e.year||"年份未提供"} · {e.title}</a></li>)}</ol>
  </div>}
  {error&&<p role="status">{error}</p>}
 </div>;
}
export default function EvidenceCard({paper,index}:{paper:AcademicHit;index:number}){
 const [activeAuthor,setActiveAuthor]=useState<string|null>(null);
 const [remote,setRemote]=useState<AuthorRecord|null>(null);
 const [copied,setCopied]=useState(false);
 const score=effectiveEvidenceScore(paper,remote||undefined);
 const label=paper.evidence.verification==="retracted"?"R":
  score>=70?"A":score>=55?"B":score>=35?"C":"D";
 async function copy(){
  try{await navigator.clipboard.writeText(citationText(paper));setCopied(true);}
  catch{setCopied(false);}
 }
 return <li className="xiahai-paper xiahai-evidence-card">
  <div className="xiahai-paper-head">
   <span className="xiahai-index">{String(index+1).padStart(3,"0")}</span>
   <span className="xiahai-provider">{paper.provider}</span>
   <span className="xiahai-weight">引用權重 {paper.citation_weight}/5</span>
  </div>
  <div className="xiahai-evidence-score-row">
   <div className="xiahai-evidence-identity"><BookMarked size={17}/><code>{paper.evidence.id}</code></div>
   <div className="xiahai-evidence-number"><strong>{score}<small>/100</small></strong><span>Evidence {label} · 書目可追溯</span></div>
  </div>
  <h3>{paper.title}</h3>
  <p>{paper.snippet}</p>
  <div className="xiahai-paper-authors">
   <strong>作者</strong>
   {paper.authors.length?paper.authors.slice(0,8).map(a=><button key={a.id} type="button"
      onClick={()=>{setActiveAuthor(v=>v===a.id?null:a.id);setRemote(null);}}
      aria-expanded={activeAuthor===a.id}>{a.name}{activeAuthor===a.id?<ChevronUp size={12}/>:<ChevronDown size={12}/>}</button>)
      :<span>OpenAlex 尚未提供可核實的作者 ID</span>}
   {paper.authors.length>8&&<span>等 {paper.authors.length} 位</span>}
  </div>
  {activeAuthor&&paper.authors.some(a=>a.id===activeAuthor)&&<AuthorDetails key={activeAuthor}
    author={paper.authors.find(a=>a.id===activeAuthor)!}
    onResolved={record=>{if(activeAuthor===paper.authors[0]?.id)setRemote(record);}}/>}
  <details className="xiahai-evidence-breakdown">
   <summary>證據評級細項與來源限制</summary>
   <div>來源可追溯 {paper.evidence.breakdown.provenance}/30 · 書目完整性 {paper.evidence.breakdown.record_integrity}/25 · 作者識別 {remote?authorIdentityAdjustment(paper.authors[0],remote).identity:paper.evidence.breakdown.author_identity}/13 · 作者研究紀錄 {remote?authorIdentityAdjustment(paper.authors[0],remote).footprint:paper.evidence.breakdown.author_footprint}/3</div>
   <p>{paper.evidence.reasons.join("；")}。未做全文方法學評讀、重現實驗或獨立同儕品質評估，因此這不是「論文正確率」。</p>
  </details>
  {paper.doi&&<div className="xiahai-doi">DOI · {paper.doi}</div>}
  <div className="xiahai-actions">
   <a href={paper.url} target="_blank" rel="noopener noreferrer">原始論文來源 <ExternalLink size={14}/></a>
   <a href={paper.source_id} target="_blank" rel="noopener noreferrer">OpenAlex 紀錄 <ExternalLink size={14}/></a>
   <button type="button" onClick={()=>void copy()}><Copy size={14}/>{copied?"已複製 VANILLA Evidence":"複製 VANILLA Evidence"}</button>
  </div>
 </li>;
}
