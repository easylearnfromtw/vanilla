import {useCallback,useEffect,useState} from "react";
import {VANILLA_BUILD} from "../version";
const assetUrl=()=>new URL(import.meta.env.BASE_URL+"version.json",location.origin).toString()+"?v="+Date.now();

/** The web app must never delete chat data, model cache, or Google Drive state during an update. */
export default function PWAUpdateNotice(){
 const [updateAvailable,setUpdateAvailable]=useState(false);
 const [checking,setChecking]=useState(false);
 const [notice,setNotice]=useState("");
 const check=useCallback(async()=>{
  try{
   const response=await fetch(assetUrl(),{cache:"no-store",credentials:"same-origin"});
   if(!response.ok)return;
   const data:unknown=await response.json();
   if(data&&typeof data==="object"&&"build" in data&&typeof data.build==="string"&&data.build!==VANILLA_BUILD)setUpdateAvailable(true);
  }catch{/* Offline is expected; keep the cached app available. */}
 },[]);
 useEffect(()=>{
  void check();
  const update=()=>{if(document.visibilityState==="visible")void check();};
  window.addEventListener("focus",update);
  document.addEventListener("visibilitychange",update);
  const interval=window.setInterval(()=>{void check();},5*60*1000);
  return()=>{window.removeEventListener("focus",update);document.removeEventListener("visibilitychange",update);window.clearInterval(interval);};
 },[check]);
 async function refresh(){
  if(checking)return;
  setChecking(true);setNotice("");
  try{
   if("serviceWorker" in navigator){
    const registration=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    if(registration){
     await registration.update();
     if(registration.waiting){
      registration.waiting.postMessage({type:"SKIP_WAITING"});
      await Promise.race([new Promise<void>(resolve=>navigator.serviceWorker.addEventListener("controllerchange",()=>resolve(),{once:true})),
       new Promise<void>(resolve=>window.setTimeout(resolve,1500))]);
     }
    }
   }
   location.reload();
  }catch(error){setNotice("更新失敗："+String(error instanceof Error?error.message:error));setChecking(false);}
 }
 return <span style={{display:"inline-flex",alignItems:"center",gap:7,flexWrap:"wrap",fontSize:11,color:"#6f6f6f"}}>
  <span title="此裝置實際載入的 Vanilla 前端版本">Build {VANILLA_BUILD}</span>
  {updateAvailable&&<button type="button" onClick={()=>void refresh()} disabled={checking} style={{fontSize:11,padding:"5px 8px",background:"#b44a3b",color:"white",border:0,borderRadius:7}}>{checking?"檢查更新中…":"新版可用 · 更新 Vanilla"}</button>}
  {notice&&<span role="alert">{notice}</span>}
 </span>;
}
