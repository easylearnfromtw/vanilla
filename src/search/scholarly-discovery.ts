/** Public OpenAlex academic discovery (metadata only; NO full-text training).
 * arXiv records can be surfaced from verified OpenAlex locations.
 * Never insert a private API key into the public browser bundle.
 */
import {scholarlyCitationPriority,type RankTable,type Institution,type Authority} from "./scholarly-priority.ts";
const RANK_KEY="vanilla.scholarly.qs2027.rankings.v1";
const AUTH_KEY="vanilla.scholarly.nonuniversity.authorities.v1";
export type AcademicHit={title:string;url:string;snippet:string;provider:"OpenAlex"|"arXiv";citation_weight:number;source_id:string;doi?:string};
export function isScholarlyQuery(query:string):boolean{
 return /(?:論文|學術|期刊|文獻|研究證據|研究報告|實證研究|預印本|arxiv|openalex|systematic review|meta.analysis|randomized controlled trial|peer.reviewed|scholarly|academic papers?|research papers?|literature review|doi:10\.)/i.test(query);
}
function normROR(value:unknown):string{
 const id=String(value||"").trim().toLowerCase().replace(/^https:\/\/ror\.org\//,"");
 return /^0[a-z0-9]{8}$/.test(id)?"ror:"+id:"";
}
function normOpenAlex(value:unknown):string{
 const id=String(value||"").trim().match(/(?:^|\/)(I\d+)$/i)?.[1]?.toUpperCase();
 return id?"openalex:"+id:"";
}
export function parseScholarlyRankCsv(csv:string):RankTable{
 if(csv.length>350000)throw Error("排名檔案過大");
 const rows=csv.replace(/^\uFEFF/,"").trim().split(/\r?\n/).filter(Boolean);
 if(rows.length<2||rows.length>2500)throw Error("排名資料需有標題列及最多 2,499 筆機構");
 const keys=rows[0].split(",").map(x=>x.trim().toLowerCase());
 const rankIdx=keys.indexOf("rank"),rorIdx=keys.indexOf("ror"),alexIdx=keys.indexOf("openalex_id");
 if(rankIdx<0||(rorIdx<0&&alexIdx<0))throw Error("CSV 需要 rank 與 ror 或 openalex_id 欄位");
 const output:RankTable={};
 for(const line of rows.slice(1)){
  const cells=line.split(",").map(x=>x.trim().replace(/^"(.*)"$/,"$1"));
  const rank=Number(cells[rankIdx]);
  if(!Number.isInteger(rank)||rank<1||rank>100000)throw Error("大學名次必須是明確正整數，並且不能使用並列範圍");
  const ids=[rorIdx>=0?normROR(cells[rorIdx]):"",alexIdx>=0?normOpenAlex(cells[alexIdx]):""].filter(Boolean);
  if(ids.length===0)throw Error("排名資料含有缺失或不合法的機構識別碼");
  for(const id of ids){
   if(Object.prototype.hasOwnProperty.call(output,id)&&output[id]!==rank)throw Error("同一機構出現衝突名次："+id);
   output[id]=rank;
  }
 }
 return output;
}
export function saveScholarlyRankCsv(csv:string):number{
 const table=parseScholarlyRankCsv(csv);
 localStorage.setItem(RANK_KEY,JSON.stringify(table));
 return Object.keys(table).length;
}
export function getScholarlyRankTable():RankTable{
 try{
  const raw=localStorage.getItem(RANK_KEY);
  if(!raw||raw.length>350000)return {};
  const parsed=JSON.parse(raw) as unknown;
  if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")return {};
  const out:RankTable={};
  for(const [key,value] of Object.entries(parsed)){
   if((/^ror:0[a-z0-9]{8}$/.test(key)||/^openalex:I\d+$/.test(key))&&
      typeof value==="number"&&Number.isInteger(value)&&value>=1&&value<=100000)out[key]=value;
  }
  return out;
 }catch{return {};}
}
function cleanAuthority(entry:unknown):Authority|null{
 if(!entry||typeof entry!=="object")return null;
 const row=entry as Record<string,unknown>;
 const match_id=String(row.match_id||"").trim();
 const category=row.category;
 const evidence_url=String(row.evidence_url||"").trim();
 const reviewer=String(row.reviewer||"").trim();
 if(match_id.length>130||!(/^(?:doi:10\\.\\d{4,9}\\/\\S+|arxiv:\\d{4}\\.\\d{4,5}|openalex:w\\d+|orcid:\\d{4}-\\d{4}-\\d{4}-[\\dx]{4})$/i).test(match_id)||
  !["industry_leader","authoritative_expert","established_theory"].includes(String(category))||
  row.verified!==true||!reviewer||reviewer.length>150)return null;
 try{const u=new URL(evidence_url);if(u.protocol!=="https:"||!u.hostname.includes(".")||u.username||u.password)return null;}catch{return null;}
 return {match_id,category:category as Authority["category"],evidence_url,reviewer,verified:true};
}
export function saveScholarlyAuthorityLedger(jsonl:string):number{
 if(jsonl.length>350000)throw Error("權威審核名冊過大");
 const rows=jsonl.trim().split(/\\r?\\n/).filter(Boolean);
 if(!rows.length||rows.length>1000)throw Error("權威名冊需有 1–1000 筆審核紀錄");
 const valid=rows.map(line=>{let record:unknown;try{record=JSON.parse(line);}catch{throw Error("權威名冊需要 JSONL 格式");}
  const value=cleanAuthority(record);if(!value)throw Error("名冊有未驗證、未具依據或身份識別碼不合格的紀錄");return value;});
 localStorage.setItem(AUTH_KEY,JSON.stringify(valid));
 return valid.length;
}
export function getScholarlyAuthorityLedger():Authority[]{
 try{const s=localStorage.getItem(AUTH_KEY);if(!s||s.length>350000)return [];
  const rows=JSON.parse(s) as unknown;if(!Array.isArray(rows))return [];
  return rows.slice(0,1000).flatMap(x=>{const entry=cleanAuthority(x);return entry?[entry]:[]});
 }catch{return [];}
}
type OpenAlexWork={
 id?:unknown;doi?:unknown;title?:unknown;publication_year?:unknown;is_retracted?:boolean;
 authorships?:Array<{institutions?:Institution[];author?:{orcid?:string}}>;
 locations?:Array<{landing_page_url?:string;pdf_url?:string;source?:{display_name?:string}}>;
};
const safe=(v:unknown,max=180)=>String(v||"").replace(/<[^>]*>/g," ").replace(/[\x00-\x1F]/g," ").trim().slice(0,max);
function validDOI(value:unknown):string{
 const doi=String(value||"").replace(/^https:\/\/doi\.org\//i,"");
 return /^10\.\d{4,9}\/[a-z0-9._;()/:+\-]+$/i.test(doi)?doi:"";
}
function arxivURL(work:OpenAlexWork):string{
 for(const loc of work.locations||[]){
  const candidate=loc.landing_page_url||loc.pdf_url||"";
  const match=candidate.match(/^https?:\/\/(?:export\.)?arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/i);
  if(match)return "https://arxiv.org/abs/"+match[1];
 }
 return "";
}
export function parseOpenAlexHits(input:unknown,ranks:RankTable={}):AcademicHit[]{
 if(!input||typeof input!=="object"||!Array.isArray((input as {results?:unknown}).results))throw Error("OpenAlex 回應格式錯誤");
 const works=(input as {results:OpenAlexWork[]}).results;
 const out:AcademicHit[]=[],seen=new Set<string>();
 for(const work of works.slice(0,12)){
  const id=String(work.id||"");
  if(!/^https:\/\/openalex\.org\/W\d+$/.test(id)||work.is_retracted===true||!String(work.title||"").trim())continue;
  const doi=validDOI(work.doi),arxiv=arxivURL(work);
  const key=doi?"doi:"+doi.toLowerCase():arxiv||id;
  if(seen.has(key))continue;seen.add(key);
  const institutes=(work.authorships||[]).flatMap(a=>a.institutions||[]);
  const orcids=(work.authorships||[]).map(a=>a.author?.orcid).filter((x):x is string=>typeof x==="string");
  const priority=scholarlyCitationPriority({doi,openalex_id:id,arxiv_id:arxiv?arxiv.replace("https://arxiv.org/abs/","arxiv:"):undefined,author_orcids:orcids,institutions:institutes},ranks,getScholarlyAuthorityLedger());
  const yr=Number(work.publication_year);
  const year=Number.isInteger(yr)&&yr>1700&&yr<2200?String(yr):"年份未提供";
  const schools=institutes.map(x=>safe(x.display_name,50)).filter(Boolean).slice(0,2).join("、");
  const label=priority.citation_basis==="university-ranking"?
   "引用權重 "+priority.citation_weight+"／5（依匯入 QS-2027 排名）":
   "引用權重 1／5（機構排名或權威資格尚未核實）";
  const mode=arxiv?"arXiv 預印本線索（審查狀態未核實）":"OpenAlex 論文中繼資料（未讀取全文）";
  out.push({title:safe(work.title,160),url:arxiv||(doi?"https://doi.org/"+doi:id),
    snippet:[mode,year,schools,label].filter(Boolean).join(" · ").slice(0,480),
    provider:arxiv?"arXiv":"OpenAlex",citation_weight:priority.citation_weight,source_id:id,...(doi?{doi}:{})});
 }
 return out.sort((a,b)=>b.citation_weight-a.citation_weight);
}
export async function searchOpenAlexWorks(query:string):Promise<AcademicHit[]>{
 const q=query.trim().slice(0,180);
 if(q.length<2)throw Error("論文搜尋至少需要兩個字");
 const u=new URL("https://api.openalex.org/works");
 u.searchParams.set("search",q);
 u.searchParams.set("per_page","8");
 u.searchParams.set("select","id,doi,title,publication_year,authorships,locations,is_retracted");
 const response=await fetch(u.toString(),{mode:"cors",credentials:"omit",
  headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error("OpenAlex HTTP "+response.status);
 const len=Number(response.headers.get("content-length")||"0");
 if(len>1500000)throw Error("OpenAlex 回應過大");
 const raw=await response.text();
 if(raw.length>1500000)throw Error("OpenAlex 回應過大");
 return parseOpenAlexHits(JSON.parse(raw),getScholarlyRankTable());
}
