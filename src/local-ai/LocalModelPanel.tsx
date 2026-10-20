import {useState} from "react";
import {Cpu,Download,WifiOff,CheckCircle2,AlertTriangle,HardDrive} from "lucide-react";
import {LOCAL_MODELS,getLoadedLocalModel,isLocalModelSupported,localWorkerMode,setLocalWorkerMode,isLocalWorkerActive,type LocalModelId} from "./engine";
import {isIOSWebLLMDevice,needsMobileMemoryConfirmation} from "./mobile-safety";

type Props={
 selected:LocalModelId;
 onSelect:(model:LocalModelId)=>void;
 onLoad:()=>void;
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
    <button type="button" disabled={!props.webgpu||props.loading||props.ready} onClick={props.onLoad}><Download size={15}/>{props.loading?"載入中":props.ready?"已載入":props.cached?"載入":"下載"}</button>
   </div>
   <p className="local-model-description"><HardDrive size={12}/> {entry?.description}</p>
   {props.loading&&<progress max={100} value={Math.min(100,Math.max(0,props.progress))} aria-label="本地模型載入進度"/>}
   <div role="status" className={props.error?"local-model-error":"local-model-status"}>{props.status}{current&&current!==props.selected?" · 目前記憶體內為 "+(LOCAL_MODELS.find(x=>x.id===current)?.label||current):""}</div>
   {!props.webgpu&&<p className="local-model-error">此瀏覽器沒有 WebGPU（iPhone 需 iOS 26 以上 Safari），本地推論不可用；一般模式仍可使用已連接的雲端模型或 Ollama。</p>}
   {iosDevice&&<p className="local-model-note">iPhone 安全模式：不在開啟網頁時自動啟動快取模型；請手動載入。優先選擇 0.5B。{needsMobileMemoryConfirmation(iosDevice,entry?.vramMB||0)?"目前選擇的模型記憶體需求較高，載入前會再次確認。":""}背景執行緒失敗時不會自動改在主畫面運算，以避免整頁崩潰。</p>}
   <label className="vh-switch compact"><input type="checkbox" checked={worker==="auto"} onChange={e=>{const mode=e.target.checked?"auto":"off";setLocalWorkerMode(mode);setWorker(mode);}}/>
    <span><strong>背景執行緒推論</strong><small>{worker==="broken"?"上次背景執行緒失敗，已停止自動備援；勾選即可重試":isLocalWorkerActive()?"使用中：生成時捲動與輸入更順":"下次載入模型時生效"}</small></span></label>
   <p className="local-model-note">本地推論不會傳送對話到任何雲端。模型首次需下載，之後由瀏覽器快取；iOS 長期未使用可能清除快取。iPhone 關閉背景執行緒代表您明確選用高風險的主執行緒相容模式，可能導致 Safari 整頁重新載入。</p>
  </div>
 </div>;
}
