import {useState,useRef,useEffect} from "react";
import LocalModelPanel from "./LocalModelPanel";
import CompareAnswers,{type ComparisonSession} from "../ai/CompareAnswers";
import {listCandidates,rankedCandidates,topComparisonCandidates,classifyTask,generateCandidate,saveModelChoice,saveAnswerRating,type ModelCandidate} from "../ai/model-orchestrator";
import {getOllamaConfig,isOllamaConfigured} from "../ai/ollama";
import {renderTable,exportText} from "./smart-output";
import type {ImageInput} from "../vault/providers";
import {ArrowUp,RotateCcw,Sparkles,Copy,Check,ThumbsUp,ThumbsDown} from "lucide-react";
import {availableProviders} from "../vault/providers";
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
const [ready,setReady]=useState(()=>{const v=localStorage.getItem("vanilla.local.model");const selected=LOCAL_MODELS.find(m=>m.id===v)?.id||LOCAL_MODEL;return isLocalModelReady(selected);});
const [modelError,setModelError]=useState(false);
const [storageError,setStorageError]=useState(false);
const [providers,setProviders]=useState(availableProviders);
type RouteMode="auto-local"|"auto"|"local"|"ollama"|"gemini"|"deepseek";
const [routeMode,setRouteMode]=useState<RouteMode>(()=>{
 try{const saved=localStorage.getItem("vanilla.route.mode.v1");return ["auto-local","auto","local","ollama","gemini","deepseek"].includes(saved||"")?saved as RouteMode:"auto-local";}catch{return "auto-local";}
});
const [compareMode,setCompareMode]=useState(()=>localStorage.getItem("vanilla.model.compare.v1")==="true");
const [allowMetered,setAllowMetered]=useState(()=>{try{return localStorage.getItem("vanilla.models.allow-metered.v1")==="true";}catch{return false;}});
const [comparison,setComparison]=useState<ComparisonSession|null>(null);
const [ollamaConnected,setOllamaConnected]=useState(isOllamaConfigured);
const [lastRoute,setLastRoute]=useState("");
useEffect(()=>{try{localStorage.setItem("vanilla.route.mode.v1",routeMode);}catch{}},[routeMode]);
useEffect(()=>{const update=()=>setProviders(availableProviders());window.addEventListener("vanilla-providers-changed",update);return()=>window.removeEventListener("vanilla-providers-changed",update);},[]);
useEffect(()=>{const update=()=>setOllamaConnected(isOllamaConfigured());window.addEventListener("vanilla-ollama-changed",update);return()=>window.removeEventListener("vanilla-ollama-changed",update);},[]);
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
  if(busy||comparison)return;
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
const canReply=ready||(!privateMode&&(providers.length>0||ollamaConnected)&&routeMode!=="local");
function changeMetered(enabled:boolean){
 setAllowMetered(enabled);
 try{localStorage.setItem("vanilla.models.allow-metered.v1",String(enabled));}catch{}
}
function changeCompareMode(enabled:boolean){
 setCompareMode(enabled);
 try{localStorage.setItem("vanilla.model.compare.v1",String(enabled));}catch{}
}
function chooseAnswer(id:string){
 if(!comparison||busy)return;
 const chosen=comparison.options.find(x=>x.candidate.id===id&&x.status==="done");
 if(!chosen)return;
 saveModelChoice(comparison.task,chosen.candidate,comparison.options.filter(x=>x.status==="done").map(x=>x.candidate));
 setHistory(prev=>[...prev,{role:"assistant",content:chosen.text,source:chosen.candidate.source,model:chosen.candidate.model}]);
 setLastRoute("已選擇 "+chosen.candidate.label+"；偏好將用於下次模型排序");
 setComparison(null);
}
function dismissComparison(){
 if(busy||!comparison)return;
 setHistory(prev=>[...prev,{role:"assistant",content:"本次雙答案比較未選擇回答。"}]);
 setComparison(null);
}
async function send(value=draft){
 const question=value.trim();
 if(!question||busy||comparison||!canReply)return;
 const task=classifyTask(question,Boolean(image));
 const localOnly=privateMode||/只用本地|僅用本地|不要上傳|不傳雲端|離線回答|私密回答/.test(question);
 const discovered=listCandidates({localReady:ready,localModel:selectedLocalModel,image:Boolean(image),online,privateMode:localOnly});
 const automatic=routeMode==="auto"||routeMode==="auto-local";
 const candidates=automatic&&!allowMetered?discovered.filter(x=>x.source==="local"||(x.source==="ollama"&&x.location==="自架主機")):discovered;
 const preference=routeMode==="auto"?"quality":"local-first";
 const ranked=rankedCandidates(candidates,task,preference);
 const primary=localOnly?candidates.find(x=>x.source==="local"):
  (routeMode==="auto"||routeMode==="auto-local")?ranked[0]:candidates.find(x=>x.source===routeMode);
 if(!primary){
  setLastRoute(automatic&&!allowMetered?"目前沒有可用的免按量付費模型。請下載本地模型、連線自架 Ollama，或開啟允許計費 API。":image?"圖片辨識需要已連接的 Gemini API":"所選模型尚未就緒。請在裝置端面板載入模型，或到設定連接 Ollama／Gemini");
  return;
 }
 const chosen:ModelCandidate[]=compareMode&&!localOnly&&(routeMode==="auto"||routeMode==="auto-local")&&ranked.length>1?topComparisonCandidates(ranked,task,preference):[primary];
 const cloud=chosen.filter(x=>x.source==="gemini"||x.source==="deepseek");
 const external=chosen.filter(x=>x.source==="ollama");
 if(cloud.length){
  const providersUsed=[...new Set(cloud.map(x=>x.source))];
  for(const provider of providersUsed){
   const key="vanilla.cloud.consent.v2."+provider;
   let allowed=false;try{allowed=localStorage.getItem(key)==="yes";}catch{}
   if(allowed)continue;
   const models=cloud.filter(x=>x.source===provider).map(x=>x.label).join("、");
   const service=provider==="gemini"?"Google Gemini":"DeepSeek";
   if(!window.confirm("準備使用 "+service+"（"+models+"）。將傳送本次問題、最多最近 20 則聊天訊息及可能的圖片。若使用兩個模型，可能增加 API 用量與費用。你是否同意傳送至這個供應商？"))return;
   try{localStorage.setItem(key,"yes");}catch{}
  }
 }
 if(external.length){
  const endpoint=getOllamaConfig().endpoint;
  const key="vanilla.ollama.consent."+endpoint;
  let allowed=false;try{allowed=localStorage.getItem(key)==="yes";}catch{}
  if(!allowed){
   if(!window.confirm("這次將把問題及近期聊天上下文傳送到你設定的 Ollama 主機："+endpoint+"。它不是 iPhone 裝置端推論；端點可能是你的主機或 Ollama 官方雲端，後者可能使用免費點數或產生費用。請確認端點與權限。是否繼續？"))return;
   try{localStorage.setItem(key,"yes");}catch{}
  }
 }
 const next:ChatTurn[]=[...history,{role:"user",content:question}];
 setDraft("");setBusy(true);
 if(chosen.length===2){
  const initial:ComparisonSession={question,task,options:chosen.map(candidate=>({candidate,status:"running" as const,text:""}))};
  setHistory(next);
  setComparison(initial);
  setLastRoute("雙答案比較中："+chosen.map(x=>x.label).join(" / "));
  const runCandidate=async(candidate:ModelCandidate)=>{
   try{
    const result=await generateCandidate(candidate,next,image||undefined,text=>{
     setComparison(prev=>prev?{...prev,options:prev.options.map(x=>x.candidate.id===candidate.id?{...x,text}:x)}:prev);
    });
    setComparison(prev=>prev?{...prev,options:prev.options.map(x=>x.candidate.id===candidate.id?{...x,text:result||"（無回答）",status:"done" as const}:x)}:prev);
   }catch(error){
    const msg=error instanceof Error?error.message:String(error);
    setComparison(prev=>prev?{...prev,options:prev.options.map(x=>x.candidate.id===candidate.id?{...x,error:msg,status:"error" as const}:x)}:prev);
   }
  };
  if(chosen[0].source===chosen[1].source){
   // CPU-only hosts and free-tier APIs may allow just one active request.
   for(const candidate of chosen)await runCandidate(candidate);
  }else{
   await Promise.all(chosen.map(runCandidate));
  }
  setImage(null);setImageName("");setBusy(false);
  setLastRoute("雙答案已完成，請選擇較喜歡的回答");
  return;
 }
 setHistory([...next,{role:"assistant",content:"",source:primary.source,model:primary.model}]);
 setLastRoute("正在使用："+primary.label);
 try{
  const result=await generateCandidate(primary,next,image||undefined,text=>{
   setHistory([...next,{role:"assistant",content:text,source:primary.source,model:primary.model}]);
  });
  setHistory([...next,{role:"assistant",content:result||"（模型沒有產生內容）",source:primary.source,model:primary.model}]);
  setImage(null);setImageName("");
  setLastRoute("上一則由 "+primary.label+" 回答");
 }catch(error){
  // Fail over only to an on-device model, or another model on the already approved Ollama host.
  // Never silently introduce a new remote cloud provider or incur an additional paid API request.
  const alternative=automatic?ranked.find(candidate=>candidate.id!==primary.id&&
   (candidate.source==="local"||(primary.source==="ollama"&&candidate.source==="ollama"))):undefined;
  if(alternative){
   setLastRoute(primary.label+" 無法回答，正在改用 "+alternative.label);
   try{
    const recovered=await generateCandidate(alternative,next,undefined,text=>{
     setHistory([...next,{role:"assistant",content:text,source:alternative.source,model:alternative.model}]);
    });
    setHistory([...next,{role:"assistant",content:recovered||"（模型沒有產生內容）",source:alternative.source,model:alternative.model}]);
    setLastRoute("已由 "+alternative.label+" 備援完成；原模型失敗已記錄");
   }catch(fallbackError){
    const msg=fallbackError instanceof Error?fallbackError.message:String(fallbackError);
    setHistory([...next,{role:"assistant",content:"模型與備援均無法回答："+msg,source:alternative.source,model:alternative.model}]);
    setLastRoute("主模型及備援模型皆失敗，請檢查連線與模型");
   }
  }else{
   setHistory([...next,{role:"assistant",content:"生成失敗："+(error instanceof Error?error.message:String(error)),source:primary.source,model:primary.model}]);
   setLastRoute("生成失敗，請檢查模型、網路、權限及額度");
  }
 }finally{setBusy(false);}
}
function rateAnswer(index:number,liked:boolean){
 const answer=history[index];
 if(!answer||answer.role!=="assistant"||!answer.source||!answer.model||answer.rating||answer.content.startsWith("生成失敗："))return;
 const question=history.slice(0,index).reverse().find(x=>x.role==="user")?.content||"";
 const task=classifyTask(question);
 saveAnswerRating(task,answer.source+":"+answer.model,liked);
 setHistory(prev=>prev.map((x,i)=>i===index?{...x,rating:liked?"up":"down"}:x));
 setLastRoute(liked?"已記錄喜歡的回答，模型偏好將逐步調整":"已記錄這個回答需要改進，往後會降低相同任務的模型優先度");
}
async function copyMessage(content:string,index:number){try{await navigator.clipboard.writeText(content);setCopied(index);}catch{setCopied(null);}}
return <section className="chat">
<LocalModelPanel selected={selectedLocalModel} onSelect={selectLocalModel} onLoad={()=>{void initialize();}} status={status} progress={modelProgress} loading={loadingModel} error={modelError} webgpu={capabilities.webgpu} online={online} ready={ready}/>

<div style={{display:"flex",justifyContent:"flex-end",padding:"8px 16px"}}><button type="button" disabled={busy} onClick={switchPrivacy} aria-pressed={privateMode} title={privateMode?"私密模式：僅本機保存":"一般模式：可選手機、Ollama 或雲端推論"} style={{border:"1px solid #ddd",borderRadius:18,padding:"7px 12px",background:privateMode?"#222":"transparent",color:privateMode?"white":"inherit",fontSize:12}}>{privateMode?"🔒 私密模式 · 僅本機":"🔓 一般模式"}</button></div>
<div className="model-selection-row">
 <label htmlFor="vanilla-route">回答模型</label>
 <select id="vanilla-route" aria-label="選擇回答模型" value={privateMode?"local":routeMode} disabled={busy||privateMode||Boolean(comparison)} onChange={e=>{const next=e.target.value as RouteMode;setRouteMode(next);if(next!=="auto"&&next!=="auto-local")changeCompareMode(false);}}>
  <option value="auto-local">智慧選擇 · 本地優先</option>
  <option value="auto">智慧選擇 · 品質優先</option>
  <option value="local">手機本地 AI</option>
  <option value="ollama" disabled={!ollamaConnected}>Ollama · 家庭／自架主機</option>
  <option value="gemini" disabled={!providers.includes("gemini")}>Gemini API</option>
  <option value="deepseek" disabled={!providers.includes("deepseek")}>DeepSeek API</option>
 </select>
 <label className="compare-toggle" title="同一個問題交給兩個候選模型，再由你選擇較好的回答">
  <input type="checkbox" checked={compareMode} disabled={busy||privateMode||(routeMode!=="auto"&&routeMode!=="auto-local")||Boolean(comparison)} onChange={e=>{setRouteMode("auto-local");changeCompareMode(e.target.checked);}}/>
  <span>雙答案比較</span>
 </label>
 <label className="compare-toggle" title="自動路由只允許手機端及自架 Ollama；雲端 API 請手動選擇或明確開啟">
  <input type="checkbox" checked={!allowMetered} disabled={busy||privateMode||Boolean(comparison)} onChange={e=>changeMetered(!e.target.checked)}/>
  <span>自動免 API 計費</span>
 </label>
 <span role="status" className="model-selection-status">{lastRoute||(privateMode?"私密模式僅在手機端運算":providers.length||ollamaConnected?"自動挑選合適模型，也可手動指定":"請先下載本地模型或連接 Ollama／API")}</span>
</div>
{!privateMode&&(providers.length>0||ollamaConnected)&&<p className="cloud-notice">Ollama 於你指定的主機運算；Gemini／DeepSeek 在供應商雲端運算。雙答案模式可能向兩個服務傳送相同對話並使用兩次額度，首次傳送會先徵求同意。</p>}
<div className="chat-messages" aria-live="polite">
{history.length===0?<div className="welcome"><div className="welcome-symbol"><Sparkles size={29}/></div><h2>今天想聊些什麼？</h2><p>Vanilla，專屬於你的私人 AI 工作空間。</p><div className="prompt-suggestions">{["幫我整理今天的想法","解釋一個複雜概念","一起規劃旅行"].map(x=><button key={x} disabled={!canReply||busy||Boolean(comparison)} onClick={()=>void send(x)}>{x}<ArrowUp size={14}/></button>)}</div></div>:
<div className="message-list">{history.map((turn,index)=><div className={"message-row "+(turn.role==="user"?"from-user":"from-ai")} key={index}>{turn.role==="assistant"&&<span className="assistant-avatar"><Sparkles size={15}/></span>}<div className="message-content">{turn.role==="assistant"&&turn.source&&<div className="message-source">{turn.source==="local"?"本地 AI · 僅裝置端":turn.source==="ollama"?"Ollama · 指定端點":turn.source==="gemini"?"Gemini API · 雲端":"DeepSeek API · 雲端"}{turn.model&&<span className="model-id-suffix"> · {turn.model}</span>}</div>}<div className="message-text">{turn.content||"正在生成回答…"}</div>{turn.role==="assistant"&&renderTable(turn.content)}{turn.role==="assistant"&&turn.content&&<button type="button" className="message-copy" title="複製回答" onClick={()=>void copyMessage(turn.content,index)}>{copied===index?<Check size={14}/>:<Copy size={14}/>}</button>}{turn.role==="assistant"&&turn.content&&<span className="smart-export"><button type="button" onClick={()=>exportText(turn.content,"md")}>MD</button><button type="button" onClick={()=>exportText(turn.content,"html")}>HTML</button><button type="button" onClick={()=>{try{exportText(turn.content,"csv");}catch(e){setLastRoute(String(e));}}}>CSV</button><button type="button" onClick={()=>window.print()}>PDF 列印</button></span>}{turn.role==="assistant"&&turn.content&&turn.source&&turn.model&&!turn.content.startsWith("生成失敗：")&&<span className="message-rating" aria-label="評價這則回答">
 <button type="button" aria-label="喜歡這個回答" title="喜歡這個回答" disabled={Boolean(turn.rating)} className={turn.rating==="up"?"selected":""} onClick={()=>rateAnswer(index,true)}><ThumbsUp size={14}/></button>
 <button type="button" aria-label="這個回答需要改善" title="這個回答需要改善" disabled={Boolean(turn.rating)} className={turn.rating==="down"?"selected":""} onClick={()=>rateAnswer(index,false)}><ThumbsDown size={14}/></button>
 </span>}</div></div>)}<div ref={bottomRef}/></div>}
{comparison&&<CompareAnswers comparison={comparison} onChoose={chooseAnswer} onCancel={dismissComparison}/>}
</div>
<div className="composer-wrap">{imageName&&<div className="image-attachment">圖片：{imageName} <button type="button" onClick={()=>{setImage(null);setImageName("");}}>移除</button></div>}<input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{void attachImage(e.target.files?.[0]);e.target.value="";}}/><form className="composer" onSubmit={event=>{event.preventDefault();void send();}}><textarea aria-label="輸入訊息" rows={1} placeholder="傳訊息給 Vanilla…" value={draft} disabled={!canReply||busy||Boolean(comparison)} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();}}}/><div className="composer-toolbar"><span><button type="button" onClick={()=>fileRef.current?.click()} disabled={busy||privateMode} title="將圖片傳送至 Gemini 辨識（需同意雲端傳輸）">＋ 圖片</button><Sparkles size={14}/> {privateMode?"本地私密":providers.length?"Vanilla · 智慧路由":"Vanilla AI"}</span><button type="submit" className="send-button" title="傳送" disabled={!canReply||busy||Boolean(comparison)||!draft.trim()}><ArrowUp size={18}/></button></div></form><div className="composer-footnote">Vanilla 可能產生不正確資訊 · {privateMode?"私密對話僅儲存於此裝置，不會寫入一般聊天紀錄":"一般對話目前保存在此瀏覽器；模型選擇與偏好紀錄留在此裝置"}</div>{storageError&&<div className="model-notice" role="alert">裝置儲存空間不足，最新對話可能未儲存。請先備份重要內容，再刪除不需要的紀錄。</div>}{history.length>0&&<button className="clear-chat" type="button" disabled={busy} onClick={()=>{setHistory([]);setComparison(null);}}><RotateCcw size={13}/> 清除本次對話</button>}</div>
</section>;
}
