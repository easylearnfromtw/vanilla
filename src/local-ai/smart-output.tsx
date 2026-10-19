import type {ReactNode} from "react";
import {parseTable} from "./table-display";
export {parseTable,stripRenderedTable} from "./table-display";
function download(content:string,name:string,type:string){
 const url=URL.createObjectURL(new Blob([content],{type}));
 const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function exportText(source:string,format:"txt"|"md"|"html"|"csv"){
 const rows=parseTable(source);
 if(format==="csv"){
  if(!rows)throw new Error("此回答沒有可匯出的 Markdown 表格");
  download("\uFEFF"+rows.map(r=>r.map(c=>'"'+c.replaceAll('"','""')+'"').join(",")).join("\r\n"),"vanilla-table.csv","text/csv;charset=utf-8");return;
 }
 if(format==="html"){
  const escaped=source.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  download('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>Vanilla 文件</title><body><main style="max-width:800px;margin:50px auto;font:16px/1.8 system-ui;white-space:pre-wrap">'+escaped+'</main></body></html>',"vanilla-document.html","text/html;charset=utf-8");return;
 }
 download(source,"vanilla-answer."+format,"text/plain;charset=utf-8");
}
export function renderTable(source:string):ReactNode{
 const rows=parseTable(source);if(!rows)return null;
 return <div className="smart-table-wrap"><table className="smart-table"><thead><tr>{rows[0].map((c,i)=><th key={i}>{c}</th>)}</tr></thead><tbody>{rows.slice(1).map((row,i)=><tr key={i}>{rows[0].map((_,j)=><td key={j}>{row[j]||""}</td>)}</tr>)}</tbody></table></div>;
}

