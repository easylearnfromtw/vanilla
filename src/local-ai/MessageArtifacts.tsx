import type {ChatTurn} from "./engine";
import SheetPreview from "./SheetPreview";
import CreamMessage from "../cream/CreamMessage";
import {parseTable,renderTable} from "./smart-output";
import SwipeDeck,{type SwipeItem} from "./SwipeDeck";
import {ExternalLink,BookOpen} from "lucide-react";

export function safeExternalURL(input:string):string|null{
 try{
  const url=new URL(input);
  if(url.protocol!=="https:"&&url.protocol!=="http:")return null;
  if(url.username||url.password)return null;
  return url.toString();
 }catch{return null;}
}
/** Real, swipeable output blocks, not a second text copy of the same table. */
export default function MessageArtifacts({turn,onOpenTable,onOpenSheet,onOpenCream}:{
 turn:ChatTurn;
 onOpenTable:(content:string)=>void;
 onOpenSheet:(sheet:NonNullable<ChatTurn["sheet"]>)=>void;
 onOpenCream?:(result:NonNullable<ChatTurn["cream"]>)=>void;
}){
 if(turn.role!=="assistant")return null;
 const items:SwipeItem[]=[];
 if(parseTable(turn.content)){
  items.push({id:"table",label:"表格",node:<div className="swipe-artifact-table">{renderTable(turn.content)}<button type="button" className="artifact-action" onClick={()=>onOpenTable(turn.content)}>在 Vanilla Sheets 開啟與編輯 ↗</button></div>});
 }
 if(turn.sheet)items.push({id:"sheet",label:"工作簿",node:<SheetPreview sheet={turn.sheet} onEdit={()=>onOpenSheet(turn.sheet!)}/>});
 if(turn.cream)items.push({id:"cream",label:"CREAM 互動分析",node:<CreamMessage result={turn.cream} onOpenSheets={onOpenCream?()=>onOpenCream(turn.cream!):undefined}/>});
 for(const [index,source] of (turn.webSources||[]).entries()){
  const href=safeExternalURL(source.url);
  if(!href)continue;
  items.push({id:"source-"+index,label:"來源 "+(index+1),node:<div className="source-artifact">
   <BookOpen size={17}/><div><strong>{source.title||"參考來源"}</strong><p>{source.kind==="full"?"已讀取網頁正文":"僅取得搜尋摘要，尚未讀取全文"}</p>
    <a href={href} target="_blank" rel="noopener noreferrer">查看原始網頁 <ExternalLink size={13}/></a>
   </div>
  </div>});
 }
 if(!items.length)return null;
 return <SwipeDeck items={items} label="回答的表格、圖表與來源"/>;
}
