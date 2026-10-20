import {inspectExternalText} from "../security/trust-boundary";
import {getSearchBridge,fetchSearchBridge} from "./search-bridge";
export type LiveSearchResult={title:string;url:string;snippet:string;provider:"Wikipedia"|"Crossref"|"自訂搜尋"};
export type LiveSearchReport={results:LiveSearchResult[];errors:string[]};
const safe=(value:unknown,max=450):string=>{
 const txt=String(value??"").replace(/<[^>]*>/g," ").replace(/&(?:quot|amp|lt|gt|nbsp|#39);/gi," ").replace(/\s+/g," ").trim().slice(0,max);
 return inspectExternalText(txt,"web").blocked?"（來源包含疑似提示詞注入，已隔離文字）":txt;
};
async function getJSON(url:string):Promise<unknown>{
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),9000);
 try{
  const response=await fetch(url,{headers:{Accept:"application/json"},credentials:"omit",mode:"cors",signal:controller.signal});
  if(!response.ok)throw Error("HTTP "+response.status);
  const length=Number(response.headers.get("content-length")||"0");
  if(length>1500000)throw Error("回應過大");
  return await response.json() as unknown;
 }finally{clearTimeout(timeout);}
}
export async function searchLiveWeb(query:string):Promise<LiveSearchReport>{
 const q=query.trim().slice(0,180);
 if(q.length<2)throw Error("搜尋需要至少兩個字");
 const errors:string[]=[];
 const jobs:Array<{name:string;run:()=>Promise<LiveSearchResult[]>}>=[];
 // Keep the general-purpose backend FIRST. Previously its results were appended
 // after Wikipedia/Crossref and could be silently dropped by the nine-hit limit.
 if(getSearchBridge())jobs.push({name:"自訂搜尋後端",run:async()=>{
  const hits=await fetchSearchBridge(q);
  return hits.map(hit=>({title:safe(hit.title,160),url:hit.url,snippet:safe(hit.snippet),provider:"自訂搜尋" as const}));
 }});
 jobs.push({name:"Wikipedia",run:async()=>{
  const url="https://zh.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&origin=*&srlimit=5&srsearch="+encodeURIComponent(q);
  const data=await getJSON(url) as {query?:{search?:Array<{title?:unknown;snippet?:unknown;pageid?:unknown}>}};
  const list=data.query?.search;
  if(!Array.isArray(list))throw Error("無法讀取 Wikipedia 搜尋結果");
  return list.flatMap(item=>typeof item.pageid==="number"&&typeof item.title==="string"?
   [{title:safe(item.title,160),url:"https://zh.wikipedia.org/?curid="+item.pageid,
     snippet:safe(item.snippet),provider:"Wikipedia" as const}]:[]);
 }});
 // Crossref is NOT a general web engine. Unrelated DOI matches must not crowd
 // out news, government or ordinary website search results.
 if(/(?:文獻|論文|PubMed|研究|學術|期刊|臨床|治療|藥物|指引|指南|醫學|DOI|systematic review|meta.analysis|clinical trial|RCT)/i.test(q)){
  jobs.push({name:"Crossref",run:async()=>{
   const data=await getJSON("https://api.crossref.org/works?rows=4&select=DOI,title,URL&query.title="+encodeURIComponent(q)) as {message?:{items?:Array<{DOI?:unknown;title?:unknown}>}};
   return (data.message?.items||[]).flatMap(item=>{
    const doi=String(item.DOI||"");
    if(!/^10\.\d{4,9}\/[a-z0-9._;()/:+-]+$/i.test(doi))return [];
    const title=Array.isArray(item.title)?item.title[0]:undefined;
    return [{title:safe(title,160),url:"https://doi.org/"+encodeURI(doi),
     snippet:"Crossref 文獻中繼資料 · DOI "+doi,provider:"Crossref" as const}];
   });
  }});
 }
 const outcomes=await Promise.allSettled(jobs.map(job=>job.run()));
 const seen=new Set<string>(),results:LiveSearchResult[]=[];
 for(let i=0;i<outcomes.length;i++){
  const outcome=outcomes[i];
  if(outcome.status==="rejected"){
   const reason=outcome.reason instanceof Error?outcome.reason.message:String(outcome.reason);
   const detail=/^(?:HTTP \d{3}|搜尋後端 HTTP \d{3}|搜尋後端格式錯誤)/.test(reason)?": "+reason.slice(0,90):"（CORS、逾時、連線或設定問題）";
   errors.push(jobs[i].name+" 無法取得內容"+detail);
   continue;
  }
  for(const item of outcome.value){
   if(!item.url||seen.has(item.url))continue;
   seen.add(item.url);
   if(results.length<9)results.push(item);
  }
 }
 return {results,errors};
}
export function searchWebSummary(report:LiveSearchReport,query:string):string{
 return report.results.length?
  "已實際向可存取的公開來源查詢「"+query+"」，取得 "+report.results.length+" 筆標題及摘要；以下提供來源連結。搜尋命中不代表已查證結論，請點來源核對。"+
  (report.errors.length?"\n部分服務不可用："+report.errors.join("；"):""):
  "沒有成功擷取到可展示的即時搜尋結果。"+(report.errors.length?" "+report.errors.join("；"):"")+" 已保留 Google、PubMed 等搜尋連結，可自行開啟核對。";
}
