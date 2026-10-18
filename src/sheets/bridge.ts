import {parseTable} from "../local-ai/smart-output";
const KEY="vanilla.sheets.table.inbox.v1";
export function openChatTableInSheets(markdown:string):boolean{
 const rows=parseTable(markdown);if(!rows)return false;
 sessionStorage.setItem(KEY,JSON.stringify(rows));
 window.dispatchEvent(new Event("vanilla-open-sheets"));
 return true;
}
export function takeChatTable():string[][]|null{
 try{
  const raw=sessionStorage.getItem(KEY);if(!raw)return null;sessionStorage.removeItem(KEY);
  const value=JSON.parse(raw) as unknown;
  if(!Array.isArray(value)||value.length===0||value.length>200||!value.every(r=>Array.isArray(r)&&r.length<=26&&r.every(c=>typeof c==="string"&&c.length<8000)))return null;
  return value as string[][];
 }catch{return null;}
}
