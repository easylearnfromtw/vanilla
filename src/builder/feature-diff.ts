import type {FeatureSpec} from "./feature-schema.ts";

export type FeatureDifference={kind:"safe"|"review";label:string};
export type FeatureChangeSet={changes:FeatureDifference[];risk:boolean};
export function compareFeatureSpecs(before:FeatureSpec,after:FeatureSpec):FeatureChangeSet{
 const changes:FeatureDifference[]=[];
 if(before.name!==after.name)changes.push({kind:"safe",label:"名稱："+before.name+" → "+after.name});
 if(before.description!==after.description)changes.push({kind:"safe",label:"已更新功能說明"});
 if(before.kind!==after.kind)changes.push({kind:"review",label:"模組類型："+before.kind+" → "+after.kind+"；舊資料可能暫時無法顯示"});
 const oldMap=new Map(before.fields.map(x=>[x.id,x]));
 const newMap=new Map(after.fields.map(x=>[x.id,x]));
 for(const f of before.fields){
  const updated=newMap.get(f.id);
  if(!updated){changes.push({kind:"review",label:"移除欄位："+f.label+"（"+f.id+"）；既有紀錄中的值不會自動轉換"});continue;}
  if(updated.type!==f.type)changes.push({kind:"review",label:"欄位型別："+f.label+" 由 "+f.type+" → "+updated.type});
  if(updated.label!==f.label)changes.push({kind:"safe",label:"欄位名稱："+f.label+" → "+updated.label});
  if(updated.unit!==f.unit)changes.push({kind:"safe",label:"欄位單位："+f.label+" 已調整"});
 }
 for(const f of after.fields){if(!oldMap.has(f.id))changes.push({kind:"safe",label:"新增欄位："+f.label+"（"+f.id+"）"});}
 if(before.formula!==after.formula)changes.push({kind:"review",label:"已修改計算公式，原本的結果可能改變"});
 if(before.kind==="checklist"&&after.kind==="checklist"){
  const beforeItems=(before.initialItems||[]).join("\n"),afterItems=(after.initialItems||[]).join("\n");
  if(beforeItems!==afterItems)changes.push({kind:"safe",label:"更新預設清單（不會覆寫已建立的待辦事項）"});
 }
 if(!changes.length)changes.push({kind:"safe",label:"新版設定與目前相同，沒有實際差異"});
 return {changes,risk:changes.some(x=>x.kind==="review")};
}
