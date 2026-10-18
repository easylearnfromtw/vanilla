export type PreferredSource={host:string;weight:number;enabled:boolean;label:string};
const KEY="vanilla.search.sources.v1";
const DEFAULT:PreferredSource[]=[
 {host:"pubmed.ncbi.nlm.nih.gov",label:"PubMed",weight:5,enabled:true},
 {host:"gov.tw",label:"臺灣政府網站",weight:4,enabled:true},
 {host:"who.int",label:"WHO",weight:4,enabled:true},
 {host:"wikipedia.org",label:"Wikipedia",weight:2,enabled:true}
];
function cleanHost(host:string):string{
 let value=host.trim().toLowerCase();
 try{if(value.includes("://"))value=new URL(value).hostname;}catch{throw Error("網址不合法");}
 value=value.replace(/^www\./,"").replace(/\/$/,"");
 if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value)||value.length>120)throw Error("請輸入網站網域，例如 pubmed.ncbi.nlm.nih.gov");
 return value;
}
export function getSources():PreferredSource[]{
 try{
  const json=JSON.parse(localStorage.getItem(KEY)||"null") as PreferredSource[]|null;
  if(!Array.isArray(json))return [...DEFAULT];
  return json.slice(0,30).flatMap(x=>{try{return [{host:cleanHost(x.host),weight:Math.max(1,Math.min(5,Number(x.weight)||1)),enabled:x.enabled!==false,label:String(x.label||x.host).slice(0,60)}];}catch{return [];}});
 }catch{return [...DEFAULT];}
}
export function setSources(input:PreferredSource[]):void{
 if(input.length>30)throw Error("最多設定 30 個偏好網站");
 const seen=new Set<string>();
 const cleaned=input.map(x=>({...x,host:cleanHost(x.host),weight:Math.max(1,Math.min(5,Math.round(x.weight))),label:x.label.trim().slice(0,60)||x.host}));
 for(const x of cleaned){if(seen.has(x.host))throw Error("重複的網站："+x.host);seen.add(x.host);}
 localStorage.setItem(KEY,JSON.stringify(cleaned));
 window.dispatchEvent(new Event("vanilla-sources-changed"));
}
export function addSource(input:string,label="",weight=3){
 const host=cleanHost(input),sources=getSources();
 if(sources.some(x=>x.host===host))throw Error("這個網域已存在");
 setSources([...sources,{host,label:label||host,weight,enabled:true}]);
}
export function rankedSources(){return getSources().filter(x=>x.enabled).sort((a,b)=>b.weight-a.weight);}
export function searchLinks(query:string):Array<{label:string;url:string;host?:string}>{
 const trimmed=query.trim();if(!trimmed)return [];
 const encoded=encodeURIComponent(trimmed);
 const links:Array<{label:string;url:string;host?:string}>=[{label:"搜尋整個網路（Google）",url:"https://www.google.com/search?q="+encoded}];
 for(const source of rankedSources().slice(0,7)){
  links.push({label:source.label+" · 優先度 "+source.weight,url:"https://www.google.com/search?q="+encodeURIComponent(trimmed+" site:"+source.host),host:source.host});
 }
 return links;
}
