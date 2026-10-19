import {appendNoodles,sanitizeNoodlesState,type NoodlesObservation,type NoodlesState} from "./core.ts";
import {signedChatAccount} from "../vault/chat-sync";

/** The account identity selects an independent browser-local aggregate store.
 * Guests only use per-tab sessionStorage, never the household's persistent store.
 * No raw prompt, response, name, attachment, API token, or health data is stored.
 */
function key(){
 const owner=signedChatAccount().trim().toLowerCase();
 if(!owner)return {name:"vanilla.noodles.guest.tab.v1",guest:true};
 // The hash is a namespace, NOT an encryption or access-control mechanism.
 let hash=2166136261;for(let i=0;i<owner.length;i++)hash=Math.imul(hash^owner.charCodeAt(i),16777619);
 return {name:"vanilla.noodles.user."+((hash>>>0).toString(16))+".v1",guest:false};
}
function store(){const id=key();return {id,storage:id.guest?sessionStorage:localStorage};}
export function noodlesScopeLabel():string{return key().guest?"本分頁訪客（不長期保存）":"目前 Google 帳戶（僅本裝置）";}
export function readNoodles():NoodlesState{
 try{const {id,storage}=store();return sanitizeNoodlesState(JSON.parse(storage.getItem(id.name)||"null"));}catch{return sanitizeNoodlesState(null);}
}
function writeNoodles(state:NoodlesState){
 const {id,storage}=store();
 storage.setItem(id.name,JSON.stringify(sanitizeNoodlesState(state)));
 window.dispatchEvent(new Event("vanilla-noodles-changed"));
}
export function noodlesEnabled():boolean{return readNoodles().enabled;}
export function recordNoodles(entry:NoodlesObservation,privateMode=false):void{
 if(privateMode)return;
 try{const current=readNoodles();if(current.enabled)writeNoodles(appendNoodles(current,entry));}catch{}
}
export function setNoodlesEnabled(enabled:boolean){
 const before=readNoodles();writeNoodles({...before,enabled});
}
export function resetNoodles(){writeNoodles({version:1,enabled:true,observations:[]});}
export function exportNoodlesSummary():string{
 // JSON is only aggregate signal metadata, NO conversation content.
 const x=readNoodles();
 return JSON.stringify({exportedAt:new Date().toISOString(),
  warning:"NOODLES aggregate metadata only; user messages are not included",
  ...x},null,2);
}
