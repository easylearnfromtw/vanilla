/** A second Detroit chat entrance: Telegram -> signed WeiGuo inbox -> THIS device.
 * This foreground worker never starts a browser model, runs code, or bypasses Athena.
 * No service workers/background tasks: closing or hiding the PWA stops inference.
 */
import {useEffect} from "react";
import {currentChatMode} from "../local-ai/chat-session";
import {getLoadedLocalModel,isLocalModelReady} from "../local-ai/engine";
import {listCandidates} from "../ai/model-orchestrator";
import {weiGuoIdentity,getCeresBridgeStatus,claimCeresBridgeJob,
 completeCeresBridgeJob,skipCeresBridgeJob} from "../weiguo/api";
import {bridgePreference} from "./bridge-settings";

export const CERES_RUNTIME_STATUS_EVENT="vanilla-ceres-runtime-status";
function publish(detail:string):void{
 window.dispatchEvent(new CustomEvent(CERES_RUNTIME_STATUS_EVENT,{detail}));
}
function currentLocalModel(){
 const id=getLoadedLocalModel();
 if(!id||!isLocalModelReady(id))return null;
 return listCandidates({
  localReady:true,localModel:id,image:false,online:navigator.onLine,privateMode:false
 }).find(x=>x.source==="local")||null;
}
export default function CeresForegroundBridge(){
 useEffect(()=>{
  let stopped=false;
  let running=false;
  let serverChecked=0;
  let serverEnabled=false;
  let lastStatus="";
  let active:AbortController|null=null;
  const setStatus=(status:string)=>{
   if(status!==lastStatus){lastStatus=status;publish(status);}
  };
  const onHidden=()=>{
   if(document.visibilityState!=="visible")active?.abort();
  };
  const tick=async()=>{
   if(stopped||running)return;
   running=true;
   try{
    const owner=weiGuoIdentity();
    if(!owner){setStatus("請先在 Vanilla 登入衞國家庭帳號");return;}
    if(!bridgePreference(owner.email)){setStatus("前景自動回覆已關閉");return;}
    if(currentChatMode()==="private"){setStatus("Vanilla 私密模式不執行 Ceres 橋接");return;}
    if(document.visibilityState!=="visible"){setStatus("Vanilla 不在前景，已暫停");return;}
    const model=currentLocalModel();
    if(!model){setStatus("需先在 Vanilla 載入手機本地 AI 模型");return;}
    if(!navigator.onLine){setStatus("裝置離線，已暫停");return;}
    if(Date.now()-serverChecked>30_000){
     const status=await getCeresBridgeStatus();
     serverChecked=Date.now();
     serverEnabled=Boolean(status.enabled&&status.linked&&!status.privilegedExecution);
    }
    if(!serverEnabled){setStatus("Railway 尚未啟用 Ceres 本地橋接");return;}
    setStatus("本地 Ceres 已連線，等待 Telegram 新訊息");
    const {job}=await claimCeresBridgeJob();
    if(!job)return;
    const controller=new AbortController();
    active=controller;
    let completed=false;
    try{
     // Foreground local model and Diana only. No privileged API is made available.
     const {answerFromCeres}=await import("./agent-tools");
     if(stopped||document.visibilityState!=="visible"||
       weiGuoIdentity()?.email!==owner.email||!bridgePreference(owner.email)){
      await skipCeresBridgeJob(job);
      return;
     }
     setStatus("Diana／Zeus 正在處理新的 Telegram 訊息");
     const result=await answerFromCeres(job.text,model,controller.signal);
     if(controller.signal.aborted||stopped||document.visibilityState!=="visible"||
        weiGuoIdentity()?.email!==owner.email||!bridgePreference(owner.email)){
      await skipCeresBridgeJob(job);
      return;
     }
     await completeCeresBridgeJob(job,result.text,result.tool);
     completed=true;
     setStatus("已由 Detroit 工具完成 Telegram 自動回覆");
     window.dispatchEvent(new Event("vanilla-ceres-refresh"));
    }catch{
     // No fallback provider, no retries and no unverified claims of delivery.
     if(!completed){
      try{await skipCeresBridgeJob(job);}catch{}
     }
     setStatus("這則 Telegram 工作未完成；已停止重試，請改用人工工作台");
    }finally{
     if(active===controller)active=null;
    }
   }catch{
    serverChecked=0;
    setStatus("無法連線到衞國，或登入已過期；自動回覆已暫停");
   }finally{
    running=false;
   }
  };
  document.addEventListener("visibilitychange",onHidden);
  const id=window.setInterval(()=>{void tick();},5000);
  void tick();
  return ()=>{
   stopped=true;
   active?.abort();
   document.removeEventListener("visibilitychange",onHidden);
   window.clearInterval(id);
  };
 },[]);
 return null;
}
