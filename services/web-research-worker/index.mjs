/** Vanilla web reader/search service — deploy separately on Cloudflare Workers.
 * Required Worker secrets: BRAVE_API_KEY and WEB_READER_TOKEN.
 * Required public env: ALLOWED_ORIGIN=https://easylearnfromtw.github.io
 * A public GitHub Pages app cannot store backend API keys safely.
 */
const JSON_HEADERS={"content-type":"application/json;charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
function reply(value,status=200,origin=""){return new Response(JSON.stringify(value),{status,headers:{...JSON_HEADERS,...(origin?{"access-control-allow-origin":origin,"vary":"origin"}:{})}});}
function publicURL(raw){
 const u=new URL(raw);
 const h=u.hostname.toLowerCase();
 if(u.protocol!=="https:"||u.port||u.username||u.password||u.hash||
  h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||
  h.endsWith(".test")||h.endsWith(".example")||
  /^\d+\.\d+\.\d+\.\d+$/.test(h)||h.includes(":"))throw Error("URL must be public HTTPS DNS hostname");
 // Prevent credential/resource requests and common metadata or loopback targets.
 if(h==="metadata.google.internal"||h==="instance-data"||h==="169.254.169.254")throw Error("Blocked host");
 return u;
}
function stripHTML(html){
 const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"網頁文章").replace(/<[^>]+>/g,"").trim().slice(0,180);
 const text=html.replace(/<(?:script|style|nav|footer|header|aside|noscript|svg)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|nav|footer|header|aside|noscript|svg)\s*>/gi," ")
  .replace(/<[^>]+>/g," ").replace(/&(?:nbsp|amp|quot|lt|gt);/gi," ").replace(/\s+/g," ").trim().slice(0,17000);
 return {title,text};
}
async function smallBody(response,limit=400000){
 const reader=response.body?.getReader();if(!reader)throw Error("Empty body");
 const pieces=[];let size=0;
 while(size<=limit){const chunk=await reader.read();if(chunk.done)break;if(chunk.value){pieces.push(chunk.value);size+=chunk.value.byteLength;}}
 await reader.cancel().catch(()=>{});
 if(size>limit)throw Error("Document too large");
 const bytes=new Uint8Array(size);let cursor=0;for(const x of pieces){bytes.set(x,cursor);cursor+=x.byteLength;}
 return new TextDecoder().decode(bytes);
}
async function search(query,env){
 if(!env.BRAVE_API_KEY)throw Error("BRAVE_API_KEY not configured");
 const u=new URL("https://api.search.brave.com/res/v1/web/search");
 u.searchParams.set("q",query);u.searchParams.set("count","8");u.searchParams.set("search_lang","en");
 const response=await fetch(u.toString(),{headers:{"Accept":"application/json","X-Subscription-Token":env.BRAVE_API_KEY},signal:AbortSignal.timeout(9000)});
 if(!response.ok)throw Error("Search provider HTTP "+response.status);
 const data=await response.json();
 return {results:(data.web?.results||[]).slice(0,8).flatMap(hit=>{
  try{const url=publicURL(hit.url).toString();return [{title:String(hit.title||url).slice(0,160),url,snippet:String(hit.description||"").replace(/<[^>]+>/g," ").slice(0,500)}];}
  catch{return [];}
 })};
}
async function readPage(value){
 const u=publicURL(value);
 const res=await fetch(u.toString(),{redirect:"manual",credentials:"omit",headers:{"Accept":"text/html,text/plain;q=0.9"},signal:AbortSignal.timeout(9000)});
 // Don't follow a redirect: this avoids subsequent requests to unknown IPs/hosts.
 if(res.status>=300&&res.status<400)throw Error("Redirects are blocked for safety");
 if(!res.ok)throw Error("Website HTTP "+res.status);
 if(!/text\/(?:html|plain)|application\/xhtml\+xml/i.test(res.headers.get("content-type")||""))throw Error("Only text/HTML pages supported");
 const body=await smallBody(res);const parsed=stripHTML(body);
 if(parsed.text.length<120)throw Error("Page has insufficient readable text");
 return {url:u.toString(),title:parsed.title,text:parsed.text,readMethod:"bridge"};
}
export default {
 async fetch(request,env){
  const origin=request.headers.get("origin")||"";
  const cors=origin&&origin===env.ALLOWED_ORIGIN?origin:"";
  if(!cors)return reply({error:"origin not allowed"},403);
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":cors,"Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type","Access-Control-Max-Age":"3600","Vary":"Origin"}});
  if(request.method!=="GET")return reply({error:"method not allowed"},405,cors);
  // An Origin check is not authentication. Guard the search quota with a real per-user secret.
  if(!env.WEB_READER_TOKEN||request.headers.get("authorization")!=="Bearer "+env.WEB_READER_TOKEN)return reply({error:"authentication required"},401,cors);
  const u=new URL(request.url);
  try{
   if(u.pathname==="/search"){
    const q=(u.searchParams.get("q")||"").trim();if(q.length<2||q.length>180)return reply({error:"invalid query"},400,cors);
    return reply(await search(q,env),200,cors);
   }
   if(u.pathname==="/read"){
    const target=u.searchParams.get("url")||"";if(target.length>2000)return reply({error:"invalid URL"},400,cors);
    return reply(await readPage(target),200,cors);
   }
   return reply({error:"not found"},404,cors);
  }catch(e){return reply({error:String(e instanceof Error?e.message:e).slice(0,200)},422,cors);}
 }
};
