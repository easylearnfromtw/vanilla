import {inspectExternalText} from "../security/trust-boundary";
export type LiveSearchResult={title:string;url:string;snippet:string;provider:"Wikipedia"|"Crossref"};
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
 const results:LiveSearchResult[]=[],errors:string[]=[];
 const tasks=[
  (async()=>{
   const url="https://zh.wikipedia.org/w/api.php?action=query&list=search&format=json&utf8=1&origin=*&srlimit=5&srsearch="+encodeURIComponent(q);
   const data=await getJSON(url) as {query?:{search?:Array<{title?:unknown;snippet?:unknown;pageid?:unknown}>}};
   const list=data.query?.search;
   if(!Array.isArray(list))throw Error("無法讀取 Wikipedia 搜尋結果");
   for(const item of list){
    if(typeof item.pageid!=="number"||typeof item.title!=="string")continue;
    results.push({title:safe(item.title,160),url:"https://zh.wikipedia.org/?curid="+item.pageid,
     snippet:safe(item.snippet),provider:"Wikipedia"});
   }
  })(),
  (async()=>{
   // Crossref is a literature metadata index, not a general web search engine.
   const data=await getJSON("https://api.crossref.org/works?rows=4&select=DOI,title,URL&query.title="+encodeURIComponent(q)) as {message?:{items?:Array<{DOI?:unknown;title?:unknown}>}};
   for(const item of data.message?.items||[]){
    const doi=String(item.DOI||"");
    if(!/^10\.\d{4,9}\/[a-z0-9._;()/:+-]+$/i.test(doi))continue;
    const title=Array.isArray(item.title)?item.title[0]:undefined;
    results.push({title:safe(title,160),url:"https://doi.org/"+encodeURI(doi),snippet:"Crossref 文獻中繼資料 · DOI "+doi,provider:"Crossref"});
   }
  })()
 ];
 const statuses=await Promise.allSettled(tasks);
 for(let i=0;i<statuses.length;i++)if(statuses[i].status==="rejected"){
  const provider=i===0?"Wikipedia":"Crossref";
  errors.push(provider+" 無法取得內容（可能為 CORS、網路或服務限制）");
 }
 return {results:results.slice(0,9),errors};
}
export function searchWebSummary(report:LiveSearchReport,query:string):string{
 return report.results.length?
  "已實際向可存取的公開來源查詢「"+query+"」，取得 "+report.results.length+" 筆標題及摘要；以下提供來源連結。搜尋命中不代表已查證結論，請點來源核對。"+
  (report.errors.length?"\n部分服務不可用："+report.errors.join("；"):""):
  "沒有成功擷取到可展示的即時搜尋結果。"+(report.errors.length?" "+report.errors.join("；"):"")+" 已保留 Google、PubMed 等搜尋連結，可自行開啟核對。";
}
