import {useState,useRef,useEffect} from "react";
import LocalModelPanel from "./LocalModelPanel";
import {renderTable,exportText} from "./smart-output";
import type {ImageInput} from "../vault/providers";
import {ArrowUp,RotateCcw,Sparkles,Copy,Check} from "lucide-react";
import {chooseProvider,generateCloudReply,availableProviders} from "../vault/providers";
import {detectLocalAICapabilities} from "./capabilities";
import {generateLocalReply,isLocalModelReady,loadLocalModel,LOCAL_MODELS,type LocalModelId,type ChatTurn,LOCAL_MODEL} from "./engine";
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
const [image,setImage]=useState<ImageInput|null>(null);
const [imageName,setImageName]=useState("");
const fileRef=useRef<HTMLInputElement>(null);
async function attachImage(file?:File){if(!file)return;if(!file.type.startsWith("image/")){setLastRoute("僅支援圖片格式");return;}if(file.size>8*1024*1024){setLastRoute("圖片不得超過 8MB");return;}const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=()=>reject(new Error("讀取圖片失敗"));reader.readAsDataURL(file);});setImage({mimeType:file.type,data});setImageName(file.name);}
const [busy,setBusy]=useState(false);
const [loadingModel,setLoadingModel]=useState(false);
const [modelProgress,setModelProgress]=useState(0);
const [selectedLocalModel,setSelectedLocalModel]=useState<LocalModelId>(()=>{const v=localStorage.getItem("vanilla.local.model");return LOCAL_MODELS.find(m=>m.id===v)?.id||LOCAL_MODEL;});
const [online,setOnline]=useState(()=>navigator.onLine);
const [status,setStatus]=useState(isLocalModelReady()?"本地模型已載入":"尚未下載模型");
const [ready,setReady]=useState(()=>isLocalModelReady(LOCAL_MODEL));
const [modelError,setModelError]=useState(false);
const [storageError,setStorageError]=useState(false);
const [providers,setProviders]=useState(availableProviders);
const [routeMode,setRouteMode]=useState<"auto"|"local"|"gemini"|"deepseek">("auto");
const [lastRoute,setLastRoute]=useState("");
useEffect(()=>{const update=()=>setProviders(availableProviders());window.addEventListener("vanilla-providers-changed",update);return()=>window.removeEventListener("vanilla-providers-changed",update);},[]);
const [copied,setCopied]=useState<number|null>(null);
const bottomRef=useRef<HTMLDivElement>(null);
const capabilities=detectLocalAICapabilities();
useEffect(()=>{
 const onNetwork=()=>setOnline(navigator.onLine);
 window.addEventListener("online",onNetwork);window.addEventListener("offline",onNetwork);
 return()=>{window.removeEventListener("online",onNetwork);window.removeEventListener("offline",onNetwork);};
},[]);
useEffect(()=>{
 if(!capabilities.webgpu||selectedLocalModel!==LOCAL_MODEL||isLocalModelReady(selectedLocalModel))return;
 let active=true;
 setLoadingModel(true);setModelError(false);setStatus("正在載入輕量本地模型…");
 void loadLocalModel((message,progress)=>{if(active){setStatus(message);setModelProgress(Math.round(progress*100));}},selectedLocalModel).then(()=>{
  if(active){setReady(true);setStatus("本地模型已就緒");setLoadingModel(false);}
 }).catch(error=>{
  if(active){setStatus(error instanceof Error?error.message:"模型載入失敗");setModelError(true);setLoadingModel(false);}
 });
 return()=>{active=false;};
},[capabilities.webgpu]);
function selectLocalModel(model:LocalModelId){
 if(busy||loadingModel)return;
 setSelectedLocalModel(model);
 try{localStorage.setItem("vanilla.local.model",model);}catch{}
 const already=isLocalModelReady(model);
 setReady(already);setModelError(false);
 setStatus(already?"本地模型已就緒":"請按「下載／載入」啟用所選模型");
 setModelProgress(0);
}
useEffect(()=>{try{localStorage.setItem(privateMode?PRIVATE_KEY:STORAGE_KEY,JSON.stringify(history));setStorageError(false);}catch{setStorageError(true);}},[history,privateMode]);
useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth",block:"end"});},[history]);
function switchPrivacy(){
  if(busy)return;
  const next=!privateMode;
  try{localStorage.setItem(MODE_KEY,String(next));}catch{setStorageError(true);return;}
  setHistory(restoreHistory(next?PRIVATE_KEY:STORAGE_KEY));
  setPrivateMode(next);
  setDraft("");setImage(null);setImageName("");
}
async function initialize(){
 setLoadingModel(true);setModelError(false);setModelProgress(0);
 try{
  await loadLocalModel((message,progress)=>{setStatus(message);setModelProgress(Math.round(progress*100));},selectedLocalModel);
  setReady(true);setStatus("本地模型已就緒");
 }catch(error){setReady(false);setStatus(error instanceof Error?error.message:"模型載入失敗");setModelError(true);}
 finally{setLoadingModel(false);}
}
const canReply=ready||(!privateMode&&providers.length>0&&routeMode!=="local");
async function send(value=draft){
 const question=value.trim();
 if(!question||busy||!canReply)return;
 const route=privateMode?"local":image?"gemini":routeMode==="auto"?chooseProvider(question,{localReady:ready,online}):routeMode;
 if(route==="local"&&!ready){setLastRoute("本地模型尚未載入，請開啟「裝置端 AI」設定並下載");return;}
 if(route!=="local"&&!providers.includes(route)){setLastRoute("尚未連接所選雲端模型");return;}
 if(!online&&route!=="local"){setLastRoute("目前離線，請切換本地 AI");return;}
 if(image&&!providers.includes("gemini")){setLastRoute("圖片辨識需要先連接 Gemini API");return;}
 if(route!=="local"){
  let consent=false;
  try{consent=localStorage.getItem("vanilla.cloud.consent.v1")==="yes";}catch{}
  if(!consent){
   if(!window.confirm("一般模式使用雲端模型時，這則訊息、近期聊天上下文及附加圖片（如有）會送至 Gemini 或 DeepSeek 處理。若不希望上傳，請取消並切換本地 AI／私密模式。是否同意？"))return;
   try{localStorage.setItem("vanilla.cloud.consent.v1","yes");}catch{}
  }
 }
 const next:ChatTurn[]=[...history,{role:"user",content:question}];
 setHistory([...next,{role:"assistant",content:""}]);setDraft("");setBusy(true);
 setLastRoute("正在使用："+(route==="local"?"本地 "+selectedLocalModel.split("-")[1]:route==="gemini"?"Gemini 雲端 API":"DeepSeek 雲端 API"));
 try{
  const answer=route==="local"?await generateLocalReply(next,text=>setHistory([...next,{role:"assistant",content:text}])):await generateCloudReply(route,next,image||undefined);
  setHistory([...next,{role:"assistant",content:answer||"（模型沒有產生內容）"}]);setImage(null);setImageName("");
  setLastRoute("上一則由 "+(route==="local"?"本地 AI":route==="gemini"?"Gemini 雲端 API":"DeepSeek 雲端 API")+" 回答");
 }catch(error){
  setHistory([...next,{role:"assistant",content:"生成失敗："+(error instanceof Error?error.message:"未知錯誤")}]);
  setLastRoute("生成失敗，請檢查所選模型或網路連線");
 }finally{setBusy(false);}
}
async function copyMessage(content:string,index:number){try{await navigator.clipboard.writeText(content);setCopied(index);}catch{setCopied(null);}}
return <section className="chat">
<LocalModelPanel selected={selectedLocalModel} onSelect={selectLocalModel} onLoad={()=>{void initialize();}} status={status} progress={modelProgress} loading={loadingModel} error={modelError} webgpu={capabilities.webgpu} online={online} ready={ready}/>

<div style={{display:"flex",justifyContent:"flex-end",padding:"8px 16px"}}><button type="button" disabled={busy} onClick={switchPrivacy} aria-pressed={privateMode} title={privateMode?"私密模式：僅本機保存":"一般模式：本機保存；雲端同步尚未啟用"} style={{border:"1px solid #ddd",borderRadius:18,padding:"7px 12px",background:privateMode?"#222":"transparent",color:privateMode?"white":"inherit",fontSize:12}}>{privateMode?"🔒 私密模式 · 僅本機":"🔓 一般模式"}</button></div>
<div style={{display:"flex",alignItems:"center",gap:9,padding:"4px 16px 9px",flexWrap:"wrap"}}><label htmlFor="vanilla-route" style={{fontSize:12,color:"#666"}}>回答模型</label><select id="vanilla-route" aria-label="選擇回答模型" value={privateMode?"local":routeMode} disabled={busy||privateMode} onChange={e=>setRouteMode(e.target.value as "auto"|"local"|"gemini"|"deepseek")} style={{fontSize:13,padding:"7px 10px",border:"1px solid #ddd",borderRadius:9,background:"#fff"}}><option value="auto">智慧路由</option><option value="local">本地 AI（裝置端）</option><option value="gemini" disabled={!providers.includes("gemini")}>Gemini API</option><option value="deepseek" disabled={!providers.includes("deepseek")}>DeepSeek API</option></select><span role="status" style={{fontSize:12,color:"#777"}}>{lastRoute|| (privateMode?"私密模式僅在裝置端運算":providers.length?"智慧路由：一般問題優先使用較強的已連接模型":"未連接雲端 API，僅能使用本地模型")}</span></div>
{!privateMode&&providers.length>0&&<p className="cloud-notice">一般模式若選擇 Gemini／DeepSeek，訊息、近期對話與附加圖片可能送至供應商；首次使用會徵求同意。選擇本地 AI 或私密模式可避免雲端傳送。</p>}
<div className="chat-messages" aria-live="polite">
{history.length===0?<div className="welcome"><div className="welcome-symbol"><Sparkles size={29}/></div><h2>今天想聊些什麼？</h2><p>Vanilla，專屬於你的私人 AI 工作空間。</p><div className="prompt-suggestions">{["幫我整理今天的想法","解釋一個複雜概念","一起規劃旅行"].map(x=><button key={x} disabled={!canReply||busy} onClick={()=>void send(x)}>{x}<ArrowUp size={14}/></button>)}</div></div>:
<div className="message-list">{history.map((turn,index)=><div className={"message-row "+(turn.role==="user"?"from-user":"from-ai")} key={index}>{turn.role==="assistant"&&<span className="assistant-avatar"><Sparkles size={15}/></span>}<div className="message-content"><div className="message-text">{turn.content||"正在生成回答…"}</div>{turn.role==="assistant"&&renderTable(turn.content)}{turn.role==="assistant"&&turn.content&&<button type="button" className="message-copy" title="複製回答" onClick={()=>void copyMessage(turn.content,index)}>{copied===index?<Check size={14}/>:<Copy size={14}/>}</button>}{turn.role==="assistant"&&turn.content&&<span className="smart-export"><button type="button" onClick={()=>exportText(turn.content,"md")}>MD</button><button type="button" onClick={()=>exportText(turn.content,"html")}>HTML</button><button type="button" onClick={()=>{try{exportText(turn.content,"csv");}catch(e){setLastRoute(String(e));}}}>CSV</button><button type="button" onClick={()=>window.print()}>PDF 列印</button></span>}</div></div>)}<div ref={bottomRef}/></div>}
</div>
<div className="composer-wrap">{imageName&&<div className="image-attachment">圖片：{imageName} <button type="button" onClick={()=>{setImage(null);setImageName("");}}>移除</button></div>}<input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{void attachImage(e.target.files?.[0]);e.target.value="";}}/><form className="composer" onSubmit={event=>{event.preventDefault();void send();}}><textarea aria-label="輸入訊息" rows={1} placeholder="傳訊息給 Vanilla…" value={draft} disabled={!canReply||busy} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();}}}/><div className="composer-toolbar"><span><button type="button" onClick={()=>fileRef.current?.click()} disabled={busy||privateMode} title="上傳圖片供 Gemini 辨識">＋ 圖片</button><Sparkles size={14}/> {privateMode?"本地私密":providers.length?"Vanilla · 智慧路由":"Vanilla AI"}</span><button type="submit" className="send-button" title="傳送" disabled={!canReply||busy||!draft.trim()}><ArrowUp size={18}/></button></div></form><div className="composer-footnote">Vanilla 可能產生不正確資訊 · {privateMode?"私密對話僅儲存於此裝置，不會寫入一般聊天紀錄":"一般對話目前僅儲存於此瀏覽器；家庭雲端同步尚未啟用"}</div>{storageError&&<div className="model-notice" role="alert">裝置儲存空間不足，最新對話可能未儲存。請先備份重要內容，再刪除不需要的紀錄。</div>}{history.length>0&&<button className="clear-chat" type="button" disabled={busy} onClick={()=>setHistory([])}><RotateCcw size={13}/> 清除本次對話</button>}</div>
</section>;
}
