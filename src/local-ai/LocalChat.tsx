import {useState,useRef,useEffect} from "react";
import {ArrowUp,Download,RotateCcw,Sparkles,Copy,Check,ChevronDown} from "lucide-react";
import {chooseProvider,generateCloudReply,availableProviders} from "../vault/providers";
import {detectLocalAICapabilities} from "./capabilities";
import {generateLocalReply,isLocalModelReady,loadLocalModel,type ChatTurn,LOCAL_MODEL} from "./engine";
const STORAGE_KEY="vanilla.chat.history.v1";
const PRIVATE_KEY="vanilla.chat.private.v1";
const MODE_KEY="vanilla.chat.private.enabled";
function restoreMode(){try{return localStorage.getItem(MODE_KEY)==="true";}catch{return false;}}
function restoreHistory(key=STORAGE_KEY):ChatTurn[]{
  try{const raw=localStorage.getItem(key);if(!raw)return [];const parsed:unknown=JSON.parse(raw);return Array.isArray(parsed)?parsed.filter((x):x is ChatTurn=>Boolean(x&&typeof x==="object"&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string")):[];}catch{return [];}
}
export default function LocalChat(){
const [privateMode,setPrivateMode]=useState(restoreMode);
const [history,setHistory]=useState<ChatTurn[]>(()=>restoreHistory(restoreMode()?PRIVATE_KEY:STORAGE_KEY));
const [draft,setDraft]=useState("");
const [busy,setBusy]=useState(false);
const [loadingModel,setLoadingModel]=useState(false);
const [progress,setProgress]=useState(0);
const [status,setStatus]=useState(isLocalModelReady()?"本地模型已載入":"尚未下載模型");
const [ready,setReady]=useState(isLocalModelReady());
const [modelExpanded,setModelExpanded]=useState(false);
const [modelError,setModelError]=useState(false);
const [storageError,setStorageError]=useState(false);
const [providers,setProviders]=useState(availableProviders);
useEffect(()=>{const update=()=>setProviders(availableProviders());window.addEventListener("vanilla-providers-changed",update);return()=>window.removeEventListener("vanilla-providers-changed",update);},[]);
const [copied,setCopied]=useState<number|null>(null);
const bottomRef=useRef<HTMLDivElement>(null);
const capabilities=detectLocalAICapabilities();
useEffect(()=>{
  if(!capabilities.webgpu||isLocalModelReady())return;
  let active=true;
  setLoadingModel(true);
  setModelError(false);
  setStatus("正在背景準備本地模型…");
  void loadLocalModel((message,value)=>{
    if(active){setStatus(message);setProgress(value);}
  }).then(()=>{
    if(active){setReady(true);setStatus("模型已就緒 · 本地推論");setLoadingModel(false);}
  }).catch(error=>{
    if(active){setStatus(error instanceof Error?error.message:"模型載入失敗");setModelError(true);setLoadingModel(false);}
  });
  return ()=>{active=false;};
},[capabilities.webgpu]);
useEffect(()=>{try{localStorage.setItem(privateMode?PRIVATE_KEY:STORAGE_KEY,JSON.stringify(history));setStorageError(false);}catch{setStorageError(true);}},[history,privateMode]);
useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth",block:"end"});},[history]);
function switchPrivacy(){
  if(busy)return;
  const next=!privateMode;
  try{localStorage.setItem(MODE_KEY,String(next));}catch{setStorageError(true);return;}
  setHistory(restoreHistory(next?PRIVATE_KEY:STORAGE_KEY));
  setPrivateMode(next);
  setDraft("");
}
async function initialize(){
setLoadingModel(true);setModelError(false);
try{await loadLocalModel((message,value)=>{setStatus(message);setProgress(value);});setReady(true);setStatus("模型已就緒 · 本地推論");setModelExpanded(false);}
catch(error){setStatus(error instanceof Error?error.message:"模型載入失敗");setModelError(true;}
finally{setLoadingModel(false);}
}
async function send(value=draft){
const question=value.trim();
if(!question||busy||(!ready&&(privateMode||providers.length===0)))return;
const next:ChatTurn[]=[...history,{role:"user",content:question}];
setHistory([...next,{role:"assistant",content:""}]);setDraft("");setBusy(true);
try{
const route=privateMode?"local":chooseProvider(question);
const answer=route==="local"?await generateLocalReply(next,text=>setHistory([...next,{role:"assistant",content:text}])):await generateCloudReply(route,next);
setHistory([...next,{role:"assistant",content:answer||"（模型沒有產生內容）"}]);
}catch(error){setHistory([...next,{role:"assistant",content:"生成失敗："+(error instanceof Error?error.message:"未知錯誤")}]);}
finally{setBusy(false);}
}
async function copyMessage(content:string,index:number){try{await navigator.clipboard.writeText(content);setCopied(index);}catch{setCopied(null);}}
return <section className="chat">
{(modelError||!capabilities.webgpu)&&<div className="model-bar"><div className="model-summary"><span className="model-dot"/><span>本地 AI 暫時無法啟動</span><button type="button" className="model-detail-toggle" aria-label="模型錯誤詳情" aria-expanded={modelExpanded} onClick={()=>setModelExpanded(!modelExpanded)}><ChevronDown size={15}/></button></div><button className="model-action" type="button" disabled={loadingModel||!capabilities.webgpu} onClick={initialize}><RotateCcw size={15}/>重試</button></div>}
{(modelError||!capabilities.webgpu)&&<div className="model-notice"><p role="alert">{!capabilities.webgpu?"目前瀏覽器未提供 WebGPU，無法啟動此本地模型。":status}</p>{modelExpanded&&<small>{LOCAL_MODEL} · 本地推論</small>}</div>}
<div style={{display:"flex",justifyContent:"flex-end",padding:"8px 16px"}}><button type="button" disabled={busy} onClick={switchPrivacy} aria-pressed={privateMode} title={privateMode?"私密模式：僅本機保存":"一般模式：本機保存；雲端同步尚未啟用"} style={{border:"1px solid #ddd",borderRadius:18,padding:"7px 12px",background:privateMode?"#222":"transparent",color:privateMode?"white":"inherit",fontSize:12}}>{privateMode?"🔒 私密模式 · 僅本機":"🔓 一般模式"}</button></div>
<div className="chat-messages" aria-live="polite">
{history.length===0?<div className="welcome"><div className="welcome-symbol"><Sparkles size={29}/></div><h2>今天想聊些什麼？</h2><p>Vanilla，專屬於你的私人 AI 工作空間。</p><div className="prompt-suggestions">{["幫我整理今天的想法","解釋一個複雜概念","一起規劃旅行"].map(x=><button key={x} disabled={(!ready&&(privateMode||providers.length===0))||busy} onClick={()=>void send(x)}>{x}<ArrowUp size={14}/></button>)}</div></div>:
<div className="message-list">{history.map((turn,index)=><div className={"message-row "+(turn.role==="user"?"from-user":"from-ai")} key={index}>{turn.role==="assistant"&&<span className="assistant-avatar"><Sparkles size={15}/></span>}<div className="message-content"><div className="message-text">{turn.content||"正在生成回答…"}</div>{turn.role==="assistant"&&turn.content&&<button type="button" className="message-copy" title="複製回答" onClick={()=>void copyMessage(turn.content,index)}>{copied===index?<Check size={14}/>:<Copy size={14}/>}</button>}</div></div>)}<div ref={bottomRef}/></div>}
</div>
<div className="composer-wrap"><form className="composer" onSubmit={event=>{event.preventDefault();void send();}}><textarea aria-label="輸入訊息" rows={1} placeholder="傳訊息給 Vanilla…" value={draft} disabled={(!ready&&(privateMode||providers.length===0))||busy} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();}}}/><div className="composer-toolbar"><span><Sparkles size={14}/> {privateMode?"本地私密":providers.length?"Vanilla · 智慧路由":"Vanilla AI"}</span><button type="submit" className="send-button" title="傳送" disabled={(!ready&&(privateMode||providers.length===0))||busy||!draft.trim()}><ArrowUp size={18}/></button></div></form><div className="composer-footnote">Vanilla 可能產生不正確資訊 · {privateMode?"私密對話僅儲存於此裝置，不會寫入一般聊天紀錄":"一般對話目前僅儲存於此瀏覽器；家庭雲端同步尚未啟用"}</div>{storageError&&<div className="model-notice" role="alert">裝置儲存空間不足，最新對話可能未儲存。請先備份重要內容，再刪除不需要的紀錄。</div>}{history.length>0&&<button className="clear-chat" type="button" disabled={busy} onClick={()=>setHistory([])}><RotateCcw size={13}/> 清除本次對話</button>}</div>
</section>;
}
