import {useState} from "react";
import {Cpu,Download,WifiOff,ChevronDown,CheckCircle2,AlertTriangle} from "lucide-react";
import {LOCAL_MODELS,getLoadedLocalModel,isLocalModelSupported,type LocalModelId} from "./engine";

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
};
export default function LocalModelPanel(props:Props){
 const [expanded,setExpanded]=useState(false);
 const current=getLoadedLocalModel();
 const state=props.ready?"已就緒":props.loading?"下載／初始化中":!props.webgpu?"無法使用 WebGPU":props.error?"載入失敗":"待載入";
 return <div className="local-model-panel">
  <button type="button" className="local-model-heading" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>
   <Cpu size={17}/><span>裝置端 AI</span>
   <span className={"local-model-state "+(props.ready?"ready":"")}>{props.ready?<CheckCircle2 size={14}/>:props.error?<AlertTriangle size={14}/>:null}{state}</span>
   {!props.online&&<span className="local-offline"><WifiOff size={13}/>離線</span>}
   <ChevronDown size={15} className={expanded?"open":""}/>
  </button>
  {expanded&&<div className="local-model-detail">
   <p>本地推論不會傳送對話給 Gemini 或 DeepSeek。模型需首次下載，之後通常可利用瀏覽器快取重新載入；iOS 可能清除快取，離線能力也取決於網站與模型是否已快取。</p>
   <label htmlFor="local-model-choice">本地模型</label>
   <div className="local-model-controls">
    <select id="local-model-choice" value={props.selected} disabled={props.loading} onChange={e=>props.onSelect(e.target.value as LocalModelId)}>
     {LOCAL_MODELS.map(m=><option key={m.id} value={m.id} disabled={!isLocalModelSupported(m.id)}>{m.label}{!isLocalModelSupported(m.id)?"（目前版本不支援）":""}</option>)}
    </select>
    <button type="button" disabled={!props.webgpu||props.loading||props.ready} onClick={props.onLoad}><Download size={15}/>{props.loading?"載入中":props.ready?"已載入":"下載／載入"}</button>
   </div>
   <p className="local-model-description">{LOCAL_MODELS.find(x=>x.id===props.selected)?.description}</p>
   {props.loading&&<progress max={100} value={Math.min(100,Math.max(0,props.progress))} aria-label="本地模型載入進度"/>}
   <div role="status" className={props.error?"local-model-error":"local-model-status"}>{props.status}{current&&current!==props.selected?" · 目前記憶體內為其他模型":""}</div>
   {!props.webgpu&&<p className="local-model-error">此瀏覽器沒有提供 WebGPU，本地推論不可用；一般模式仍可使用已連接的雲端模型。</p>}
  </div>}
 </div>;
}
