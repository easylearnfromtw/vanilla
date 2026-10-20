/** Commons discovery: real public API results only. This is not Google Image Search.
 * No private text/attachments, no cookies or location. Image bytes are not
 * downloaded by this function; Venus Gallery requires a separate human click.
 */
import {venusSafeUrl,type VenusBlock} from "./presentation";
export function imageSearchQuery(input:string):string|null{
 const raw=input.trim();
 if(/(?:生成|製作|畫|設計|合成|修改|編輯).{0,10}(?:圖片|照片|插畫|圖像)/.test(raw))return null;
 const hasRequest=/(?:搜尋|尋找|找|查找|查詢|幫我看|給我看|展示|找出|show|find|search)/i.test(raw);
 const hasVisual=/(?:圖片|照片|相片|圖庫|影像|image|photo|picture)/i.test(raw);
 if(!hasRequest||!hasVisual)return null;
 let q=raw
  .replace(/^(?:[@＠]Diana|戴安娜)[\s：:,，]*/i,"")
  .replace(/(?:幫我|請|麻煩|可不可以|請問|找出|搜尋|尋找|查找|查詢|給我看|展示|我想看|看看|show me|find|search for)/gi," ")
  .replace(/(?:一些|幾張|多張|真實的|真正的|網路上的|公開的|的圖片|的照片|的相片|圖片|照片|相片|圖庫|影像|image|photo|picture)/gi," ")
  .replace(/[，、。！？!?]/g," ").trim().replace(/\s+/g," ");
 return q&&q.length<=130?q:null;
}
type CommonsEntry={title?:string;imageinfo?:Array<{thumburl?:string;url?:string;descriptionurl?:string;extmetadata?:{LicenseShortName?:{value?:string}}}>};
type CommonsReply={query?:{pages?:Record<string,CommonsEntry>};error?:{info?:string}};
export async function searchCommonsImages(query:string,signal?:AbortSignal):Promise<Extract<VenusBlock,{kind:"gallery"}>|null>{
 const q=query.trim().slice(0,130);
 if(!q)return null;
 const endpoint=new URL("https://commons.wikimedia.org/w/api.php");
 const params:Record<string,string>={
  action:"query",generator:"search",gsrsearch:q,gsrnamespace:"6",gsrlimit:"8",
  prop:"imageinfo",iiprop:"url|extmetadata",iiurlwidth:"750",format:"json",formatversion:"2",origin:"*"
 };
 for(const [k,v] of Object.entries(params))endpoint.searchParams.set(k,v);
 const timer=new AbortController();
 const stop=()=>timer.abort();
 signal?.addEventListener("abort",stop,{once:true});
 const handle=window.setTimeout(()=>timer.abort(),14000);
 try{
  const response=await fetch(endpoint.toString(),{signal:timer.signal,credentials:"omit",referrerPolicy:"no-referrer",cache:"no-store"});
  if(!response.ok)throw Error("Wikimedia Commons HTTP "+response.status);
  const data=await response.json() as CommonsReply;
  if(data.error)throw Error(data.error.info||"Wikimedia Commons API error");
  const pages=Object.values(data.query?.pages||{}).slice(0,8);
  const items:Extract<VenusBlock,{kind:"gallery"}>["items"]=[];
  for(const page of pages){
   const info=page.imageinfo?.[0];if(!info)continue;
   const url=venusSafeUrl(info.thumburl||info.url||"");
   if(!url||new URL(url).hostname!=="upload.wikimedia.org")continue;
   const source=venusSafeUrl(info.descriptionurl||"");
   if(!source||new URL(source).hostname!=="commons.wikimedia.org")continue;
   const label=(page.title||"Wikimedia Commons").replace(/^File:/,"").slice(0,160);
   items.push({url,alt:label,caption:label,source});
   if(items.length>=6)break;
  }
  if(!items.length)return null;
  return {kind:"gallery",title:"Wikimedia Commons · 「"+q+"」的公開圖片搜尋",items};
 }finally{window.clearTimeout(handle);signal?.removeEventListener("abort",stop);}
}
