import {useCallback,useEffect,useState} from "react";
import {VANILLA_BUILD} from "../version";
import {publishedBuild,updateNavigationUrl} from "./update-version";

const assetUrl=()=>new URL(import.meta.env.BASE_URL+"version.json",location.origin).toString()+"?v="+Date.now();

/** Never delete conversations, IndexedDB, model downloads, or Google Drive state during an update. */
export default function PWAUpdateNotice(){
 const [availableBuild,setAvailableBuild]=useState<string|null>(null);
 const [checking,setChecking]=useState(false);
 const [refreshing,setRefreshing]=useState(false);
 const [notice,setNotice]=useState("");
 const check=useCallback(async(showResult=false)=>{
  if(showResult){setChecking(true);setNotice("");}
  try{
   const response=await fetch(assetUrl(),{cache:"no-store",credentials:"same-origin"});
   if(!response.ok)throw Error("HTTP "+response.status);
   const build=publishedBuild(await response.json());
   if(!build)throw Error("版本資料格式無效");
   setAvailableBuild(build);
   if(showResult)setNotice(build===VANILLA_BUILD?"已載入網站目前發布的最新版本。":"網站已發布新版本，點選「立即更新」即可載入。");
  }catch(error){
   if(showResult)setNotice("目前無法查證線上版本。請檢查網路及 GitHub Pages 發布狀態（"+String(error instanceof Error?error.message:error).slice(0,100)+"）。");
  }finally{if(showResult)setChecking(false);}
 },[]);
 useEffect(()=>{
  void check();
  const update=()=>{if(document.visibilityState==="visible")void check();};
  window.addEventListener("focus",update);
  document.addEventListener("visibilitychange",update);
  const interval=window.setInterval(()=>{void check();},5*60*1000);
  return()=>{window.removeEventListener("focus",update);document.removeEventListener("visibilitychange",update);window.clearInterval(interval);};
 },[check]);
 const updateAvailable=Boolean(availableBuild&&availableBuild!==VANILLA_BUILD);
 async function refresh(){
  if(refreshing||!availableBuild)return;
  setRefreshing(true);setNotice("");
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
   // A different URL ensures Safari reloads the document instead of reusing a stale app-shell entry.
   location.replace(updateNavigationUrl(location.href,availableBuild,Date.now()));
  }catch(error){setNotice("更新失敗："+String(error instanceof Error?error.message:error));setRefreshing(false);}
 }
 return <span style={{display:"inline-flex",alignItems:"center",gap:7,flexWrap:"wrap",fontSize:11,color:"#6f6f6f"}}>
  <span title="此裝置實際載入的 Vanilla 前端版本">Build {VANILLA_BUILD}</span>
  <button type="button" onClick={()=>void check(true)} disabled={checking||refreshing} style={{fontSize:11,padding:"5px 8px",border:"1px solid #d9d2c9",background:"transparent",borderRadius:7,color:"inherit"}}>{checking?"檢查中…":"檢查版本"}</button>
  {updateAvailable&&<button type="button" onClick={()=>void refresh()} disabled={refreshing} style={{fontSize:11,padding:"5px 8px",background:"#b44a3b",color:"white",border:0,borderRadius:7}}>{refreshing?"更新中…":"新版可用 · 立即更新"}</button>}
  {availableBuild&&<span title="GitHub Pages 提供的版本資訊">線上 {availableBuild}</span>}
  {notice&&<span role="status">{notice}</span>}
 </span>;
}