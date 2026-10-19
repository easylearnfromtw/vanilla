/** Small, explicit data model for real Sheets previews in chat. */
export type SheetPreviewData={name:string;rows:string[][]};
export function makeSheetPreview(name:string,rows:readonly (readonly string[])[]):SheetPreviewData{
 const width=Math.min(26,Math.max(1,...rows.map(row=>row.length)));
 if(!rows.length||rows.length>200)throw Error("表格超出 Vanilla Sheets 的 200 列上限");
 const copy=rows.map(row=>Array.from({length:width},(_,i)=>String(row[i]??"").slice(0,1000)));
 return {name:name.trim().slice(0,70)||"對話建立的表格",rows:copy};
}
