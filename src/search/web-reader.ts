import {inspectExternalText} from "../security/trust-boundary";
import {getSearchBridge} from "./search-bridge";
export type ReadPage={url:string;title:string;text:string;readMethod:"browser"|"bridge"};
export function validatePublicPageURL(raw:string):string{
 const url=new URL(raw.trim());
 const h=url.hostname.toLowerCase();
 if(url.protocol!=="https:"||url.username||url.password||url.port||
 h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")||h.endsWith(".localhost")||
 /^(?:\d+\.\d+\.\d+\.\d+|\[.+\])$/.test(h))throw Error("只能讀取公開 HTTPS 網頁，不支援本機／IP 網址。");
 url.hash="";return url.toString();
}
async function limitedText(res:Response,max=400000):Promise<string>{
 if(!res.ok)throw Error("HTTP "+res.status);
 const mime=res.headers.get("content-type")||"";
 if(!/text\/(?:html|plain|markdown)|application\/xhtml\+xml/.test(mime))throw Error("此連結不是可讀文字網頁（"+mime.slice(0,55)+"）");
 const reader=res.body?.getReader();
 if(!reader)throw Error("網頁回應為空");
 let size=0;const chunks:Uint8Array[]=[];
 while(size<max){
  const c=await reader.read();if(c.done)break;
  if(c.value){size+=c.value.length;chunks.push(c.value);}
 }
 await reader.cancel().catch(()=>{});
 if(size>max)throw Error("網頁全文超過讀取上限");
 const bytes=new Uint8Array(size);let offset=0;
 for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 return new TextDecoder("utf-8").decode(bytes);
}
export function extractReadableText(html:string):{title:string;text:string}{
 const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"網頁文章").replace(/<[^>]+>/g,"").trim().slice(0,180);
 const text=html.replace(/<(?:script|style|nav|footer|header|aside|noscript|svg)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|nav|footer|header|aside|noscript|svg)\s*>/gi," ")
  .replace(/<!--.*?-->/gs," ").replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
  .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g," ").trim().slice(0,17000);
 return {title,text};
}
export function readBridgeURL(searchEndpoint:string,pageURL:string):string{
 const base=new URL(searchEndpoint);
 if(base.protocol!=="https:")throw Error("需要 HTTPS 網頁擷取服務");
 base.pathname=base.pathname.replace(/\/search\/?$/,"/read");
 if(!base.pathname.endsWith("/read"))throw Error("搜尋後端網址應以 /search 結尾，以使用配對的 /read 網頁擷取服務");
 base.searchParams.set("url",validatePublicPageURL(pageURL));
 return base.toString();
}
export async function readPublicPage(input:string):Promise<ReadPage>{
 const url=validatePublicPageURL(input);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
 try{
  try{
   const res=await fetch(url,{credentials:"omit",mode:"cors",redirect:"error",signal:controller.signal});
   const body=await limitedText(res);
   const parsed=extractReadableText(body);
   const check=inspectExternalText(parsed.text,"web");
   if(check.blocked)throw Error("網頁含疑似提示詞注入，文字已隔離");
   if(parsed.text.length<120)throw Error("網站沒有可讀的正文");
   return {url,title:parsed.title,text:parsed.text,readMethod:"browser"};
  }catch(directError){
   const backend=getSearchBridge();
   if(!backend)throw Error("此網站無法由 iPhone 直接讀取（CORS 或網站限制），且尚未設定網頁擷取後端。"+String(directError));
   const path=readBridgeURL(backend,url);
   const res=await fetch(path,{mode:"cors",credentials:"omit",signal:controller.signal});
   if(!res.ok)throw Error("網頁擷取後端回應 HTTP "+res.status);
   const raw=await res.json() as Partial<ReadPage>;
   if(typeof raw.text!=="string"||raw.text.length<120||typeof raw.url!=="string")throw Error("網頁擷取服務沒有回傳足夠正文");
   if(validatePublicPageURL(raw.url)!==url)throw Error("服務回傳的網頁來源不一致");
   if(inspectExternalText(raw.text,"web").blocked)throw Error("擷取內容含疑似提示詞注入，已隔離");
   return {url,title:String(raw.title||url).slice(0,180),text:raw.text.slice(0,17000),readMethod:"bridge"};
  }
 }finally{clearTimeout(timeout);}
}
export function linkReadingIntent(text:string):string|null{
 const q=text.trim();
 const m=/^(?:(?:請|幫我|麻煩你)?\s*)?(?:閱讀|讀取|打開|開啟|摘要|總結|統整|整理|分析|研究|幫我看|看一下|幫我讀|讀一下)\s*(?:這個|這篇|以下|該)?\s*(?:網站|網頁|連結|網址|文章|內容)?\s*[：:\s]*((?:https:\/\/)[^\s]+)(?:\s*(?:並|然後)?(?:統整|摘要|重點整理|分析|解釋|講重點|告訴我重點).*)?$/i.exec(q);
 return m?m[1].replace(/[，。！!）)]+$/,""):null;
}
