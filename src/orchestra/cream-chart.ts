/** CREAM -> Orchestra deterministic line chart, no model or remote renderer. */
export type OrchestraChart={label:string;unit:string;points:readonly {date:string;value:number}[]};
export const escapeSvg=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");

/** A standalone, valid SVG file: bounded data, readable Traditional Chinese labels. */
export function creamLineSvg(input:OrchestraChart):string{
 const points=input.points.filter(p=>Number.isFinite(p.value)&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)).slice(-90);
 if(points.length<2)throw Error("至少需要兩筆具有日期的數據才能建立數線圖");
 const ys=points.map(p=>p.value);
 const min=Math.min(...ys),max=Math.max(...ys),span=Math.max(1e-9,max-min);
 const x0=110,y0=130,w=720,h=270;
 const x=(index:number)=>x0+(index/(points.length-1))*w;
 const y=(value:number)=>y0+(max-value)/span*h;
 const path=points.map((p,i)=>(i?"L":"M")+x(i).toFixed(2)+" "+y(p.value).toFixed(2)).join(" ");
 const safeTitle=escapeSvg(input.label.slice(0,150)),safeUnit=escapeSvg(input.unit.slice(0,40));
 const minLabel=escapeSvg(points[0].date),maxLabel=escapeSvg(points[points.length-1].date);
 const ticks=Array.from({length:5},(_,i)=>{
  const value=max-i*span/4,pos=y0+i*h/4;
  return '<line x1="'+x0+'" x2="'+(x0+w)+'" y1="'+pos+'" y2="'+pos+'" stroke="#DAD2C6"/>'+
   '<text x="100" y="'+(pos+4)+'" text-anchor="end" fill="#60594F" font-size="13">'+value.toFixed(2)+'</text>';
 }).join("");
 return '<?xml version="1.0" encoding="UTF-8"?>'+
 '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="520" viewBox="0 0 960 520" role="img" aria-label="'+safeTitle+'">'+
 '<rect width="960" height="520" fill="#F8F6F2"/>'+
 '<text x="60" y="45" fill="#AF4634" font-family="sans-serif" font-size="13" letter-spacing="2">CREAM / ORCHESTRA</text>'+
 '<text x="60" y="93" fill="#24211F" font-family="sans-serif" font-weight="700" font-size="32">'+safeTitle+'</text>'+
 '<text x="60" y="115" fill="#60594F" font-family="sans-serif" font-size="14">單位：'+safeUnit+' · 觀測數 '+points.length+'</text>'+
 ticks+
 '<path d="'+path+'" fill="none" stroke="#AF4634" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>'+
 '<circle cx="'+x(points.length-1).toFixed(2)+'" cy="'+y(points[points.length-1].value).toFixed(2)+'" r="6" fill="#AF4634"/>'+
 '<text x="'+x0+'" y="430" fill="#60594F" font-family="sans-serif" font-size="14">'+minLabel+'</text>'+
 '<text x="'+(x0+w)+'" y="430" text-anchor="end" fill="#60594F" font-family="sans-serif" font-size="14">'+maxLabel+'</text>'+
 '<text x="60" y="486" fill="#60594F" font-family="sans-serif" font-size="12">由 CREAM 已保存的數值決定性繪製；不代表額外推論。</text></svg>';
}
export function downloadCreamSvg(input:OrchestraChart):void{
 const content=creamLineSvg(input);
 const blob=new Blob([content],{type:"image/svg+xml;charset=utf-8"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="CREAM_Orchestra_chart.svg";
 document.body.appendChild(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),15000);
}
