/** Scouts geography is a country / broad region, never a device location or address. */
const KEY="vanilla.scouts.research-region.v1";
export function getScoutsRegion():string{
 try{const saved=localStorage.getItem(KEY);return saved&&saved.trim()?saved.trim().slice(0,40):"台灣";}catch{return "台灣";}
}
export function setScoutsRegion(value:string):void{
 const region=value.trim().replace(/[\r\n<>]/g,"").slice(0,40);
 if(!region)throw Error("請提供國家或地區，例如台灣、日本、新加坡");
 localStorage.setItem(KEY,region);
 window.dispatchEvent(new Event("vanilla-scouts-region-changed"));
}
export type GroundedSource={title:string;url:string;snippet:string;regionSpecific?:boolean};
function localSource(source:GroundedSource,region:string):boolean{
 let host="";
 try{host=new URL(source.url).hostname.toLowerCase();}catch{return false;}
 const taiwan=/(?:^台灣$|^臺灣$|^taiwan$|^tw$)/i.test(region);
 return taiwan?(host.endsWith(".tw")||/(?:台灣|臺灣|taiwan)/i.test(source.title+" "+source.snippet)):
  (source.title+" "+source.snippet).toLowerCase().includes(region.toLowerCase());
}
export function selectScoutsSources(all:GroundedSource[],region:string):GroundedSource[]{
 const seen=new Set<string>();
 const unique=all.filter(item=>{
  try{
   const u=new URL(item.url);
   if(u.protocol!=="https:"||u.username||u.password||u.port||u.hostname==="localhost"||/^(?:\d+\.\d+\.\d+\.\d+|\[)/.test(u.hostname))return false;
   const key=u.origin+u.pathname.replace(/\/$/,"");
   if(seen.has(key))return false;seen.add(key);return true;
  }catch{return false;}
 });
 // Prefer three independent general sources, then one additional local source.
 const main=unique.filter(x=>!localSource(x,region)).slice(0,3).map(x=>({...x,regionSpecific:false}));
 for(const item of unique){if(main.length>=3)break;if(!main.some(x=>x.url===item.url))main.push({...item,regionSpecific:false});}
 const regional=unique.find(x=>localSource(x,region)&&!main.some(y=>y.url===x.url));
 if(regional)main.push({...regional,regionSpecific:true});
 else{
  const existing=main.find(x=>localSource(x,region));
  if(existing)existing.regionSpecific=true;
 }
 return main;
}
export function hasRegionalSource(items:GroundedSource[],region:string):boolean{
 return items.some(x=>localSource(x,region));
}
