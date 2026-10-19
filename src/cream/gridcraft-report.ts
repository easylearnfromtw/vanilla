/** CREAM -> GridCraft transfer. This is a preview/report export, not reanalysis. */
import type {CreamResult,CreamMetric,CreamChartKind} from "./core.ts";

export type CreamGridCraftRequest={
 source:string;
 rowCount:number;
 metrics:Array<{key:string;n:number;missing:number;sum:number;mean:number;median:number;min:number;max:number;sampleStdDev:number|null}>;
 focusKey:string;
 points:Array<{row:number;label:string;value:number;x?:number}>;
 chartKind:CreamChartKind;
};

export function prepareCreamGridCraftReport(result:CreamResult, focus:CreamMetric, kind:CreamChartKind):CreamGridCraftRequest{
 if(!result.metrics.some(m=>m.key===focus.key))throw Error("選取的統計欄位不屬於這份 CREAM 結果");
 if(!focus.points.length)throw Error("這個欄位沒有可匯出的圖表數值");
 const points=focus.points.map(p=>({row:p.row,label:p.label,value:p.value,...(p.x===undefined?{}:{x:p.x})}));
 if(points.length>48||points.some(p=>!Number.isFinite(p.value)||p.x!==undefined&&!Number.isFinite(p.x)))
  throw Error("CREAM 圖表預覽含無效數字或超過 48 筆");
 // Native XY scatter only makes sense for the known matching axis in CREAM.
 const chartKind:CreamChartKind=kind==="scatter"&&result.scatterAxis?.yColumn!==focus.column?"bar":kind;
 if(chartKind==="scatter"&&points.some(p=>p.x===undefined))
  throw Error("資料不具備有效的散佈圖 X/Y 配對");
 const metrics=result.metrics.map(m=>({
  key:m.key,n:m.n,missing:m.missing,sum:m.sum,mean:m.mean,median:m.median,
  min:m.min,max:m.max,sampleStdDev:m.sampleStdDev,
 }));
 return {source:result.source,rowCount:result.rowCount,metrics,focusKey:focus.key,points,chartKind};
}
