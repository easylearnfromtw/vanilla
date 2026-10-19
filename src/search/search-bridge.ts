/** Optional user-hosted HTTPS search service. API keys belong on that
 * server, never in this public Github Pages bundle.
 * Expected GET /search?q=<query> => {results:[{title,url,snippet}]}.
 */
const KEY="vanilla.search.bridge.url.v1";
const TOKEN="vanilla.search.bridge.session-token.v1";
export function getWebReaderToken():string{try{return sessionStorage.getItem(TOKEN)||"";}catch{return "";}}
export function setWebReaderToken(value:string):void{try{if(value.trim())sessionStorage.setItem(TOKEN,value.trim());else sessionStorage.removeItem(TOKEN);}catch{}}
export function webReaderHeaders():HeadersInit{const token=getWebReaderToken();return token?{Authorization:"Bearer "+token}:{};}
export function validateSearchBridge(url:string):string{
 if(!url.trim())return "";
 const u=new URL(url.trim());
 if(u.protocol!=="https:"||u.username||u.password||u.hash||u.search)throw Error("搜尋後端必須是不帶帳密或參數的 HTTPS 網址");
 const host=u.hostname.toLowerCase();
 if(host==="localhost"||host.endsWith(".local")||host.endsWith(".internal")||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(":"))throw Error("不可把本機或內網位址作為公開搜尋後端");
 return u.toString().replace(/\/$/,"");
}
export function getSearchBridge():string{
 try{return validateSearchBridge(localStorage.getItem(KEY)||"");}catch{return "";}
}
export function setSearchBridge(url:string):void{
 const value=validateSearchBridge(url);
 if(value)localStorage.setItem(KEY,value);else localStorage.removeItem(KEY);
 window.dispatchEvent(new Event("vanilla-search-bridge-changed"));
}
export type BridgeSearchHit={title:string;url:string;snippet:string};
export async function fetchSearchBridge(query:string):Promise<BridgeSearchHit[]>{
 const base=getSearchBridge();
 if(!base)return [];
 const url=base+(base.includes("?")?"&":"?")+"q="+encodeURIComponent(query.slice(0,180));
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),9000);
 try{
  const res=await fetch(url,{mode:"cors",credentials:"omit",headers:{"Accept":"application/json",...webReaderHeaders()},redirect:"error",signal:ctrl.signal});
  if(!res.ok)throw Error("搜尋後端 HTTP "+res.status);
  const raw=await res.json() as {results?:unknown};
  if(!Array.isArray(raw.results))throw Error("搜尋後端格式錯誤，應回傳 results 陣列");
  return raw.results.slice(0,8).flatMap((x:unknown)=>{
   if(!x||typeof x!=="object")return [];
   const item=x as Record<string,unknown>;
   const target=String(item.url||"");
   try{
    const u=new URL(target);
    if(u.protocol!=="https:"||u.username||u.password||u.hostname==="localhost"||/^(?:127|10|192)\./.test(u.hostname))return [];
    return [{title:String(item.title||"").slice(0,160),url:u.toString(),snippet:String(item.snippet||"").slice(0,500)}];
   }catch{return [];}
  });
 }finally{clearTimeout(timer);}
}
