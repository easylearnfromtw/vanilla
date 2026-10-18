import {useEffect,useState} from "react";
import {Cloud,RefreshCcw,ShieldAlert} from "lucide-react";
import {driveSession} from "../workspace/cloud-drive";
import {chatSyncEnabled,setChatSyncEnabled,initializeChatSync,pushChatSync,CHAT_SYNC_EVENT} from "./chat-sync";
export default function ChatSyncSettings(){
 const [account,setAccount]=useState(driveSession);
 const [enabled,setEnabled]=useState(chatSyncEnabled);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const onAccount=()=>{setAccount(driveSession());setEnabled(chatSyncEnabled());};
  const onStatus=(event:Event)=>setMessage(String((event as CustomEvent<string>).detail||""));
  window.addEventListener("vanilla-drive-connected",onAccount);
  window.addEventListener("vanilla-drive-disconnected",onAccount);
  window.addEventListener(CHAT_SYNC_EVENT,onStatus);
  return()=>{window.removeEventListener("vanilla-drive-connected",onAccount);window.removeEventListener("vanilla-drive-disconnected",onAccount);window.removeEventListener(CHAT_SYNC_EVENT,onStatus);};
 },[]);
 async function change(next:boolean){
  if(next&&!window.confirm("是否啟用一般對話自動備份？聊天內容會以可讀 JSON 儲存在你的 Google Drive appDataFolder，目前不是端對端加密。私密模式永不上傳。與其他裝置發生不同版本時會暫停覆寫。"))return;
  try{
   setChatSyncEnabled(next);setEnabled(next);
   if(next){setBusy(true);await initializeChatSync();setMessage("已嘗試初始化雲端對話；登入後可回到聊天頁。");}
   else setMessage("已停止一般對話的自動同步，既有雲端快照不會被自動刪除");
  }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 return <section className="chat-sync-settings"><header><Cloud size={20}/><div><h3>一般對話的 Google Drive 同步</h3><p>{account?"目前帳號："+account.email:"請先使用上方 Google 登入。"}</p></div></header>
  <label className="chat-sync-check"><input type="checkbox" disabled={!account||busy} checked={enabled} onChange={e=>void change(e.target.checked)}/><span>同意同步此帳號的一般對話</span></label>
  {enabled&&<button type="button" disabled={!account||busy} onClick={()=>{setBusy(true);void pushChatSync().finally(()=>setBusy(false));}}><RefreshCcw size={15}/>立即同步</button>}
  <p className="chat-sync-warning"><ShieldAlert size={16}/>不包含私密模式；同步只在有效 Google OAuth 工作階段內進行。關閉頁面後，無背景自動執行。手機清除瀏覽器資料可能丟失未完成同步的內容。此功能不等於無限容量或可無條件永久保留。</p>
  <p role="status" className="chat-sync-status">{message}</p>
 </section>;
}
