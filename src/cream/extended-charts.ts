import type {CreamPoint} from "./core";
/** Pure chart data transformations. Use only visible deterministic values. */
export type PieSlice={label:string;value:number;percent:number;start:number;end:number};
export type PieModel={slices:PieSlice[];total:number;error?:string;visibleCount:number};
export function pieSeries(points:readonly CreamPoint[]):PieModel{
 if(points.some(p=>!Number.isFinite(p.value)||p.value<0))return {slices:[],total:0,visibleCount:points.length,error:"圓餅圖不接受負值或非有限數值；請改用長條圖。"};
 const sums=new Map<string,number>();
 for(const point of points){const label=point.label.trim()||"未命名";sums.set(label,(sums.get(label)||0)+point.value);}
 const total=[...sums.values()].reduce((a,b)=>a+b,0);
 if(!Number.isFinite(total)||total<=0)return {slices:[],total:0,visibleCount:points.length,error:"圓餅圖的有效數值總和必須大於 0。"};
 let start=0;
 const slices=[...sums.entries()].filter(([,v])=>v>0).map(([label,value])=>{const fraction=value/total;const slice={label,value,percent:fraction*100,start,end:start+fraction*360};start=slice.end;return slice;});
 return {slices,total,visibleCount:points.length};
}
export type NumberLinePoint={label:string;value:number;row:number;x:number;stack:number};
export function numberLineSeries(points:readonly CreamPoint[]):{points:NumberLinePoint[];min:number;max:number}{
 const valid=points.filter(p=>Number.isFinite(p.value));
 if(!valid.length)return {points:[],min:0,max:1};
 const min=Math.min(...valid.map(x=>x.value)),max=Math.max(...valid.map(x=>x.value));
 const span=max-min||1;
 const stacks=new Map<string,number>();
 const out=valid.map(p=>{const key=p.value.toPrecision(12);const stack=stacks.get(key)||0;stacks.set(key,stack+1);return {row:p.row,label:p.label,value:p.value,x:(p.value-min)/span,stack};});
 return {points:out,min,max};
}
