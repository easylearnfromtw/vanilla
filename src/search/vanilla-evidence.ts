/** VANILLA Evidence: versioned, explainable metadata provenance, not fact-checking.
 * Scores reflect source traceability and verifiable scholarly identity signals;
 * they do not measure experimental correctness or treat news allegations as guilt.
 */
export const EVIDENCE_VERSION="VE-1.0";
export type EvidenceAuthor={
 id:string;name:string;orcid?:string;personal_url?:string;
};
export type EvidenceBreakdown={
 provenance:number;record_integrity:number;author_identity:number;author_footprint:number;
};
export type VanillaEvidence={
 id:string;version:string;score:number;level:"A"|"B"|"C"|"D"|"R";
 verification:"metadata-only"|"retracted";
 breakdown:EvidenceBreakdown;reasons:string[];
 source_id:string;source_url:string;authors:EvidenceAuthor[];
};
export type EvidenceInput={
 openalex_id:string;source_url:string;doi?:string;title:string;
 publication_year?:number;source_name?:string;work_type?:string;
 referenced_works_count?:number;is_retracted?:boolean;authors?:EvidenceAuthor[];
};
export type AuthorRecord={id?:string;display_name?:string;orcid?:string;works_count?:number;cited_by_count?:number;homepage?:string};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const cleanId=(value:string)=>value.match(/(?:^|\/)(A\d+)$/i)?.[1]?.toUpperCase()||"";
export function safeExternalAuthorLink(value:unknown):string|undefined{
 if(typeof value!=="string"||value.length>500)return undefined;
 try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||!u.hostname.includes("."))return undefined;return u.toString();}
 catch{return undefined;}
}
export function normalizeAuthor(raw:{id?:unknown;display_name?:unknown;orcid?:unknown}):EvidenceAuthor|null{
 const id=cleanId(String(raw.id||""));
 const name=String(raw.display_name||"").trim().slice(0,120);
 if(!id||name.length<2)return null;
 const orcid=String(raw.orcid||"").trim().match(/^https:\/\/orcid\.org\/(\d{4}-\d{4}-\d{4}-[\dx]{4})$/i)?.[0];
 return {id:"https://openalex.org/"+id,name,...(orcid?{orcid}:{})};
}
export function authorIdentityAdjustment(author:EvidenceAuthor,remote?:AuthorRecord){
 // ID and ORCID are strong *disambiguation* evidence, not proof of ethics.
 // Remote research footprint is a bounded signal and may never validate claims in news.
 const matching=remote&&cleanId(String(remote.id||""))===cleanId(author.id);
 const orcid=matching?String(remote.orcid||""):String(author.orcid||"");
 const validOrcid=/^https:\/\/orcid\.org\/\d{4}-\d{4}-\d{4}-[\dx]{4}$/i.test(orcid);
 const footprint=matching&&Number.isFinite(remote?.works_count)&&Number(remote?.works_count)>0?3:0;
 return {identity:8+(validOrcid?5:0),footprint,
  summary:matching?("OpenAlex 研究紀錄 "+Math.max(0,Number(remote?.works_count)||0)+" 篇；這是研究活動紀錄，不是人格或真確性評分。"):"未核對作者更多背景事件"};
}
export function evidenceScore(input:EvidenceInput,remoteAuthor?:AuthorRecord):VanillaEvidence{
 const work=input.openalex_id.match(/^https:\/\/openalex\.org\/(W\d+)$/);
 if(!work)throw Error("EVIDENCE_SOURCE_ID_INVALID");
 const id="VE-OA-"+work[1];
 const source_url=safeExternalAuthorLink(input.source_url)||"https://openalex.org/"+work[1];
 const authors=(input.authors||[]).filter(x=>Boolean(cleanId(x.id))).slice(0,20);
 const main=authors[0];
 const authorSignal=main?authorIdentityAdjustment(main,remoteAuthor):{identity:0,footprint:0,summary:"作者識別尚未核對"};
 const doi=/^10\.\d{4,9}\/\S+$/i.test(input.doi||"");
 const trace=(work?12:0)+(doi?12:0)+(input.source_name?6:0);
 const integrity=(input.title.trim().length>=6?10:0)+
  (Number.isInteger(input.publication_year)&&Number(input.publication_year)>1800?5:0)+
  (input.work_type?5:0)+(Number(input.referenced_works_count)>0?5:0);
 let score=clamp(trace+integrity+authorSignal.identity+authorSignal.footprint,0,80);
 if(input.is_retracted)score=0;
 const level:VanillaEvidence["level"]=input.is_retracted?"R":score>=70?"A":score>=55?"B":score>=35?"C":"D";
 return {id,version:EVIDENCE_VERSION,score,level,verification:input.is_retracted?"retracted":"metadata-only",
  breakdown:{provenance:trace,record_integrity:integrity,author_identity:authorSignal.identity,author_footprint:authorSignal.footprint},
  reasons:[input.is_retracted?"OpenAlex 已標示撤稿；不建議引用為有效證據":"中繼資料完整度與研究來源可追溯評級，不代表已核實研究結論",
    "作者檔案、ORCID 與作品記錄可影響身份可信度子分，最多 16 分",
    "Wikipedia 和新聞只供檢視；同名人物或未核實報導不自動影響分數",
    authorSignal.summary],
  source_id:input.openalex_id,source_url,authors};
}
export async function fetchEvidenceAuthorRecord(author:EvidenceAuthor):Promise<AuthorRecord>{
 const id=cleanId(author.id);if(!id)throw Error("AUTHOR_ID_INVALID");
 const url="https://api.openalex.org/authors/"+id+"?select=id,display_name,orcid,works_count,cited_by_count";
 const response=await fetch(url,{credentials:"omit",mode:"cors",headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error("OpenAlex 作者資料 HTTP "+response.status);
 const length=Number(response.headers.get("content-length")||0);if(length>100000)throw Error("作者資料過大");
 const raw=await response.text();if(raw.length>100000)throw Error("作者資料過大");
 const data=JSON.parse(raw) as AuthorRecord;
 if(cleanId(String(data.id||""))!==id)throw Error("AUTHOR_ID_MISMATCH");
 return data;
}
export function authorReferenceLinks(author:EvidenceAuthor){
 const q=encodeURIComponent('"'+author.name+'"');
 const wikimedia="https://en.wikipedia.org/w/index.php?search="+q;
 const news="https://news.google.com/search?q="+encodeURIComponent('"'+author.name+'"');
 const home=author.orcid||"";
 return {openalex:author.id,orcid:author.orcid||"",wikipedia:wikimedia,news,
  personal:home,personal_search:"https://www.google.com/search?q="+encodeURIComponent('"'+author.name+'" official university personal website')};
}
