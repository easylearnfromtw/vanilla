/** Conversation lifecycle shared by the sidebar "新對話", the in-chat button and 「最近」.
 * Never deletes a conversation outright: the current one is archived on this device first.
 */
import {chatStorageKey,signedChatAccount,markChatSyncReset} from "../vault/chat-sync";
import {attachmentOwner} from "../library/attachment-vault";
import {archiveConversation,takeConversation,listConversations,indexedDbArchiveStore,type ArchiveSummary,type ArchiveTurn,type ChatMode} from "../library/conversation-archive";

export const CHAT_MODE_KEY="vanilla.chat.private.enabled";
export const CHAT_ARCHIVE_EVENT="vanilla-chat-archive-changed";
const store=indexedDbArchiveStore();
export function currentChatMode():ChatMode{try{return localStorage.getItem(CHAT_MODE_KEY)==="true"?"private":"normal";}catch{return "normal";}}
function owner(){return attachmentOwner(signedChatAccount());}
function readTurns(mode:ChatMode):ArchiveTurn[]{
 try{const v:unknown=JSON.parse(localStorage.getItem(chatStorageKey(mode==="private"))||"[]");return Array.isArray(v)?v as ArchiveTurn[]:[];}catch{return [];}
}
/** Archive the active conversation of the current mode, then clear it. */
export async function startNewConversation(mode:ChatMode=currentChatMode()):Promise<{archived:boolean;error?:string}>{
 const turns=readTurns(mode);
 let archived=false,error:string|undefined;
 if(turns.length){
  try{archived=Boolean(await archiveConversation(store,owner(),mode,turns));}
  catch(e){error=e instanceof Error?e.message:String(e);}
  // Never drop a conversation we could not archive.
  if(error)return {archived:false,error};
 }
 try{localStorage.removeItem(chatStorageKey(mode==="private"));}catch{}
 if(mode==="normal")markChatSyncReset();
 window.dispatchEvent(new Event(CHAT_ARCHIVE_EVENT));
 return {archived};
}
export async function recentConversations(mode:ChatMode=currentChatMode()):Promise<ArchiveSummary[]>{
 try{return await listConversations(store,owner(),mode);}catch{return [];}
}
/** Swap: archive what is open now, then load the chosen conversation. */
export async function reopenConversation(id:string,mode:ChatMode=currentChatMode()):Promise<void>{
 const item=await store.get(id);
 if(!item||item.owner!==owner())throw Error("找不到這段對話（可能屬於其他帳號或已刪除）");
 const current=readTurns(mode);
 // Order matters: archive the open conversation first, write the chosen one, and only then
 // remove it from the archive — a failure at any step loses nothing.
 if(current.length)await archiveConversation(store,owner(),mode,current);
 localStorage.setItem(chatStorageKey(mode==="private"),JSON.stringify(item.turns));
 await store.remove(id);
 if(mode==="normal")markChatSyncReset();
 window.dispatchEvent(new Event(CHAT_ARCHIVE_EVENT));
}
export async function deleteArchivedConversation(id:string):Promise<void>{
 await takeConversation(store,id,owner());
 window.dispatchEvent(new Event(CHAT_ARCHIVE_EVENT));
}
