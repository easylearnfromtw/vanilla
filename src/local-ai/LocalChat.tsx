import {useState,useRef,useEffect} from "react";
import AssistantTools from "../assistant/AssistantTools";
import CreamMessage from "../cream/CreamMessage";
import {fromCreamRows,parseCreamCSV,analyzeCream,summarizeCream,creamInstruction,creamChartFollowup,type CreamDataset,type CreamResult} from "../cream/core";
import {inspectExternalText,wrapExternalText,assertPublicWorkspaceName} from "../security/trust-boundary";
import {planAppIntent,PROJECTS} from "../assistant/intent-router";
import {proposeSheetAction,commitSheetAction} from "../assistant/sheet-actions";
import {getFitnessReport,formatFitnessReport,parseRunDraft,appendFitnessRun} from "../assistant/fitness-bridge";
import {rememberText,rememberURL,rememberFile,searchMemories,knowledgeContext,forgetMemory} from "../memory/drive-memory";
import {searchLinks} from "../search/source-preferences";
import {driveSession} from "../workspace/cloud-drive";
import {chatStorageKey,scheduleChatSync} from "../vault/chat-sync";
import CompareAnswers,{type ComparisonSession} from "../ai/CompareAnswers";
import {listCandidates,rankedCandidates,topComparisonCandidates,classifyTask,generateCandidate,saveModelChoice,saveAnswerRating,type ModelCandidate} from "../ai/model-orchestrator";
import {getOllamaConfig,isOllamaConfigured} from "../ai/ollama";
import {learnToneFromMessage,toneFeedback,applyExplicitToneRequest,type ToneFeedback} from "../ai/tone-adaptation";
import {renderTable,exportText,parseTable} from "./smart-output";
import type {ImageInput} from "../vault/providers";
import {ArrowUp,RotateCcw,Sparkles,Copy,Check,ThumbsUp,ThumbsDown} from "lucide-react";
import {availableProviders} from "../vault/providers";
import {detectLocalAICapabilities} from "./capabilities";
import {generateLocalReply,isLocalModelReady,loadLocalModel,isLocalModelSupported,LOCAL_MODELS,type LocalModelId,type ChatTurn,LOCAL_MODEL} from "./engine";
const MODE_KEY="vanilla.chat.private.enabled";
function restoreMode(){try{return localStorage.getItem(MODE_KEY)==="true";}catch{return false;}}
function restoreHistory(key=chatStorageKey(false)):ChatTurn[]{
  try{const raw=localStorage.getItem(key);if(!raw)return [];const parsed:unknown=JSON.parse(raw);return Array.isArray(parsed)?parsed.filter((x):x is ChatTurn=>Boolean(x&&typeof x==="object"&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string")):[];}catch{return [];}
}
export default function LocalChat(){
const [privateMode,setPrivateMode]=useState(restoreMode);
const [history,setHistory]=useState<ChatTurn[]>(()=>restoreHistory(chatStorageKey(restoreMode())));
const [draft,setDraft]=useState("");
const [image,setImage]=useState<ImageInput|null>(null);
const [imageName,setImageName]=useState("");
const [fileContext,setFileContext]=useState("");
const [creamDataset,setCreamDataset]=useState<CreamDataset|null>(null);
const [fileName,setFileName]=useState("");
const [fileStatus,setFileStatus]=useState("");
const [assetBusy,setAssetBusy]=useState(false);
const [searchResults,setSearchResults]=useState<Array<{label:string;url:string}>>([]);
const fileRef=useRef<HTMLInputElement>(null);
async function attachFile(file?:File){
 if(!file)return;
 try{assertPublicWorkspaceName(file.name,"處理");}catch(e){setFileStatus(e instanceof Error?e.message:String(e));return;}
 setFileName(file.name);setFileStatus("");setFileContext("");
 if(/\.(csv|xlsx)$/i.test(file.name)){
  if(file.size>2*1024*1024){setFileStatus("CREAM 手機端檔案上限 2 MB；未匯入或傳送資料。");return;}
  setAssetBusy(true);
  try{
   let dataset:CreamDataset;
   if(/\.xlsx$/i.test(file.name)){
    const {readSheet}=await import("read-excel-file/browser");
    const rows=await readSheet(file);
    dataset=fromCreamRows(rows,file.name);
   }else{
    const raw=await file.text();
    if(inspectExternalText(raw,"document").blocked)throw Error("資料中含疑似提示詞注入，已停止匯入。");
    dataset=parseCreamCSV(raw,file.name);
   }
   setCreamDataset(dataset);
   const result=analyzeCream(dataset),now=Date.now();
   setHistory(prev=>[...prev,{role:"user",content:"CREAM：分析本機附件「"+file.name+"」",id:crypto.randomUUID(),createdAt:now},
    {role:"assistant",content:summarizeCream(result),id:crypto.randomUUID(),createdAt:now+1,cream:result}]);
   setFileName("");setFileContext("");setFileStatus("");setLastRoute("CREAM 已在本機分析，未將數據傳送至模型或 Google Drive。");
  }catch(e){setFileStatus("CREAM 匯入失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setAssetBusy(false);}
  return;
 }
 if(file.size>15*1024*1024){setFileStatus("檔案超過 15 MB，目前無法直接存進 Vanilla；影片需要日後分段上傳。");return;}
 setAssetBusy(true);
 let suspiciousAttachment=false;
 try{
  if(file.type.startsWith("image/")){
   if(file.size>8*1024*1024)throw Error("圖片辨識單張上限 8 MB");
   const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]||"");reader.onerror=()=>reject(Error("圖片讀取失敗"));reader.readAsDataURL(file);});
   setImage({mimeType:file.type,data});setImageName(file.name);
  }else if(file.size<=1.5*1024*1024&&(/^(text\/|application\/json)/.test(file.type)||/\.(txt|md|csv|json)$/i.test(file.name))){
   const raw=(await file.text()).slice(0,10000);
   const inspection=inspectExternalText(raw,"document");
   if(inspection.blocked){suspiciousAttachment=true;setFileContext("");setFileStatus("已偵測附件內的提示詞注入，文字已隔離，不會交給 AI 執行。"+inspection.signals.join("、"));}
   else setFileContext(wrapExternalText(raw,"document"));
  }
  if(!privateMode&&driveSession()){
   const record=await rememberFile(file);
   setFileStatus("已儲存到你的 Google Drive："+record.title+(suspiciousAttachment?"。注意：附件包含疑似 Prompt Injection，已隔離文字索引，原始檔案仍在 Drive。":""));
  }else{
   setFileStatus((privateMode?"私密模式：附件未上傳，僅在本次對話使用":"尚未登入 Google Drive：附件未永久保存；請先登入再重新上傳")+(suspiciousAttachment?"。附件文字含疑似 Prompt Injection，已隔離。":""));
  }
 }catch(e){setFileStatus("附件處理失敗："+(e instanceof Error?e.message:String(e)));}
 finally{setAssetBusy(false);}
}
const [busy,setBusy]=useState(false);
const [loadingModel,setLoadingModel]=useState(false);
const [modelProgress,setModelProgress]=useState(0);
const [selectedLocalModel,setSelectedLocalModel]=useState<LocalModelId>(LOCAL_MODEL);
const [online,setOnline]=useState(()=>navigator.onLine);
const [status,setStatus]=useState(isLocalModelReady()?"本地模型已載入":"尚未下載模型");
const [ready,setReady]=useState(()=>isLocalModelReady(LOCAL_MODEL));
const [modelError,setModelError]=useState(false);
const [storageError,setStorageError]=useState(false);
const [providers,setProviders]=useState(availableProviders);
const [compareMode,setCompareMode]=useState(()=>localStorage.getItem("vanilla.model.compare.v1")==="true");
const [allowMetered,setAllowMetered]=useState(()=>{try{return localStorage.getItem("vanilla.models.allow-metered.v1")==="true";}catch{return false;}});
const [comparison,setComparison]=useState<ComparisonSession|null>(null);
const [ollamaConnected,setOllamaConnected]=useState(isOllamaConfigured);
const [lastRoute,setLastRoute]=useState("");

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
useEffect(()=>{
 const missing=history.some(x=>!x.id||!x.createdAt);
 if(missing){
  const base=Date.now()-history.length*1000;
  setHistory(previous=>previous.map((x,i)=>({...x,id:x.id||crypto.randomUUID(),createdAt:x.createdAt||base+i*1000})));
  return;
 }
 try{
  localStorage.setItem(chatStorageKey(privateMode),JSON.stringify(history));
  setStorageError(false);
  if(!privateMode)scheduleChatSync();
 }catch{setStorageError(true);}
},[history,privateMode]);
useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth",block:"end"});},[history]);
function switchPrivacy(){
  if(busy||comparison)return;
  const next=!privateMode;
  try{localStorage.setItem(MODE_KEY,String(next));}catch{setStorageError(true);return;}
  setHistory(restoreHistory(chatStorageKey(next)));
  setPrivateMode(next);
  setDraft("");setImage(null);setImageName("");setFileContext("");setFileName("");setFileStatus("");
}
async function initialize(){
 setLoadingModel(true);setModelError(false);setModelProgress(0);
 try{
  await loadLocalModel((message,progress)=>{setStatus(message);setModelProgress(Math.round(progress*100));},selectedLocalModel);
  setReady(true);setStatus("本地模型已就緒");
 }catch(error){setReady(false);setStatus(error instanceof Error?error.message:"模型載入失敗");setModelError(true);}
 finally{setLoadingModel(false);}
}
const canReply=ready||(!privateMode&&(providers.length>0||ollamaConnected));
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
 setHistory(prev=>[...prev,{role:"assistant",content:chosen.text,source:chosen.candidate.source,model:chosen.candidate.model,id:crypto.randomUUID(),createdAt:Date.now()}]);
 setLastRoute("已選擇 "+chosen.candidate.label+"；偏好將用於下次模型排序");
 setComparison(null);
}
function dismissComparison(){
 if(busy||!comparison)return;
 setHistory(prev=>[...prev,{role:"assistant",content:"本次雙答案比較未選擇回答。",id:crypto.randomUUID(),createdAt:Date.now()}]);
 setComparison(null);
}
function toolReply(question:string,answer:string){
 setHistory(prev=>[...prev,{role:"user",content:question,id:crypto.randomUUID(),createdAt:Date.now()},{role:"assistant",content:answer,id:crypto.randomUUID(),createdAt:Date.now()+1}]);
 setDraft("");setLastRoute("已由 Vanilla 工具執行 · 不消耗 AI API");
}
async function executeIntent(question:string):Promise<boolean>{
 try{
  const action=proposeSheetAction(question);
  if(action){
   if(!action.edits.length){toolReply(question,"這些儲存格目前就是指定內容，無須修改。");return true;}
   const preview=action.edits.slice(0,12).map(x=>x.cell+"："+(x.from||"（空白）")+" → "+(x.to||"（清空）")).join("\n");
   if(!window.confirm(action.summary+"\n\n"+preview+(action.edits.length>12?"\n另有 "+(action.edits.length-12)+" 格…":"")+"\n\n確認修改本機表格？雲端檔案不會自動覆寫。"))return true;
   const result=commitSheetAction(action);
   toolReply(question,"已更新「"+result.name+"」的 "+action.edits.length+" 個儲存格，資料已保存於此裝置。需要查看時說「開啟表格」；Google Drive 需在 Sheets 中另行同步。");
   return true;
  }
 }catch(error){
  toolReply(question,"表格修改未完成："+(error instanceof Error?error.message:String(error)));
  return true;
 }
 const intent=planAppIntent(question);
 if(!intent)return false;
 if(intent.kind==="open"){
  const eventName=intent.section==="sheets"?"vanilla-open-sheets":intent.section==="files"?"vanilla-open-files":intent.section==="builder"?"vanilla-open-builder":"vanilla-open-settings";
  window.dispatchEvent(new Event(eventName));setDraft("");return true;
 }
 if(intent.kind==="integration"){
  if(privateMode&&!window.confirm("要把私密模式的 API 串接構想帶入一般 Self-Build 工作室嗎？你沒有貼入金鑰才應繼續。"))return true;
  toolReply(question,"已將「"+intent.name+"」API 串接加入 Self-Build 需求。這需要釐清授權範圍、回呼網址、API 使用限制及安全後端；尚未連接服務，也不要在聊天欄貼上金鑰。接下來可產生工程需求與 GitHub Issue 供審查。");
  window.dispatchEvent(new CustomEvent("vanilla-open-builder",{detail:{idea:intent.idea}}));
  return true;
 }
  if(intent.kind==="sheet"){
  if(privateMode&&!window.confirm("將這份表格從私密對話複製到一般本機工作簿？不會自動上傳雲端。"))return true;
  toolReply(question,intent.message);
  window.dispatchEvent(new CustomEvent("vanilla-open-sheet",{detail:{workbook:intent.workbook}}));
  return true;
 }
 if(intent.kind==="search"){
  const links=searchLinks(intent.query);
  setSearchResults(links);
  toolReply(question,"已準備「"+intent.query+"」的網路搜尋入口。請從下方選擇一般搜尋或偏好網站；尚未取得與驗證網頁內容。");
  return true;
 }
 if(intent.kind==="project"){
  const project=PROJECTS.find(x=>x.id===intent.project);
  if(intent.project!=="fitness"){
   const name=project?.name||intent.project;
   toolReply(question,project?"已找到 "+name+" 的專案入口："+project.url+"。目前沒有自動修改此網站資料的授權，不會冒稱已編輯。":"尚未找到專案設定");
   if(project&&intent.action==="open")window.open(project.url,"_blank","noopener,noreferrer");
   return true;
  }
  try{
   const report=getFitnessReport();
   if(localStorage.getItem("vanilla.fitness.read-consent.v1")!=="yes"){
    if(!window.confirm("健人訓練紀錄可能屬於「"+report.owner+"」。Vanilla 將只讀取這個瀏覽器中健人的真實訓練數據。確定授權此次本機存取？"))return true;
    localStorage.setItem("vanilla.fitness.read-consent.v1","yes");
   }
   if(intent.action==="open"){window.open("https://easylearnfromtw.github.io/Builder/","_blank","noopener,noreferrer");toolReply(question,"已開啟健人網站");return true;}
   if(intent.action==="query"){toolReply(question,formatFitnessReport(report));return true;}
   const parsed=parseRunDraft(question);
   if(!parsed){toolReply(question,"可以幫你新增已完成的跑步，但需要距離和時間。請說：「幫我在健人新增 6 公里、40 分鐘跑步，心率 150」。寫入前會再向你確認。");return true;}
   const prompt="要將這次跑步寫入此裝置「"+report.owner+"」的健人紀錄嗎？\n日期："+parsed.date+"\n距離："+parsed.km+" km\n時間："+parsed.minutes+" 分鐘"+(parsed.hr?"\n心率："+parsed.hr:"")+"\n此動作不會同步到其他手機。";
   if(!window.confirm(prompt))return true;
   toolReply(question,appendFitnessRun(parsed));
  }catch(e){toolReply(question,"健人資料操作未完成："+(e instanceof Error?e.message:String(e)));}
  return true;
 }
 if(intent.kind==="memory-save"||intent.kind==="memory-search"||intent.kind==="memory-delete"){
  if(privateMode){toolReply(question,"目前是私密模式，Vanilla 不會將內容上傳 Google Drive。需要雲端永久記憶時，請切換一般模式後再傳送。");return true;}
  setBusy(true);setLastRoute("正在存取個人 Google Drive 記憶…");
  try{
   if(intent.kind==="memory-save"){
    const exactURL=/^https:\/\/\S+$/i.test(intent.content)?intent.content:null;
    const result=exactURL?await rememberURL(exactURL):await rememberText(intent.content);
    toolReply(question,"已保存到 "+result.ownerEmail+" 的 Google Drive 記憶："+result.title+"。"+(result.sourceUrl?"僅保存連結，尚未爬取網站內容。":""));
   }else if(intent.kind==="memory-delete"){
    const matches=await searchMemories(intent.query);
    if(!matches.length){toolReply(question,"沒有找到可以刪除的雲端記憶。");return true;}
    const exact=matches.filter(x=>x.title===intent.query||x.id===intent.query);
    const target=(exact.length===1?exact:matches.length===1?matches:[])[0];
    if(!target){toolReply(question,"符合「"+intent.query+"」的記憶不只一筆，請提供完整標題避免誤刪。\n"+matches.map(x=>"• "+x.title).join("\n"));return true;}
    if(!window.confirm("確定將 Google Drive 記憶「"+target.title+"」移至垃圾桶？這會刪除記憶索引，原始附件仍需在檔案管理中另外刪除。"))return true;
    const removed=await forgetMemory(target.id);
    toolReply(question,"已將「"+removed.title+"」的記憶索引移至 Google Drive 垃圾桶。原始附件沒有自動刪除。");
   }else{
    const records=await searchMemories(intent.query);
    toolReply(question,records.length?"從你的個人 Google Drive 找到 "+records.length+" 筆：\n"+records.map((x,i)=>(i+1)+". "+x.title+" — "+x.description.slice(0,450)).join("\n"):"個人 Google Drive 記憶目前找不到符合內容。這不代表其他網站或其他帳號的資料不存在。");
   }
  }catch(e){toolReply(question,"雲端記憶尚未完成："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
  return true;
 }
 return false;
}
async function send(value=draft){
 const question=value.trim()||(image?"請分析這張圖片":fileName?"請協助整理這個附件":"");
 if(!question||busy||comparison||assetBusy)return;
 const creamInput=creamInstruction(question);
 if(creamInput){
  try{
   if(inspectExternalText(creamInput.csv,"document").blocked)throw Error("偵測到疑似提示詞注入，未匯入資料。");
   const dataset=parseCreamCSV(creamInput.csv,"聊天貼上的 CSV");
   const result=analyzeCream(dataset,creamInput.kind),now=Date.now();
   setCreamDataset(dataset);
   setHistory(prev=>[...prev,{role:"user",content:"CREAM：分析聊天貼上的資料（"+dataset.rows.length+" 筆）",id:crypto.randomUUID(),createdAt:now},
    {role:"assistant",content:summarizeCream(result),cream:result,id:crypto.randomUUID(),createdAt:now+1}]);
   setDraft("");setLastRoute("CREAM 以本地統計工具計算數值，沒有呼叫雲端模型。");
  }catch(e){toolReply(question.slice(0,200),"CREAM 解析失敗："+(e instanceof Error?e.message:String(e)));}
  return;
 }
 const selectedKind=creamChartFollowup(question);
 const latestCream=[...history].reverse().find(x=>x.cream)?.cream;
 if(selectedKind&&latestCream){
  const updated:CreamResult={...latestCream,chartKind:selectedKind},now=Date.now();
  setHistory(prev=>[...prev,{role:"user",content:question,id:crypto.randomUUID(),createdAt:now},
   {role:"assistant",content:"CREAM 已切換圖表；統計結果與資料來源保持不變。",cream:updated,id:crypto.randomUUID(),createdAt:now+1}]);
  setDraft("");setLastRoute("CREAM 已切換圖型，無須呼叫 AI。");return;
 }
 if(await executeIntent(question))return;
 if(/^(?:開啟|打開|前往)(?:Vanilla\s*)?(?:表格|Sheets)(?:編輯器)?[！!。.?？\s]*$/i.test(question)){
  window.dispatchEvent(new Event("vanilla-open-sheets"));setDraft("");return;
 }
 if(/^(?:開啟|打開|前往)(?:Vanilla\s*)?(?:雲端檔案|Cloud\s*Files)(?:管理)?[！!。.?？\s]*$/i.test(question)){
  window.dispatchEvent(new Event("vanilla-open-files"));setDraft("");return;
 }
 if(/^(?:開啟|打開|前往)(?:Vanilla\s*)?(?:Self[- ]?Build|自建功能|功能工作室)(?:Studio)?[！!。.?？\s]*$/i.test(question)){
  window.dispatchEvent(new CustomEvent("vanilla-open-builder",{detail:{}}));setDraft("");return;
 }
 const buildRequest=/^(?:新增功能|製作功能|建立功能|功能需求)\s*[：:]\s*(.{3,1800})$/s.exec(question);
 const conversationalBuild=/^(?:(?:我想|我要|幫我|幫Vanilla|請|讓Vanilla).{0,25})?(?:新增|建立|製作|做一個|設計一個).{2,150}(?:功能|模組|小工具|工具)$/i.test(question)&&/(?:Vanilla|功能|工具|模組)/i.test(question);
 if(buildRequest||conversationalBuild){
  if(privateMode&&!window.confirm("要將私密對話中的這份功能構想複製到一般 Self-Build 工作室嗎？只有你確認使用模型時才會送出。"))return;
  window.dispatchEvent(new CustomEvent("vanilla-open-builder",{detail:{idea:buildRequest?.[1]||question}}));setDraft("");return;
 }
  const toneChange=applyExplicitToneRequest(question,privateMode);
 if(toneChange){
  setHistory(prev=>[...prev,{role:"user",content:question,id:crypto.randomUUID(),createdAt:Date.now()},{role:"assistant",content:toneChange,id:crypto.randomUUID(),createdAt:Date.now()+1}]);
  setDraft("");setLastRoute("已在本裝置調整語氣設定，不需要使用 AI API");
  return;
 }
  if(!canReply){setLastRoute("AI 模型尚未就緒。可以先開啟 Vanilla 表格或雲端檔案；若要聊天請載入本地 AI 或連線 Ollama／API。");return;}
 const task=classifyTask(question,Boolean(image));
 const localOnly=privateMode||/只用本地|僅用本地|不要上傳|不傳雲端|離線回答|私密回答/.test(question);
 let activeModel=selectedLocalModel,localReady=ready;
 const upgradeId=LOCAL_MODELS.find(m=>m.id.includes("1.5B")&&isLocalModelSupported(m.id))?.id;
 if((privateMode||(!providers.length&&!ollamaConnected))&&ready&&selectedLocalModel===LOCAL_MODEL&&!image&&
    (task==="code"||task==="analysis")&&upgradeId&&sessionStorage.getItem("vanilla.upgrade.asked.v1")!=="yes"){
  sessionStorage.setItem("vanilla.upgrade.asked.v1","yes");
  if(window.confirm("Vanilla 發現這題較複雜。手機目前只載入 0.5B 本地模型，回答品質可能不足。要另外下載並載入 1.5B 本地模型後再回答嗎？可能佔用較多空間與記憶體。")){
   setLoadingModel(true);setModelProgress(0);
   try{
    await loadLocalModel((message,progress)=>{setStatus(message);setModelProgress(Math.round(progress*100));},upgradeId);
    setSelectedLocalModel(upgradeId);setModelError(false);setStatus("進階本地模型已就緒");setReady(true);activeModel=upgradeId;localReady=true;
   }catch(e){setReady(false);localReady=false;setLastRoute("較大模型載入失敗："+(e instanceof Error?e.message:String(e)));}
   finally{setLoadingModel(false);}
  }
 }
 const discovered=listCandidates({localReady,localModel:activeModel,image:Boolean(image),online,privateMode:localOnly});
 const automatic=true;
 let candidates=automatic&&!allowMetered?discovered.filter(x=>x.source==="local"||(x.source==="ollama"&&x.location==="自架主機")):discovered;
 if(automatic&&!allowMetered&&!privateMode&&online&&providers.length&&task!=="casual"&&sessionStorage.getItem("vanilla.cloud.route.ask")!=="declined"){
  const qualityNeeded=Boolean(image)||task==="analysis"||task==="code"||task==="writing"||!candidates.length;
  if(qualityNeeded){
   const accepted=window.confirm("這次問題適合使用能力較高的雲端 AI。啟用智慧雲端路由後，Vanilla 可自動使用已連接的 Gemini／DeepSeek；API 可能受免費額度或計費限制，傳送對話前仍需你的授權。是否啟用？");
   if(accepted){changeMetered(true);candidates=discovered;}
   else sessionStorage.setItem("vanilla.cloud.route.ask","declined");
  }
 }

 const preference="quality" as const;
 const ranked=rankedCandidates(candidates,task,preference);
 const primary=localOnly?candidates.find(x=>x.source==="local"):ranked[0];
 if(!primary){
  setLastRoute(automatic&&!allowMetered?"目前沒有可用的免按量付費模型。請下載本地模型、連線自架 Ollama，或開啟允許計費 API。":image?"圖片辨識需要已連接的 Gemini API":"所選模型尚未就緒。請在裝置端面板載入模型，或到設定連接 Ollama／Gemini");
  return;
 }
 const chosen:ModelCandidate[]=compareMode&&!localOnly&&ranked.length>1?topComparisonCandidates(ranked,task,preference):[primary];
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
 if(!privateMode)learnToneFromMessage(question,false);
 const next:ChatTurn[]=[...history,{role:"user",content:question+(fileName?"（附件："+(imageName||fileName)+"）":""),id:crypto.randomUUID(),createdAt:Date.now()}];
 const assistantId=crypto.randomUUID(),assistantTime=Date.now()+1;
 const tableExpected=/(?:表格|比較表|試算表|工作簿)/.test(question);
 const extra=fileContext?"\n\n文件參考資料：\n"+fileContext:"";
 const tableInstruction=tableExpected?"\n\n請以標準 Markdown 表格（標題列加 --- 分隔列）呈現；表格資料不得捏造。":"";
 const memoryRequested=!privateMode&&driveSession()&&/(?:我|我們|我的|家庭|家族|之前|以前|記憶|健康|運動|旅行|旅遊|資料|紀錄|計畫|偏好|預算)/.test(question);
 let recalled="";
 if(memoryRequested)try{recalled=await knowledgeContext(question);}catch{}
 const modelNext:ChatTurn[]=[...history,{role:"user",content:question+extra+tableInstruction+(recalled?"\n\n使用者 Google Drive 授權的個人記憶節錄（來源可能不完整，勿假稱已再次驗證）：\n"+recalled:"")}];
 setDraft("");setBusy(true);
 if(chosen.length===2){
  const initial:ComparisonSession={question,task,options:chosen.map(candidate=>({candidate,status:"running" as const,text:""}))};
  setHistory(next);
  setComparison(initial);
  setLastRoute("雙答案比較中："+chosen.map(x=>x.label).join(" / "));
  const runCandidate=async(candidate:ModelCandidate)=>{
   try{
    const result=await generateCandidate(candidate,modelNext,image||undefined,text=>{
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
  setImage(null);setImageName("");setFileContext("");setFileName("");setFileStatus("");setBusy(false);
  setLastRoute("雙答案已完成，請選擇較喜歡的回答");
  return;
 }
 setHistory([...next,{role:"assistant",content:"",source:primary.source,model:primary.model,id:assistantId,createdAt:assistantTime}]);
 setLastRoute("正在使用："+primary.label);
 try{
  const result=await generateCandidate(primary,modelNext,image||undefined,text=>{
   setHistory([...next,{role:"assistant",content:text,source:primary.source,model:primary.model,id:assistantId,createdAt:assistantTime}]);
  });
  setHistory([...next,{role:"assistant",content:result||"（模型沒有產生內容）",source:primary.source,model:primary.model,id:assistantId,createdAt:assistantTime}]);
  setImage(null);setImageName("");setFileContext("");setFileName("");setFileStatus("");
  setLastRoute("上一則由 "+primary.label+" 回答");
 }catch(error){
  // Fail over only to an on-device model, or another model on the already approved Ollama host.
  // Never silently introduce a new remote cloud provider or incur an additional paid API request.
  const alternative=automatic?ranked.find(candidate=>candidate.id!==primary.id&&
   (candidate.source==="local"||(primary.source==="ollama"&&candidate.source==="ollama"))):undefined;
  if(alternative){
   setLastRoute(primary.label+" 無法回答，正在改用 "+alternative.label);
   try{
    const recovered=await generateCandidate(alternative,modelNext,undefined,text=>{
     setHistory([...next,{role:"assistant",content:text,source:alternative.source,model:alternative.model,id:assistantId,createdAt:assistantTime}]);
    });
    setHistory([...next,{role:"assistant",content:recovered||"（模型沒有產生內容）",source:alternative.source,model:alternative.model,id:assistantId,createdAt:assistantTime}]);setImage(null);setImageName("");setFileContext("");setFileName("");setFileStatus("");
    setLastRoute("已由 "+alternative.label+" 備援完成；原模型失敗已記錄");
   }catch(fallbackError){
    const msg=fallbackError instanceof Error?fallbackError.message:String(fallbackError);
    setHistory([...next,{role:"assistant",content:"模型與備援均無法回答："+msg,source:alternative.source,model:alternative.model,id:assistantId,createdAt:assistantTime}]);
    setLastRoute("主模型及備援模型皆失敗，請檢查連線與模型");
   }
  }else{
   setHistory([...next,{role:"assistant",content:"生成失敗："+(error instanceof Error?error.message:String(error)),source:primary.source,model:primary.model,id:assistantId,createdAt:assistantTime}]);
   setLastRoute("生成失敗，請檢查模型、網路、權限及額度");
  }
 }finally{setBusy(false);}
}
function openCreamInSheets(result:CreamResult){
 if(!creamDataset||creamDataset.importedAt!==result.importedAt||creamDataset.source!==result.source){setLastRoute("這份資料的原始列已不在目前記憶體；重新匯入 CSV／XLSX 才能建立可編輯副本。");return;}
 if(privateMode&&!window.confirm("要將私密對話的資料複製到一般本機 Sheets 工作區嗎？不會自動上傳 Google Drive。"))return;
 window.dispatchEvent(new CustomEvent("vanilla-open-sheet",{detail:{rows:[creamDataset.columns,...creamDataset.rows]}}));
}
function openTableInSheets(content:string){
 const rows=parseTable(content);if(!rows){setLastRoute("目前回答沒有可轉換的 Markdown 表格");return;}
 if(privateMode&&!window.confirm("這份表格來自私密對話。要將其複製到一般本機表格工作區嗎？不會自動上傳 Google Drive。"))return;
 window.dispatchEvent(new CustomEvent("vanilla-open-sheet",{detail:{rows}}));
}
function reportTone(kind:ToneFeedback){
 if(privateMode)return;
 toneFeedback(kind);
 setLastRoute("已更新語氣偏好。下一則回答會參考你的回饋，原文不會存進語氣學習資料。");
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
<div className="assistant-runtime-strip">
 <span><Sparkles size={15}/> Vanilla 自動調度</span>
 <span className="runtime-status" role="status">{loadingModel?"載入本地模型 "+modelProgress+"%":ready?"手機本地 AI 已就緒":capabilities.webgpu?"本地模型待載入":"此裝置未提供 WebGPU"}{!online?" · 離線":""}</span>
 {capabilities.webgpu&&!ready&&!loadingModel&&<button type="button" onClick={()=>void initialize()} disabled={busy}>下載最小本地模型</button>}
 <button type="button" className={privateMode?"runtime-private":""} disabled={busy} onClick={switchPrivacy} aria-pressed={privateMode}>{privateMode?"私密 · 僅本機":"一般模式"}</button>
 <label className="runtime-compare"><input type="checkbox" checked={compareMode} disabled={busy||privateMode||Boolean(comparison)} onChange={e=>changeCompareMode(e.target.checked)}/> 比較兩個答案</label>
</div>
<AssistantTools onPrompt={query=>void send(query)}/>
{(lastRoute||fileStatus||modelError)&&<p className="assistant-runtime-notice" role="status">{lastRoute||fileStatus||(modelError?status:"")}</p>}
{searchResults.length>0&&<div className="assistant-search-links">{searchResults.map(item=><a key={item.url} href={item.url} target="_blank" rel="noreferrer">{item.label} ↗</a>)}<button type="button" onClick={()=>setSearchResults([])}>收起搜尋連結</button></div>}
<div className="chat-messages" aria-live="polite">
{history.length===0?<div className="welcome"><div className="welcome-symbol"><Sparkles size={29}/></div><h2>今天想聊些什麼？</h2><p>Vanilla，專屬於你的私人 AI 工作空間。</p><div className="prompt-suggestions">{["幫我整理今天的想法","解釋一個複雜概念","一起規劃旅行"].map(x=><button key={x} disabled={busy||Boolean(comparison)} onClick={()=>void send(x)}>{x}<ArrowUp size={14}/></button>)}</div></div>:
<div className="message-list">{history.map((turn,index)=><div className={"message-row "+(turn.role==="user"?"from-user":"from-ai")} key={index}>{turn.role==="assistant"&&<span className="assistant-avatar"><Sparkles size={15}/></span>}<div className="message-content">{turn.role==="assistant"&&turn.source&&<div className="message-source">{turn.source==="local"?"本地 AI · 僅裝置端":turn.source==="ollama"?"Ollama · 指定端點":turn.source==="gemini"?"Gemini API · 雲端":"DeepSeek API · 雲端"}{turn.model&&<span className="model-id-suffix"> · {turn.model}</span>}</div>}<div className="message-text">{turn.content||"正在生成回答…"}</div>{turn.role==="assistant"&&renderTable(turn.content)}{turn.role==="assistant"&&turn.cream&&<CreamMessage result={turn.cream} onOpenSheets={creamDataset?.importedAt===turn.cream.importedAt&&creamDataset.source===turn.cream.source?()=>openCreamInSheets(turn.cream!):undefined}/>}{turn.role==="assistant"&&turn.content&&<button type="button" className="message-copy" title="複製回答" onClick={()=>void copyMessage(turn.content,index)}>{copied===index?<Check size={14}/>:<Copy size={14}/>}</button>}{turn.role==="assistant"&&turn.content&&<span className="smart-export"><button type="button" onClick={()=>exportText(turn.content,"md")}>MD</button><button type="button" onClick={()=>exportText(turn.content,"html")}>HTML</button><button type="button" onClick={()=>{try{exportText(turn.content,"csv");}catch(e){setLastRoute(String(e));}}}>CSV</button><button type="button" onClick={()=>window.print()}>PDF 列印</button>{parseTable(turn.content)&&<button type="button" onClick={()=>openTableInSheets(turn.content)}>在 Sheets 編輯</button>}</span>}{turn.role==="assistant"&&turn.content&&turn.source&&turn.model&&!turn.content.startsWith("生成失敗：")&&<span className="message-rating" aria-label="評價這則回答">
 <button type="button" aria-label="喜歡這個回答" title="喜歡這個回答" disabled={Boolean(turn.rating)} className={turn.rating==="up"?"selected":""} onClick={()=>rateAnswer(index,true)}><ThumbsUp size={14}/></button>
 <button type="button" aria-label="這個回答需要改善" title="這個回答需要改善" disabled={Boolean(turn.rating)} className={turn.rating==="down"?"selected":""} onClick={()=>rateAnswer(index,false)}><ThumbsDown size={14}/></button>
 </span>}{turn.role==="assistant"&&turn.content&&!privateMode&&<select className="tone-feedback-select" defaultValue="" aria-label="回饋這則回答的語氣" onChange={e=>{if(e.target.value)reportTone(e.target.value as ToneFeedback);e.currentTarget.value="";}}>
   <option value="">調整語氣…</option><option value="match">語氣很像我</option><option value="formal">太正式／太官腔</option><option value="verbose">太囉嗦</option><option value="cold">太冷淡</option>
  </select>}</div></div>)}<div ref={bottomRef}/></div>}
{comparison&&<CompareAnswers comparison={comparison} onChoose={chooseAnswer} onCancel={dismissComparison}/>}
</div>
<div className="composer-wrap">{fileName&&<div className="image-attachment">附件：{fileName} · {fileStatus||"正在處理"} <button type="button" onClick={()=>{setImage(null);setImageName("");setFileName("");setFileContext("");setFileStatus("");}}>移除本次附件</button></div>}<input ref={fileRef} type="file" accept="image/*,video/*,.txt,.md,.csv,.json,.pdf,.html,.xml,.docx,.xlsx,.pptx" style={{display:"none"}} onChange={e=>{void attachFile(e.target.files?.[0]);e.target.value="";}}/><form className="composer" onSubmit={event=>{event.preventDefault();void send();}}><textarea aria-label="輸入訊息" rows={1} placeholder="傳訊息給 Vanilla…（支援 CREAM：CSV 分析）" value={draft} disabled={busy||assetBusy||Boolean(comparison)} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();}}}/><div className="composer-toolbar"><span><button type="button" onClick={()=>fileRef.current?.click()} disabled={busy||assetBusy} title="加入圖片、文件或短影片；一般模式登入 Drive 後保存，私密模式不保存">＋ 附件</button><Sparkles size={14}/> {privateMode?"私密模式":providers.length||ollamaConnected?"Vanilla · 自動挑選模型":"Vanilla · 本地 AI"}</span><button type="submit" className="send-button" title="傳送" disabled={busy||assetBusy||Boolean(comparison)||(!draft.trim()&&!image&&!fileName)}><ArrowUp size={18}/></button></div></form><div className="composer-footnote">Vanilla 可能產生不正確資訊 · {privateMode?"私密對話僅儲存於此裝置，不會寫入一般聊天紀錄":"一般對話目前保存在此瀏覽器；模型選擇與偏好紀錄留在此裝置"}</div>{storageError&&<div className="model-notice" role="alert">裝置儲存空間不足，最新對話可能未儲存。請先備份重要內容，再刪除不需要的紀錄。</div>}{history.length>0&&<button className="clear-chat" type="button" disabled={busy} onClick={()=>{setHistory([]);setComparison(null);}}><RotateCcw size={13}/> 清除本次對話</button>}</div>
</section>;
}
