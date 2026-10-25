import {GraduationCap} from "lucide-react";
import {validSourceUrl} from "../knowledge/evidence";
type Paper={paper_id:string;title:string;authors:string[];year?:number;doi?:string;source_url:string;publisher?:string;priority:number};
export function parsePaperRefs(text:string):Paper[]|null{
 if(text.length>80000)return null;
 let data:unknown;
 try{data=JSON.parse(text);}catch{return null;}
 if(!data||typeof data!=="object")return null;
 const obj=data as Record<string,unknown>;
 if(obj.protocol!=="xiahai-paperrefs-v1"||obj.origin!=="openalex-metadata-reviewed"||!Array.isArray(obj.papers))return null;
 const items:Paper[]=[];
 for(const raw of obj.papers.slice(0,8)){
  if(!raw||typeof raw!=="object")continue;
  const x=raw as Record<string,unknown>;
  const url=validSourceUrl(x.source_url);
  if(!url||typeof x.title!=="string"||!x.title||x.title.length>500||
     typeof x.paper_id!=="string"||!/^W[0-9]+$/.test(x.paper_id))continue;
  items.push({
   paper_id:x.paper_id,title:x.title,
   authors:Array.isArray(x.authors)?x.authors.filter(a=>typeof a==="string").slice(0,5):[],
   year:typeof x.year==="number"&&x.year>1800&&x.year<=2100?x.year:undefined,
   doi:validSourceUrl(x.doi)||undefined,source_url:url,
   publisher:typeof x.publisher==="string"?x.publisher.slice(0,150):undefined,
   priority:typeof x.priority==="number"&&x.priority>=1&&x.priority<=5?x.priority:1,
  });
 }
 return items.length?items:null;
}
export default function PaperCitationCards({papers}:{papers:Paper[]}){
 return <section className="atuber-book-citations" aria-label="引用自霞海書院的學術來源">
  <h4><GraduationCap size={17} style={{verticalAlign:"middle",marginRight:7}}/>引用自霞海書院</h4>
  <p>霞海書院負責索引來源，不是原論文出版者。本卡片只經元資料格式檢核，請核對 DOI、原始論文與研究方法；未取得全文不能據此宣稱經驗證的結論。</p>
  <div className="atuber-book-grid">{papers.map(p=><article className="atuber-book-card" key={p.paper_id}>
   <div className="atuber-book-detail">
    <strong className="atuber-book-title">{p.title}</strong>
    <div className="atuber-book-author">{p.authors.join("、")||"作者待核對"} {p.year?"· "+p.year:""}</div>
    <small>原始出版／索引：{p.publisher||"OpenAlex"} · 文獻優先權重 {p.priority}/5</small>
    <div className="atuber-book-links"><a href={p.doi||p.source_url} target="_blank" rel="noopener noreferrer">查看 DOI／原始來源</a></div>
   </div>
  </article>)}</div>
  <small>深入研究與來源檢索：<a href="?archive=xiahai">霞海書院</a>。高排名機構不代表每篇研究都可靠。</small>
 </section>;
}
