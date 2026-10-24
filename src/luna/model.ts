/** LUNA / Detroit: independent, offline poster document model.
 * No original poster-design source, upstream login, or privileged administrator.
 */
export type LunaLayer={
 id:string;kind:"text"|"shape"|"image";label:string;
 x:number;y:number;w:number;h:number;color:string;fill:string;opacity:number;
 text?:string;fontSize?:number;fontWeight?:number;align?:"left"|"center"|"right";
 image?:string;radius?:number
};
export type LunaDoc={version:1;id:string;name:string;width:number;height:number;background:string;layers:LunaLayer[];updatedAt:number};
export type LunaLibrary={projects:LunaDoc[];activeId:string};
export type LunaTemplate="editorial"|"minimal"|"event";
export const LUNA_MAX_PROJECTS=15,LUNA_MAX_LAYERS=60;
export const LUNA_TEMPLATES:{id:LunaTemplate;name:string}[]=[{id:"editorial",name:"實驗編輯設計"},{id:"minimal",name:"極簡品牌"},{id:"event",name:"活動宣傳"}];
export const LUNA_PALETTE=["#1C1C1F","#F4F2EC","#E33D35","#2956C7","#F5D344","#FFFFFF"];
const uid=()=>typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():"luna-"+Math.random().toString(36).slice(2);
export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const str=(x:unknown,max:number)=>typeof x==="string"?x.slice(0,max):"";
const hex=(x:unknown,fallback="#1C1C1F")=>typeof x==="string"&&/^#[a-fA-F0-9]{6}$/.test(x)?x:fallback;
const num=(x:unknown,fallback:number,min:number,max:number)=>typeof x==="number"&&Number.isFinite(x)?clamp(x,min,max):fallback;
const rec=(x:unknown):Record<string,unknown>|null=>x!==null&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;
function txt(label:string,text:string,x:number,y:number,w:number,h:number,fontSize:number,color:string):LunaLayer{
 return {id:uid(),kind:"text",label,x,y,w,h,color,fill:"#FFFFFF",opacity:1,text,fontSize,fontWeight:700,align:"left"};
}
function shape(label:string,x:number,y:number,w:number,h:number,fill:string):LunaLayer{
 return {id:uid(),kind:"shape",label,x,y,w,h,color:fill,fill,opacity:1,radius:0};
}
export function createLuna(template:LunaTemplate="editorial",headline="DESIGN WITHOUT LIMITS"):LunaDoc{
 const base={version:1 as const,id:uid(),width:1080,height:1350,updatedAt:Date.now()};
 if(template==="minimal")return {...base,name:"極簡品牌視覺",background:"#F4F2EC",layers:[
  txt("眉標","STUDIO EDITION 01",.08,.075,.84,.05,27,"#545450"),
  txt("主標題",headline,.08,.27,.82,.30,107,"#1C1C1F"),
  shape("分隔線",.08,.68,.25,.009,"#1C1C1F"),
  txt("品牌標語","AN ORIGINAL VISUAL SYSTEM",.08,.76,.84,.10,36,"#303033")
 ]};
 if(template==="event")return {...base,name:"活動海報",background:"#1C2445",layers:[
  shape("黃標",.07,.08,.38,.06,"#F5D344"),
  txt("活動類別","EVENT / 2026",.10,.087,.32,.048,28,"#1C2445"),
  txt("活動標題",headline,.07,.26,.85,.33,117,"#FFFFFF"),
  shape("橫線",.07,.69,.86,.005,"#FFFFFF"),
  txt("活動日期","DATE / TIME / VENUE",.07,.75,.85,.08,45,"#F5D344")
 ]};
 return {...base,name:"實驗編輯海報",background:"#F1EFE9",layers:[
  txt("刊頭","VISUAL ISSUE 001",.07,.065,.86,.05,28,"#1C1C1F"),
  shape("幾何色塊",.07,.22,.10,.20,"#E33D35"),
  txt("編輯標題",headline,.20,.22,.73,.31,116,"#1C1C1F"),
  txt("副標","視覺，從這裡開始。\nORIGINAL BY DESIGN",.07,.69,.85,.17,56,"#1C1C1F"),
  shape("底線",.07,.91,.85,.004,"#1C1C1F")
 ]};
}
export function addLunaLayer(kind:LunaLayer["kind"]):LunaLayer{
 const common={id:uid(),kind,label:kind==="text"?"文字":kind==="shape"?"形狀":"圖片",x:.13,y:.35,w:.72,h:.19,color:"#1C1C1F",fill:"#2956C7",opacity:1};
 if(kind==="text")return {...common,text:"在右側編輯文字",fontSize:65,fontWeight:700,align:"left"};
 if(kind==="shape")return {...common,radius:0};
 return {...common,h:.34,fill:"#E8E8E8",radius:0};
}
/** Untrusted JSON is converted to an allow-listed schema; no URL, HTML, JS or CSS imports. */
export function parseLuna(raw:unknown):LunaDoc{
 const d=rec(raw);
 if(!d||d.version!==1||!Array.isArray(d.layers)||d.layers.length>LUNA_MAX_LAYERS)throw Error("LUNA 格式或圖層數量不正確");
 const ids=new Set<string>();
 const layers:LunaLayer[]=d.layers.map((value:unknown,index:number)=>{
  const v=rec(value);if(!v||!["text","shape","image"].includes(String(v.kind)))throw Error("圖層 "+(index+1)+" 格式錯誤");
  const kind=v.kind as LunaLayer["kind"], image=str(v.image,2_800_001);
  if(kind==="image"&&image&&(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)||image.length>2_800_000))throw Error("僅接受本機圖片，不允許遠端 URL");
  const id=(!ids.has(str(v.id,80))&&str(v.id,80))||uid();ids.add(id);
  const x=num(v.x,.1,0,.998),y=num(v.y,.1,0,.998);
  return {id,kind,label:str(v.label,70)||kind,x,y,
   w:num(v.w,.65,.002,1-x),h:num(v.h,.18,.002,1-y),
   color:hex(v.color),fill:hex(v.fill,"#E8E8E8"),opacity:num(v.opacity,1,0,1),
   ...(kind==="text"?{text:str(v.text,2000),fontSize:num(v.fontSize,65,12,300),fontWeight:num(v.fontWeight,700,100,900),align:["left","center","right"].includes(String(v.align))?v.align as "left"|"center"|"right":"left"}:{}),
   ...(kind!=="text"?{radius:num(v.radius,0,0,100)}:{}),
   ...(kind==="image"?{image}: {})
  };
 });
 return {version:1,id:str(d.id,80)||uid(),name:str(d.name,90)||"未命名作品",
  width:num(d.width,1080,200,4096),height:num(d.height,1350,200,4096),
  background:hex(d.background,"#FFFFFF"),updatedAt:num(d.updatedAt,Date.now(),0,Number.MAX_SAFE_INTEGER),layers};
}
export function parseLunaLibrary(raw:unknown):LunaLibrary{
 const d=rec(raw);const projects:LunaDoc[]=[];
 if(Array.isArray(d?.projects))for(const item of d.projects.slice(0,LUNA_MAX_PROJECTS)){try{projects.push(parseLuna(item));}catch{/* isolate bad data */}}
 const activeId=str(d?.activeId,80);
 return {projects,activeId:projects.some(p=>p.id===activeId)?activeId:projects[0]?.id||""};
}
export function lunaStorageKey(owner:string){return "vanilla.luna.local.v1."+encodeURIComponent(owner.slice(0,150)||"guest");}
export function moveLuna(doc:LunaDoc,id:string,x:number,y:number):LunaDoc{
 return {...doc,layers:doc.layers.map(l=>l.id===id?{...l,x:clamp(x,0,1-l.w),y:clamp(y,0,1-l.h)}:l),updatedAt:Date.now()};
}
export function orderLuna(doc:LunaDoc,id:string,step:-1|1):LunaDoc{
 const layers=[...doc.layers],i=layers.findIndex(x=>x.id===id),j=i+step;
 if(i<0||j<0||j>=layers.length)return doc;
 [layers[i],layers[j]]=[layers[j],layers[i]];return {...doc,layers,updatedAt:Date.now()};
}
export function duplicateLuna(doc:LunaDoc,id:string):LunaDoc{
 if(doc.layers.length>=LUNA_MAX_LAYERS)return doc;
 const i=doc.layers.findIndex(x=>x.id===id);if(i<0)return doc;
 const l=doc.layers[i],copy={...l,id:uid(),label:l.label+" 副本",x:clamp(l.x+.02,0,1-l.w),y:clamp(l.y+.02,0,1-l.h)};
 return {...doc,layers:[...doc.layers.slice(0,i+1),copy,...doc.layers.slice(i+1)],updatedAt:Date.now()};
}
/** Deliberately deterministic/offline; not a pretend AI service. */
export function promptLuna(prompt:string):LunaDoc{
 const text=prompt.trim().slice(0,300);
 const template:LunaTemplate=/講座|活動|課程|event/i.test(text)?"event":/醫美|品牌|產品|極簡|精品|minimal/i.test(text)?"minimal":"editorial";
 return {...createLuna(template,text||"LUNA DESIGN"),name:(text.slice(0,40)||"新作品")+" · LUNA"};
}
