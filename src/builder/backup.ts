import {loadFeatures,featureData,validateFeature,installFeature,writeFeatureData,removeFeature,
 type FeatureData,type FeatureSpec,MAX_ITEMS,MAX_RECORDS} from "./feature-schema.ts";

export type ExportedFeature={spec:FeatureSpec;data:FeatureData};
export type SelfBuildBackup={kind:"vanilla-self-build-backup";version:1;exportedAt:string;features:ExportedFeature[]};
export type ValidatedBackup={exportedAt:string;features:ExportedFeature[]};
function backupData():SelfBuildBackup{
 return {kind:"vanilla-self-build-backup",version:1,exportedAt:new Date().toISOString(),
  features:loadFeatures().map(spec=>({spec,data:featureData(spec.id)}))};
}
export function exportSelfBuildBackup():void{
 const payload=JSON.stringify(backupData(),null,2);
 const blob=new Blob([payload],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;a.download="vanilla-self-build-"+new Date().toISOString().slice(0,10)+".json";
 a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function safeData(raw:unknown,spec:FeatureSpec):FeatureData{
 if(!raw||typeof raw!=="object")return {items:[],records:[],notes:"",inputs:{}};
 const v=raw as Partial<FeatureData>;
 const items=spec.kind==="checklist"&&Array.isArray(v.items)?v.items.slice(0,MAX_ITEMS).flatMap(x=>{
  if(!x||typeof x!=="object"||typeof x.title!=="string")return [];
  return [{id:crypto.randomUUID(),title:x.title.slice(0,150),done:x.done===true}];
 }):[];
 const records=spec.kind==="tracker"&&Array.isArray(v.records)?v.records.slice(0,MAX_RECORDS).flatMap(x=>{
  if(!x||typeof x!=="object"||!x.values||typeof x.values!=="object")return [];
  const values:Record<string,string|boolean>={};
  for(const field of spec.fields){
   const value=x.values[field.id];
   if(field.type==="checkbox")values[field.id]=value===true||value==="true";
   else if(typeof value==="string"||typeof value==="number"){
    const string=String(value).slice(0,1000);
    values[field.id]=field.type==="number"&&string&&!Number.isFinite(Number(string))?"":string;
   }else values[field.id]="";
  }
  return [{id:crypto.randomUUID(),at:typeof x.at==="string"?x.at.slice(0,32):new Date().toISOString(),values}];
 }):[];
 const notes=spec.kind==="notes"&&typeof v.notes==="string"?v.notes.slice(0,20000):"";
 const inputs:Record<string,number>={};
 if(spec.kind==="calculator")for(const field of spec.fields){
  const value=v.inputs&&typeof v.inputs==="object"?v.inputs[field.id]:undefined;
  inputs[field.id]=typeof value==="number"&&Number.isFinite(value)?value:0;
 }
 return {items,records,notes,inputs};
}
export function validateSelfBuildBackup(input:unknown):ValidatedBackup{
 if(!input||typeof input!=="object")throw Error("備份不是有效的 JSON 物件");
 const payload=input as Partial<SelfBuildBackup>;
 if(payload.kind!=="vanilla-self-build-backup"||payload.version!==1||!Array.isArray(payload.features)){
  throw Error("這不是支援的 Vanilla Self-Build 備份版本");
 }
 if(payload.features.length>24)throw Error("單次最多能匯入 24 個模組");
 const features=payload.features.map((entry,i)=>{
  if(!entry||typeof entry!=="object")throw Error("第 "+(i+1)+" 個模組格式無效");
  const raw=(entry as ExportedFeature).spec;
  const clean=validateFeature(raw);
  return {spec:clean,data:safeData((entry as ExportedFeature).data,clean)};
 });
 return {exportedAt:typeof payload.exportedAt==="string"?payload.exportedAt.slice(0,40):"",features};
}
export function importSelfBuildBackup(backup:ValidatedBackup):number{
 const existing=loadFeatures();
 if(existing.length+backup.features.length>24)throw Error("本機模組上限 24 個。請先移除部分模組，或只匯入需要的模組");
 const installed:string[]=[];
 try{
  for(const entry of backup.features){
   const clean=validateFeature(entry.spec);
   installFeature(clean);
   installed.push(clean.id);
   writeFeatureData(clean.id,entry.data);
  }
  return installed.length;
 }catch(e){
  for(const id of installed)try{removeFeature(id,true);}catch{}
  throw e;
 }
}
