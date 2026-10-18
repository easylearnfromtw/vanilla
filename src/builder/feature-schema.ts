/**
 * Safe, declarative Vanilla extensions. No JavaScript, HTML, network permissions,
 * secret access, repository writes, or dynamic imports from generated content.
 */
export type FeatureKind="checklist"|"tracker"|"calculator"|"notes";
export type FieldType="text"|"number"|"date"|"checkbox";
export type FeatureField={id:string;label:string;type:FieldType;unit?:string};
export type FeatureSpec={
 version:1;id:string;revision:number;name:string;description:string;
 kind:FeatureKind;fields:FeatureField[];formula?:string;
 initialItems?:string[];createdAt:string;updatedAt:string;
};
export type FeatureData={items:{id:string;title:string;done:boolean}[];records:{id:string;at:string;values:Record<string,string|boolean>}[];notes:string;inputs:Record<string,number>};
const SPECS_KEY="vanilla.builders.features.v1";
const DATA_KEY="vanilla.builders.data.v1";
const MAX_FEATURES=24;
export const MAX_RECORDS=200;
export const MAX_ITEMS=200;
const safeText=(text:unknown,max:number)=>typeof text==="string"?text.trim().slice(0,max):"";
const validId=(id:string)=>/^[a-z][a-z0-9_]{0,25}$/.test(id);
export const EMPTY_DATA:FeatureData={items:[],records:[],notes:"",inputs:{}};
export function featureData(id:string):FeatureData{
 try{
  const raw=localStorage.getItem(DATA_KEY);const all=JSON.parse(raw||"{}") as Record<string,unknown>;
  const v=all[id] as Partial<FeatureData>|undefined;
  return {items:Array.isArray(v?.items)?v.items.filter(x=>x&&typeof x.id==="string"&&typeof x.title==="string"&&typeof x.done==="boolean").slice(0,MAX_ITEMS):[],
   records:Array.isArray(v?.records)?v.records.filter(x=>x&&typeof x.id==="string"&&x.values&&typeof x.values==="object").slice(0,MAX_RECORDS):[],
   notes:typeof v?.notes==="string"?v.notes.slice(0,20000):"",
   inputs:v?.inputs&&typeof v.inputs==="object"?v.inputs:{}};
 }catch{return {...EMPTY_DATA,items:[],records:[],inputs:{}};}
}
export function writeFeatureData(id:string,value:FeatureData){
 const all=(()=>{try{return JSON.parse(localStorage.getItem(DATA_KEY)||"{}") as Record<string,FeatureData>;}catch{return {} as Record<string,FeatureData>;}})();
 all[id]={items:value.items.slice(-MAX_ITEMS),records:value.records.slice(-MAX_RECORDS),notes:value.notes.slice(0,20000),inputs:value.inputs};
 localStorage.setItem(DATA_KEY,JSON.stringify(all));
 window.dispatchEvent(new Event("vanilla-feature-data-changed"));
}
export function validateFeature(input:unknown,existing?:FeatureSpec):FeatureSpec{
 if(!input||typeof input!=="object")throw Error("AI 沒有回傳有效的功能設計");
 const src=input as Record<string,unknown>;
 const kind=src.kind;
 if(!["checklist","tracker","calculator","notes"].includes(String(kind)))throw Error("目前僅支援：待辦清單、追蹤器、計算器、筆記");
 const title=safeText(src.name,36),description=safeText(src.description,180);
 if(title.length<2)throw Error("功能名稱至少需要兩個字");
 const type=kind as FeatureKind;
 const rawFields=Array.isArray(src.fields)?src.fields:[];
 if(rawFields.length>12)throw Error("每個功能最多 12 個輸入欄位");
 const fields:FeatureField[]=rawFields.map((v,i)=>{
  if(!v||typeof v!=="object")throw Error("欄位格式有誤");
  const f=v as Record<string,unknown>;
  const id=safeText(f.id,26).toLowerCase(),label=safeText(f.label,40),fieldType=f.type;
  if(!validId(id)||!label||!["text","number","date","checkbox"].includes(String(fieldType)))throw Error("欄位 "+(i+1)+" 不合法：ID 必須是英文字母開頭，並指定正確類型");
  return {id,label,type:fieldType as FieldType,unit:safeText(f.unit,16)||undefined};
 });
 if(new Set(fields.map(x=>x.id)).size!==fields.length)throw Error("欄位 ID 不能重複");
 if(type==="tracker"&&!fields.length)throw Error("追蹤器必須有至少一個資料欄位");
 if(type==="calculator"&&(!fields.length||fields.some(x=>x.type!=="number")))throw Error("計算器的輸入欄位必須全部是 number");
 let formula=type==="calculator"?safeText(src.formula,250):undefined;
 if(type==="calculator"){if(!formula)throw Error("計算器必須指定運算公式");testExpression(formula,Object.fromEntries(fields.map(x=>[x.id,1])));}
 const initialItems=type==="checklist"&&Array.isArray(src.initialItems)?
  src.initialItems.slice(0,30).map(x=>safeText(x,120)).filter(Boolean):[];
 const now=new Date().toISOString();
 return {version:1,id:existing?.id||crypto.randomUUID(),revision:existing?existing.revision+1:1,name:title,description,
  kind:type,fields:fields.length&&["tracker","calculator"].includes(type)?fields:[],
  formula,initialItems,createdAt:existing?.createdAt||now,updatedAt:now};
}
export function loadFeatures():FeatureSpec[]{
 try{
  const input:unknown=JSON.parse(localStorage.getItem(SPECS_KEY)||"[]");
  if(!Array.isArray(input))return [];
  return input.slice(0,MAX_FEATURES).flatMap(x=>{try{
   const validated=validateFeature(x);
   const original=x as Partial<FeatureSpec>;
   return [{...validated,id:typeof original.id==="string"?original.id:validated.id,
     revision:typeof original.revision==="number"?original.revision:1,createdAt:typeof original.createdAt==="string"?original.createdAt:validated.createdAt,updatedAt:typeof original.updatedAt==="string"?original.updatedAt:validated.updatedAt}];
  }catch{return [];}});
 }catch{return [];}
}
export function installFeature(feature:FeatureSpec){
 const list=loadFeatures(),index=list.findIndex(x=>x.id===feature.id);
 if(index<0&&list.length>=MAX_FEATURES)throw Error("本機功能數量上限為 24 個，請先移除舊功能");
 const next=index<0?[...list,feature]:list.map(x=>x.id===feature.id?feature:x);
 localStorage.setItem(SPECS_KEY,JSON.stringify(next));
 if(index<0&&feature.kind==="checklist"&&feature.initialItems?.length){const data=featureData(feature.id);if(!data.items.length){writeFeatureData(feature.id,{...data,items:feature.initialItems.map(title=>({id:crypto.randomUUID(),title,done:false}))});}}
 window.dispatchEvent(new Event("vanilla-features-changed"));
}
export function removeFeature(id:string,deleteData=false){
 localStorage.setItem(SPECS_KEY,JSON.stringify(loadFeatures().filter(x=>x.id!==id)));
 if(deleteData){
  try{const all=JSON.parse(localStorage.getItem(DATA_KEY)||"{}") as Record<string,unknown>;delete all[id];localStorage.setItem(DATA_KEY,JSON.stringify(all));}catch{}
 }
 window.dispatchEvent(new Event("vanilla-features-changed"));
}
export function testExpression(source:string,inputs:Record<string,number>):number{
 // Strict arithmetic grammar. No eval/Function; no member access or function calls.
 const tokens=source.match(/\s*(?:\d+(?:\.\d+)?|[a-z][a-z0-9_]*|[()+*/-])\s*/gi);
 if(!tokens||tokens.join("").replace(/\s/g,"").toLowerCase()!==source.replace(/\s/g,"").toLowerCase())throw Error("公式含有不支援的符號");
 const parts=tokens.map(x=>x.trim());let i=0;
 function atom():number{
  const token=parts[i++];if(token==="-")return -atom();if(token==="+")return atom();
  if(token==="("){const val=expr();if(parts[i++]!==")")throw Error("公式括號不成對");return val;}
  if(/^\d/.test(token||""))return Number(token);
  if(/^[a-z][a-z0-9_]*$/i.test(token||"")){
   if(!Object.hasOwn(inputs,token))throw Error("公式使用了未定義的欄位："+token);
   return Number(inputs[token]);
  }
  throw Error("公式語法錯誤");
 }
 function term():number{let a=atom();while(parts[i]==="*"||parts[i]==="/"){const op=parts[i++],b=atom();if(op==="/"&&b===0)throw Error("不可除以零");a=op==="*"?a*b:a/b;}return a;}
 function expr():number{let a=term();while(parts[i]==="+"||parts[i]==="-"){const op=parts[i++],b=term();a=op==="+"?a+b:a-b;}return a;}
 const value=expr();if(i!==parts.length||!Number.isFinite(value))throw Error("公式無法產生有效數字");
 return value;
}
export function proposalFromAI(source:string,existing?:FeatureSpec):FeatureSpec{
 // Only a JSON descriptor is permitted, not executable source code.
 const cleaned=source.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
 let parsed:unknown;
 try{parsed=JSON.parse(cleaned);}catch{
  const a=cleaned.indexOf("{"),b=cleaned.lastIndexOf("}");
  if(a<0||b<=a)throw Error("AI 未產生可解析的 JSON 功能規格");
  try{parsed=JSON.parse(cleaned.slice(a,b+1));}catch{throw Error("AI 回傳格式不正確，請重新生成");}
 }
 return validateFeature(parsed,existing);
}
export function featureTemplate(kind:FeatureKind):FeatureSpec{
 const templates:Record<FeatureKind,unknown>={
  checklist:{name:"我的待辦清單",description:"新增任務、標記完成、整理每天的事項。",kind:"checklist",initialItems:["第一項任務"],fields:[]},
  tracker:{name:"日常紀錄",description:"記錄日期、項目和數值，支援 CSV 匯出。",kind:"tracker",fields:[{id:"date",label:"日期",type:"date"},{id:"item",label:"項目",type:"text"},{id:"value",label:"數值",type:"number"}]},
  calculator:{name:"自訂計算器",description:"輸入數值，即時計算結果。",kind:"calculator",fields:[{id:"price",label:"單價",type:"number"},{id:"quantity",label:"數量",type:"number"}],formula:"price*quantity"},
  notes:{name:"我的筆記",description:"在此裝置儲存隨手筆記。",kind:"notes",fields:[]}
 };
 return validateFeature(templates[kind]);
}
