/** OpenAlex + arXiv academic citation priority — never a training-data exclusion. */
export type Institution={ror?:string;openalex_id?:string;id?:string;type?:string;display_name?:string};
export type Authority={match_id:string;category:"industry_leader"|"authoritative_expert"|"established_theory";verified:true;evidence_url:string;reviewer:string};
export type ScholarlyPaper={
 doi?:string;arxiv_id?:string;openalex_id?:string;author_orcids?:string[];
 institutions?:Institution[];relevance?:number;evidence_grade?:number;
 retracted?:boolean;evidence_valid?:boolean;publication_year?:number;
 fulltext?:string;license?:string;rights_verified?:boolean;rights_reference?:string;
 rights_reviewer?:string;fulltext_source_url?:string;citation_weight?:number;
};
export type RankTable=Record<string,number>; // verified QS2027 rank; use ROR or OpenAlex IDs, not name matches
const rankBand=(rank?:number):number=>Number.isInteger(rank)&&rank!>=1?
 rank!<=100?5:rank!<=300?4:rank!<=500?3:rank!<=700?2:1:1;
function instKeys(inst:Institution):string[]{
 const raw=String(inst.ror||"").toLowerCase().replace(/^https:\/\/ror\.org\//,"");
 const ror=/^0[a-z0-9]{8}$/.test(raw)?"ror:"+raw:"";
 const openalex=String(inst.openalex_id||inst.id||"").match(/(?:^|\/)(I\d+)$/i)?.[1]?.toUpperCase();
 return [ror,openalex?"openalex:"+openalex:""].filter(Boolean);
}
function stableId(value:unknown):string{
 let v=String(value||"").trim().toLowerCase();
 v=v.replace(/^https?:\/\/doi\.org\//,"doi:")
   .replace(/^https?:\/\/arxiv\.org\/abs\//,"arxiv:")
   .replace(/^https?:\/\/openalex\.org\//,"openalex:")
   .replace(/^https?:\/\/orcid\.org\//,"orcid:");
 if(/^10\.\d{4,9}\//.test(v))v="doi:"+v;
 if(v.startsWith("arxiv:"))v=v.replace(/v\d+$/,"");
 return /^(?:doi:10\.\d{4,9}\/\S+|arxiv:\d{4}\.\d{4,5}|openalex:w\d+|orcid:\d{4}-\d{4}-\d{4}-[\dx]{4})$/.test(v)?v:"";
}
export function scholarlyCitationPriority(paper:ScholarlyPaper,ranks:RankTable,authorities:Authority[]=[]){
 const institutions=paper.institutions||[];
 const schools=institutions.flatMap(inst=>{
  const rank=instKeys(inst).map(k=>ranks[k]).find(v=>Number.isInteger(v)&&v>0);
  return rank!==undefined||["education","university"].includes((inst.type||"").toLowerCase())?
   [{weight:rankBand(rank),rank:rank??null,name:inst.display_name||""}]:[];
 });
 if(schools.length){
  const best=schools.sort((a,b)=>b.weight-a.weight)[0];
  return {citation_weight:best.weight,citation_basis:best.rank===null?"unranked-university":"university-ranking",university_rank:best.rank,attributed_university:best.name,ranking_system:best.rank===null?null:"QS-2027"};
 }
 const types=institutions.map(x=>(x.type||"").toLowerCase());
 const confirmedNonUniversity=types.length>0&&types.every(t=>["company","nonprofit","government","facility","healthcare","industry"].includes(t));
 if(confirmedNonUniversity){
  const identifiers=new Set([paper.doi,paper.arxiv_id,paper.openalex_id,...(paper.author_orcids||[])].map(stableId).filter(Boolean));
  const match=authorities.find(a=>a.verified===true&&Boolean(a.reviewer?.trim())&&/^https:\/\//.test(a.evidence_url||"")&&
   ["industry_leader","authoritative_expert","established_theory"].includes(a.category)&&identifiers.has(stableId(a.match_id)));
  if(match)return {citation_weight:5,citation_basis:"verified-nonuniversity-authority",authority:match};
  return {citation_weight:1,citation_basis:"nonuniversity-default"};
 }
 return {citation_weight:1,citation_basis:"affiliation-unverified"};
}
export function isFulltextTrainingCandidate(paper:ScholarlyPaper):boolean{
 const license=(paper.license||"").trim().toLowerCase();
 return Boolean((paper.fulltext||"").trim())&&["cc0","cc-by","public-domain"].includes(license)&&
 paper.rights_verified===true&&Boolean(paper.rights_reference?.trim())&&
 Boolean(paper.rights_reviewer?.trim())&&Boolean(paper.fulltext_source_url?.startsWith("https://"));
}
/** Train on every reviewed and compatible full text, irrespective of citation tier. */
export function selectTrainingCandidates(papers:ScholarlyPaper[]):ScholarlyPaper[]{
 return papers.filter(isFulltextTrainingCandidate);
}
/** Scientific evidence validity dominates institutional prestige. */
export function orderScholarlyCitations<T extends ScholarlyPaper>(papers:T[],minimumRelevance=.5):T[]{
 return papers.filter(p=>p.retracted!==true&&p.evidence_valid!==false&&(p.relevance||0)>=minimumRelevance)
  .sort((a,b)=>(b.evidence_grade||0)-(a.evidence_grade||0)||
    (b.citation_weight||1)-(a.citation_weight||1)||
    (b.relevance||0)-(a.relevance||0)||
    (b.publication_year||0)-(a.publication_year||0));
}
