import {useState} from "react";
import {Cpu,Download,WifiOff,CheckCircle2,AlertTriangle,HardDrive} from "lucide-react";
import {LOCAL_MODELS,getLoadedLocalModel,isLocalModelSupported,localWorkerMode,setLocalWorkerMode,isLocalWorkerActive,diagnoseLocalModelDownload,type LocalModelId} from "./engine";
import type {DownloadDiagnostic} from "./model-download-diagnostics";
import {isIOSWebLLMDevice,needsMobileMemoryConfirmation} from "./mobile-safety";

type Props={
 selected:LocalModelId;
 onSelect:(model:LocalModelId)=>void;
 onLoad:()=>void;
 onRepairCache:()=>void;
 repairingCache:boolean;
 status:string;
 progress:number;
 loading:boolean;
 error:boolean;
 webgpu:boolean;
 online:boolean;
 ready:boolean;
 cached?:boolean|null;
};
/** On-device model picker: honest size, cache state, and where inference runs. */
export default function LocalModelPanel(props:Props){
 const [worker,setWorker]=useState(localWorkerMode());
 const [diagnosing,setDiagnosing]=useState(false);
 const [diagnosis,setDiagnosis]=useState<DownloadDiagnostic[]>([]);
 const [diagnosedModel,setDiagnosedModel]=useState<string|null>(null);
 const visibleDiagnosis=diagnosedModel===props.selected?diagnosis:[];
 async function checkDownload(){
  if(diagnosing||props.loading)return;
  const selected=props.selected;
  setDiagnosing(true);setDiagnosis([]);setDiagnosedModel(selected);
  try{setDiagnosis(await diagnoseLocalModelDownload(selected));}
  catch{setDiagnosis([{kind:"error",name:"診斷無法執行",detail:"此模型的下載設定無法讀取。請先使用 WebLLM 支援的模型或重新載入網站。"}]);}
  finally{setDiagnosing(false);}
 }
 const iosDevice=isIOSWebLLMDevice(navigator.userAgent,navigator.platform,navigator.maxTouchPoints);
 const current=getLoadedLocalModel();
 const entry=LOCAL_MODELS.find(x=>x.id===props.selected);
 const state=props.ready?"已就緒":props.loading?"下載／初始化中 "+props.progress+"%":!props.webgpu?"無法使用 WebGPU":props.error?"載入失敗":props.cached?"已快取，可離線載入":"尚未下載";
 return <div className="local-model-panel">
  <div className="local-model-heading">
   <Cpu size={17}/><span>手機本地 AI</span>
   <span className={"local-model-state "+(props.ready?"ready":"")}>{props.ready?<CheckCircle2 size={14}/>:props.error?<AlertTriangle size={14}/>:null}{state}</span>
   {!props.online&&<span className="local-offline"><WifiOff size={13}/>離線</span>}
  </div>
  <div className="local-model-detail">
   <label htmlFor="local-model-choice">模型</label>
   <div className="local-model-controls">
    <select id="local-model-choice" value={props.selected} disabled={props.loading} onChange={e=>props.onSelect(e.target.value as LocalModelId)}>
     {LOCAL_MODELS.map(m=><option key={m.id} value={m.id} disabled={!isLocalModelSupported(m.id)}>{m.label}{m.recommended?"（推薦）":""}{!isLocalModelSupported(m.id)?"（此版本不支援）":""}</option>)}
    </select>
    <button type="button" disabled={!props.webgpu||props.loading||props.repairingCache||props.ready} onClick={props.onLoad}><Download size={15}/>{props.loading?"載入中":props.ready?"已載入":props.cached?"載入":"下載"}</button>
   </div>
   <p className="local-model-description"><HardDrive size={12}/> {entry?.description}</p>
   {props.loading&&<progress max={100} value={Math.min(100,Math.max(0,props.progress))} aria-label="本地模型載入進度"/>}
   <div role="status" className={props.error?"local-model-error":"local-model-status"}>{props.status}{current&&current!==props.selected?" · 目前記憶體內為 "+(LOCAL_MODELS.find(x=>x.id===current)?.label||current):""}</div>
   {(props.error||props.cached)&&!props.ready&&<button type="button" className="local-cache-repair" disabled={props.loading||props.repairingCache} onClick={props.onRepairCache}>{props.repairingCache?"正在清除本模型快取…":"清除這個模型的快取後重試"}</button>}
   {props.error&&<p className="local-model-note">只處理所選模型，不刪除聊天紀錄或其他已下載模型。建議先確認 Wi-Fi 可以開啟 Hugging Face。</p>}
   <button type="button" className="local-cache-repair" disabled={props.loading||props.repairingCache||diagnosing} onClick={()=>void checkDownload()}>{diagnosing?"正在檢查手機、模型來源及儲存空間…":"檢查此 iPhone 的模型下載環境"}</button>
   {visibleDiagnosis.length>0&&<div className="local-model-diagnostics" role="status" aria-live="polite">
    {visibleDiagnosis.map((item,index)=><p key={index} className={item.kind==="error"?"local-model-error":"local-model-note"}><strong>{item.kind==="ok"?"✓":item.kind==="warning"?"!":"×"} {item.name}：</strong>{item.detail}</p>)}
    <p className="local-model-note">連線測試僅檢查設定檔和權重檔的起始回應，不會下載完整模型，也不代表推論已通過實機驗證。</p>
   </div>}
   {!props.webgpu&&<p className="local-model-error">此瀏覽器沒有 WebGPU（iPhone 需 iOS 26 以上 Safari），本地推論不可用；一般模式仍可使用已連接的雲端模型或 Ollama。</p>}
   {iosDevice&&<p className="local-model-note">iPhone 安全模式：不在開啟網頁時自動啟動快取模型；請手動載入。優先選擇 0.5B。{needsMobileMemoryConfirmation(iosDevice,entry?.vramMB||0)?"目前選擇的模型記憶體需求較高，載入前會再次確認。":""}背景執行緒失敗時不會自動改在主畫面運算，以避免整頁崩潰。</p>}
   <label className="vh-switch compact"><input type="checkbox" checked={worker==="auto"} onChange={e=>{const mode=e.target.checked?"auto":"off";setLocalWorkerMode(mode);setWorker(mode);}}/>
    <span><strong>背景執行緒推論</strong><small>{worker==="broken"?"上次背景執行緒失敗，已停止自動備援；勾選即可重試":isLocalWorkerActive()?"使用中：生成時捲動與輸入更順":"下次載入模型時生效"}</small></span></label>
   <p className="local-model-note">本地推論不會傳送對話到任何雲端。模型首次需下載，之後由瀏覽器快取；iOS 長期未使用可能清除快取。iPhone 關閉背景執行緒代表您明確選用高風險的主執行緒相容模式，可能導致 Safari 整頁重新載入。</p>
  </div>
 </div>;
}
