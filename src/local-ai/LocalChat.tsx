import {useState,useRef,useEffect} from "react";
import {ArrowUp,Download,RotateCcw,Sparkles,Copy,Check,ChevronDown} from "lucide-react";
import {detectLocalAICapabilities} from "./capabilities";
import {generateLocalReply,isLocalModelReady,loadLocalModel,type ChatTurn,LOCAL_MODEL} from "./engine";
export default function LocalChat(){
const [history,setHistory]=useState<ChatTurn[]>([]);
const [draft,setDraft]=useState("");
const [busy,setBusy]=useState(false);
const [loadingModel,setLoadingModel]=useState(false);
const [progress,setProgress]=useState(0);
const [status,setStatus]=useState(isLocalModelReady()?"本地模型已載入":"尚未下載模型");
const [ready,setReady]=useState(isLocalModelReady());
const [modelExpanded,setModelExpanded]=useState(false);
const [copied,setCopied]=useState<number|null>(null);
const bottomRef=useRef<HTMLDivElement>(null);
const capabilities=detectLocalAICapabilities();
useEffect(()=>{
  if(!capabilities.webgpu||isLocalModelReady())return;
  let active=true;
  setLoadingModel(true);
  setStatus("正在背景準備本地模型…");
  void loadLocalModel((message,value)=>{
    if(active){setStatus(message);setProgress(value);}
  }).then(()=>{
    if(active){setReady(true);setStatus("模型已就緒 · 本地推論");setLoadingModel(false);}
  }).catch(error=>{
    if(active){setStatus(error instanceof Error?error.message:"模型載入失敗");setLoadingModel(false);}
  });
  return ()=>{active=false;};
},[capabilities.webgpu]);
useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth",block:"end"});},[history]);
async function initialize(){
setLoadingModel(true);
try{await loadLocalModel((message,value)=>{setStatus(message);setProgress(value);});setReady(true);setStatus("模型已就緒 · 本地推論");setModelExpanded(false);}
catch(error){setStatus(error instanceof Error?error.message:"模型載入失敗");}
finally{setLoadingModel(false);}
}
async function send(value=draft){
const question=value.trim();
if(!question||busy||!ready)return;
const next:ChatTurn[]=[...history,{role:"user",content:question}];
setHistory([...next,{role:"assistant",content:""}]);setDraft("");setBusy(true);
try{
const answer=await generateLocalReply(next,text=>setHistory([...next,{role:"assistant",content:text}]));
setHistory([...next,{role:"assistant",content:answer||"（模型沒有產生內容）"}]);
}catch(error){setHistory([...next,{role:"assistant",content:"生成失敗："+(error instanceof Error?error.message:"未知錯誤")}]);}
finally{setBusy(false);}
}
async function copyMessage(content:string,index:number){try{await navigator.clipboard.writeText(content);setCopied(index);}catch{setCopied(null);}}
return <section className="chat">
<div className="model-bar">
<div className="model-summary"><span className={"model-dot "+(ready?"ready":"")}/><span>{ready?"本地模型已就緒":"本地 AI 尚未啟動"}</span><button type="button" className="model-detail-toggle" aria-label="模型資訊" aria-expanded={modelExpanded} onClick={()=>setModelExpanded(!modelExpanded)}><ChevronDown size={15}/></button></div>
{!ready&&<button className="model-action" type="button" disabled={loadingModel||!capabilities.webgpu} onClick={initialize}><Download size={15}/>{loadingModel?"背景準備中…":"重試載入模型"}</button>}
</div>
{(!ready||modelExpanded)&&<div className="model-notice"><div className="model-notice-head"><Sparkles size={17}/><strong>{LOCAL_MODEL}</strong></div><p role="status">{status}</p>{loadingModel&&!ready&&<progress value={progress} max={1} style={{width:"100%"}}/>}{!capabilities.webgpu&&<p>目前瀏覽器未提供 WebGPU，無法啟動此本地模型。</p>}<small>開啟頁面時自動在背景準備模型；已快取的模型通常不需重新下載，但 Safari 可能清除快取。重新開啟仍須載入模型至記憶體。推論不會呼叫遠端聊天 API。</small></div>}
<div className="chat-messages" aria-live="polite">
{history.length===0?<div className="welcome"><div className="welcome-symbol"><Sparkles size={29}/></div><h2>今天想聊些什麼？</h2><p>Vanilla，專屬於你的私人 AI 工作空間。</p><div className="prompt-suggestions">{["幫我整理今天的想法","解釋一個複雜概念","一起規劃旅行"].map(x=><button key={x} disabled={!ready||busy} onClick={()=>void send(x)}>{x}<ArrowUp size={14}/></button>)}</div></div>:
<div className="message-list">{history.map((turn,index)=><div className={"message-row "+(turn.role==="user"?"from-user":"from-ai")} key={index}>{turn.role==="assistant"&&<span className="assistant-avatar"><Sparkles size={15}/></span>}<div className="message-content"><div className="message-text">{turn.content||"正在生成回答…"}</div>{turn.role==="assistant"&&turn.content&&<button type="button" className="message-copy" title="複製回答" onClick={()=>void copyMessage(turn.content,index)}>{copied===index?<Check size={14}/>:<Copy size={14}/>}</button>}</div></div>)}<div ref={bottomRef}/></div>}
</div>
<div className="composer-wrap"><form className="composer" onSubmit={event=>{event.preventDefault();void send();}}><textarea aria-label="輸入訊息" rows={1} placeholder={ready?"傳訊息給 Vanilla…":"本地 AI 正在背景準備中…"} value={draft} disabled={!ready||busy} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();}}}/><div className="composer-toolbar"><span><Sparkles size={14}/> 裝置端模型</span><button type="submit" className="send-button" title="傳送" disabled={!ready||busy||!draft.trim()}><ArrowUp size={18}/></button></div></form><div className="composer-footnote">Vanilla 可能產生不正確資訊 · 對話暫存於目前頁面，尚未啟用雲端同步</div>{history.length>0&&<button className="clear-chat" type="button" disabled={busy} onClick={()=>setHistory([])}><RotateCcw size={13}/> 清除本次對話</button>}</div>
</section>;
}
