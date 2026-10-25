/** 藍星報社 — GDELT article metadata, never licensed full text or model training. */
export type NewsMarket="TW"|"CN"|"JP"|"KR"|"US";
export type NewsTopic="general"|"politics"|"economy"|"technology"|"society";
export type NewsItem={
  id:string;title:string;url:string;source:string;market:NewsMarket;
  detectedAt:string;language:string;kind:"live"|"archive";
};
export const NEWS_MARKETS:ReadonlyArray<{id:NewsMarket;name:string;sourceCountry:string}>=[
  {id:"TW",name:"台灣",sourceCountry:"taiwan"},
  {id:"CN",name:"中國",sourceCountry:"china"},
  {id:"JP",name:"日本",sourceCountry:"japan"},
  {id:"KR",name:"韓國",sourceCountry:"southkorea"},
  {id:"US",name:"美國",sourceCountry:"unitedstates"}
];
export const NEWS_TOPICS:ReadonlyArray<{id:NewsTopic;name:string;query:string}>=[
  {id:"general",name:"綜合",query:"(economy OR government OR technology OR health OR culture OR sports)"},
  {id:"politics",name:"政治",query:"(government OR election OR parliament)"},
  {id:"economy",name:"財經",query:"(economy OR inflation OR business OR investment)"},
  {id:"technology",name:"科技",query:"(technology OR artificialintelligence OR semiconductor)"},
  {id:"society",name:"社會",query:"(health OR education OR climate OR culture)"}
];

export function newsSourceUrl(value:unknown):string|null{
 if(typeof value!=="string"||value.length>2100)return null;
 try{
  const parsed=new URL(value);
  if(parsed.protocol!=="https:"||!parsed.hostname||parsed.username||parsed.password)return null;
  if(parsed.hostname==="localhost"||parsed.hostname.endsWith(".local"))return null;
  return parsed.href;
 }catch{return null;}
}
export function gdeltNewsUrl(market:NewsMarket,topic:NewsTopic,search=""):string{
 const m=NEWS_MARKETS.find(m=>m.id===market)??NEWS_MARKETS[0];
 const t=NEWS_TOPICS.find(t=>t.id===topic)??NEWS_TOPICS[0];
 const keyword=search.trim().replace(/["\\()\r\n]/g," ").replace(/\s+/g," ").slice(0,90);
 const terms=keyword.length>=2?'"'+keyword+'"':t.query;
 const url=new URL("https://api.gdeltproject.org/api/v2/doc/doc");
 url.searchParams.set("query","sourcecountry:"+m.sourceCountry+" "+terms);
 url.searchParams.set("mode","artlist");
 url.searchParams.set("format","json");
 url.searchParams.set("sort","datedesc");
 url.searchParams.set("timespan","1w");
 url.searchParams.set("maxrecords","50");
 return url.toString();
}
function observedAt(raw:unknown):string{
 if(typeof raw!=="string")return "";
 if(/^\d{8}T\d{6}Z$/.test(raw)){
  return raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8)+"T"+raw.slice(9,11)+":"+raw.slice(11,13)+":"+raw.slice(13,15)+"Z";
 }
 if(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)){
  const d=new Date(raw);
  return Number.isNaN(d.getTime())?"":d.toISOString();
 }
 return "";
}
export function parseLiveNews(payload:unknown,market:NewsMarket):NewsItem[]{
 const entries=(payload as {articles?:unknown})?.articles;
 if(!Array.isArray(entries))return [];
 const seen=new Set<string>();
 const out:NewsItem[]=[];
 for(const item of entries.slice(0,250)){
  if(!item||typeof item!=="object")continue;
  const x=item as Record<string,unknown>;
  const url=newsSourceUrl(x.url),title=typeof x.title==="string"?x.title.trim().slice(0,300):"";
  if(!url||title.length<5||seen.has(url))continue;
  seen.add(url);
  out.push({id:url,title,url,market,kind:"live",source:typeof x.domain==="string"?x.domain.slice(0,120):new URL(url).hostname,
    language:typeof x.language==="string"?x.language.slice(0,50):"",
    detectedAt:observedAt(x.seendate)});
  if(out.length===50)break;
 }
 return out;
}
export async function fetchLiveNews(market:NewsMarket,topic:NewsTopic,search:string,signal:AbortSignal):Promise<NewsItem[]>{
 const res=await fetch(gdeltNewsUrl(market,topic,search),{signal,headers:{Accept:"application/json"}});
 if(!res.ok)throw new Error("新聞來源暫時無法連線（HTTP "+res.status+"）");
 const data:unknown=await res.json();
 return parseLiveNews(data,market);
}
export type ArchiveSnapshot={updatedAt:string|null;totalIndexed:number;totalApproved:number;articles:NewsItem[]};
export function parseArchiveSnapshot(data:unknown):ArchiveSnapshot{
 if(!data||typeof data!=="object")throw new Error("歷史新聞索引格式不正確");
 const x=data as Record<string,unknown>;
 const raw=Array.isArray(x.articles)?x.articles:[];
 const seen=new Set<string>(), articles:NewsItem[]=[];
 for(const item of raw.slice(0,1000)){
  if(!item||typeof item!=="object")continue;
  const row=item as Record<string,unknown>;
  const url=newsSourceUrl(row.url);
  const market=row.market;
  const title=typeof row.title==="string"?row.title.trim().slice(0,300):"";
  if(!url||title.length<5||!NEWS_MARKETS.some(v=>v.id===market)||seen.has(url))continue;
  seen.add(url);
  articles.push({id:typeof row.article_id==="string"?row.article_id:url,url,title,
   source:typeof row.source==="string"?row.source.slice(0,120):new URL(url).hostname,
   detectedAt:observedAt(row.published_at),language:"",market:market as NewsMarket,kind:"archive"});
 }
 const nonnegative=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:0;
 return {updatedAt:typeof x.generated_at==="string"?x.generated_at:null,
  totalIndexed:nonnegative(x.metadata_indexed),totalApproved:nonnegative(x.rights_reviewed_unique_full_articles),articles};
}
