import {useState} from "react";
import {Cpu,Download,WifiOff,CheckCircle2,AlertTriangle,HardDrive} from "lucide-react";
import {LOCAL_MODELS,getLoadedLocalModel,isLocalModelSupported,localWorkerMode,setLocalWorkerMode,isLocalWorkerActive,diagnoseLocalModelDownload,type LocalModelId} from "./engine";
import type {DownloadDiagnostic} from "./model-download-diagnostics";
import {isIOSWebLLMDevice,needsMobileMemoryConfirmation} from "./mobile-safety";
import {ATUBER_SINGLE_DRIVER,ATUBER_LOCAL_MODEL,ATUBER_TIERS,OCTUBER_HIGH_CAPACITY,octuberTierPreference,setOctuberTierPreference,type OctuberTierPreference} from "../ai/atuber-control-plane";
import {getOllamaConfig,probeAtuberModel} from "../ai/ollama";
import {atuberModelStageLabel,ATUBER_HAS_INDEPENDENT_WEIGHTS} from "../ai/atuber-model-status";

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
 const [tierChoice,setTierChoice]=useState<OctuberTierPreference>(octuberTierPreference);
 const [diagnosing,setDiagnosing]=useState(false);
 const [diagnosis,setDiagnosis]=useState<DownloadDiagnostic[]>([]);
 const [diagnosedModel,setDiagnosedModel]=useState<string|null>(null);
 const [tierProbe,setTierProbe]=useState<Record<string,{ok:boolean;note:string}>>({});
 const [probingTier,setProbingTier]=useState<string|null>(null);
 async function runTierProbe(model:"october:sm"|"october:ml"|"october:lg"|"octuber:flattering"|"octuber:modest"|"octuber:sumptuous"|"octuber:sumptuous-32b"){
  if(probingTier)return;
  setProbingTier(model);
  setTierProbe(prev=>({...prev,[model]:{ok:false,note:"正在驗證模型推論…"}}));
  try{
   const result=await probeAtuberModel(model);
   setTierProbe(prev=>({...prev,[model]:{ok:true,note:"已成功推論 · "+(result.elapsedMs/1000).toFixed(1)+" 秒"}}));
  }catch(error){
   setTierProbe(prev=>({...prev,[model]:{ok:false,
    note:"未通過 · "+String(error instanceof Error?error.message:error).slice(0,110)}}));
  }finally{setProbingTier(null);}
 }
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
 const visibleModels=ATUBER_SINGLE_DRIVER?LOCAL_MODELS.filter(x=>x.id===ATUBER_LOCAL_MODEL):LOCAL_MODELS;
 const hostModels=new Set([getOllamaConfig().model,...getOllamaConfig().models]);
 const state=props.ready?"已就緒":props.loading?"下載／初始化中 "+props.progress+"%":!props.webgpu?"無法使用 WebGPU":props.error?"載入失敗":props.cached?"已快取，可離線載入":"尚未下載";
 return <div className="local-model-panel">
  <div className="local-model-heading">
   <Cpu size={17}/><span>{atuberModelStageLabel()}</span>
   <span className={"local-model-state "+(props.ready?"ready":"")}>{props.ready?<CheckCircle2 size={14}/>:props.error?<AlertTriangle size={14}/>:null}{state}</span>
   {!props.online&&<span className="local-offline"><WifiOff size={13}/>離線</span>}
  </div>
  <div className="local-model-detail">
   <label htmlFor="local-model-choice">模型</label>
   <div className="local-model-controls">
    <select id="local-model-choice" value={props.selected} disabled={props.loading} onChange={e=>props.onSelect(e.target.value as LocalModelId)}>
     {visibleModels.map(m=><option key={m.id} value={m.id} disabled={!isLocalModelSupported(m.id)}>{m.label}{m.recommended?"（推薦）":""}{!isLocalModelSupported(m.id)?"（此版本不支援）":""}</option>)}
    </select>
    <button type="button" disabled={!props.webgpu||props.loading||props.repairingCache||props.ready} onClick={props.onLoad}><Download size={15}/>{props.loading?"載入中":props.ready?"已載入":props.cached?"載入":"下載"}</button>
   </div>
   <p className="local-model-description"><HardDrive size={12}/> {entry?.description}</p>
   {ATUBER_SINGLE_DRIVER&&!ATUBER_HAS_INDEPENDENT_WEIGHTS&&<p className="local-model-note" role="status">目前運行的是未經專屬微調的 Qwen3 0.6B 基底權重。阿土伯可統一操作工具，但獨立模型權重須先完成審核資料訓練、合併與驗證；改名不等於完成訓練。</p>}
   {ATUBER_SINGLE_DRIVER&&<section className="local-model-tiers" aria-label="OCTUBER 模型級距">
    <p className="local-model-note"><strong>OCTUBER 三種規格</strong> · FLATTERING（本機 0.6B／自架 4B）、MODEST（14B）、SUMPTUOUS（30B MoE／32B Dense）。選擇偏好僅在對應自架模型已配置時生效，不會自動下載主機權重。</p>
    <label className="local-model-note" htmlFor="octuber-tier-choice">運算規格偏好</label>
    <select id="octuber-tier-choice" value={tierChoice} onChange={event=>{const next=event.target.value as OctuberTierPreference;setTierChoice(next);setOctuberTierPreference(next);}}>
     <option value="auto">自動依任務選擇（預設）</option>
     {[...ATUBER_TIERS,OCTUBER_HIGH_CAPACITY].map(t=><option key={t.tier} value={t.tier}>{t.label}</option>)}
    </select>
    <p className="local-model-note">私密模式一律留在本機；複雜任務仍遵循最低能力級距，未連線或測試失敗的主機不應視為可用。</p>
    {[...ATUBER_TIERS,OCTUBER_HIGH_CAPACITY].map(t=><div key={t.tier} className="local-model-note">
     <strong>{t.brand}</strong> · {t.base} · 約 {t.approxDownloadGB} GB 權重檔 · {[t.model,t.publicAlias].some(name=>hostModels.has(name))?"已登記（待驗證）":"尚未登記"}
     <p>部署別名：<code>{t.publicAlias}</code>（相容 <code>{t.model}</code>）</p>
     {Boolean(getOllamaConfig().endpoint)&&[t.model,t.publicAlias].some(name=>hostModels.has(name))&&<button
      type="button" disabled={probingTier!==null||!props.online}
      onClick={()=>void runTierProbe(hostModels.has(t.publicAlias)?t.publicAlias:t.model)}>
      {probingTier===(hostModels.has(t.publicAlias)?t.publicAlias:t.model)?"正在測試…":"實際推論測試"}
     </button>}
     {(tierProbe[t.model]||tierProbe[t.publicAlias])&&<p role="status" aria-live="polite" className={(tierProbe[t.model]||tierProbe[t.publicAlias]).ok?"local-model-status":"local-model-note"}>{(tierProbe[t.model]||tierProbe[t.publicAlias]).note}</p>}
    </div>)}
    <p className="local-model-note">私密模式使用裝置端 0.6B；其他型號需由已授權主機承載，不會自行購買算力或轉用第三方模型。</p>
   </section>}
   {props.loading&&<progress max={100} value={Math.min(100,Math.max(0,props.progress))} aria-label="本地模型載入進度"/>}
   <div role="status" className={props.error?"local-model-error":"local-model-status"}>{props.status}{current&&current!==props.selected?" · 目前記憶體內為 "+(LOCAL_MODELS.find(x=>x.id===current)?.label||current):""}</div>
   {(props.error||props.cached)&&!props.ready&&<button type="button" className="local-cache-repair" disabled={props.loading||props.repairingCache} onClick={props.onRepairCache}>{props.repairingCache?"正在清除本模型快取…":"清除這個模型的快取後重試"}</button>}
   {props.error&&<p className="local-model-note">只處理所選模型，不刪除聊天紀錄或其他已下載模型。建議先確認 Wi-Fi 可以開啟 Hugging Face。</p>}
   <button type="button" className="local-cache-repair" disabled={props.loading||props.repairingCache||diagnosing} onClick={()=>void checkDownload()}>{diagnosing?"正在檢查手機、模型來源及儲存空間…":"檢查此 iPhone 的模型下載環境"}</button>
   {visibleDiagnosis.length>0&&<div className="local-model-diagnostics" role="status" aria-live="polite">
    {visibleDiagnosis.map((item,index)=><p key={index} className={item.kind==="error"?"local-model-error":"local-model-note"}><strong>{item.kind==="ok"?"✓":item.kind==="warning"?"!":"×"} {item.name}：</strong>{item.detail}</p>)}
    <p className="local-model-note">連線測試僅檢查設定檔和權重檔的起始回應，不會下載完整模型，也不代表推論已通過實機驗證。</p>
   </div>}
   {!props.webgpu&&<p className="local-model-error">此瀏覽器沒有 WebGPU（iPhone 需 iOS 26 以上 Safari），本地推論不可用；一般模式可使用已接上的自架阿土伯 Ollama；其他模型不會自動接管。</p>}
   {iosDevice&&<p className="local-model-note">首次進入會嘗試取得約 350 MB 的 OCTUBER FLATTERING 0.6B 模型。模型檔案最多兩路並行串流、已完整快取的檔案可在下一次載入時重用；若記憶體、GPU 或網路不足，將停止並提示改用已授權的較大型自架模型。自動載入採背景執行緒，不會悄悄切到可能卡住畫面的相容模式。{needsMobileMemoryConfirmation(iosDevice,entry?.vramMB||0)?"手動重試仍需確認記憶體風險。":""}</p>}
   <label className="vh-switch compact"><input type="checkbox" checked={worker==="auto"} onChange={e=>{const mode=e.target.checked?"auto":"off";setLocalWorkerMode(mode);setWorker(mode);}}/>
    <span><strong>背景執行緒推論</strong><small>{worker==="broken"?"上次背景執行緒失敗，已停止自動備援；勾選即可重試":isLocalWorkerActive()?"使用中：生成時捲動與輸入更順":"下次載入模型時生效"}</small></span></label>
   <p className="local-model-note">本地推論不會傳送對話到任何雲端。模型首次需下載，之後由瀏覽器快取；iOS 長期未使用可能清除快取。所有裝置在背景執行緒失敗時都不會自動回退主執行緒；只有手動關閉背景執行緒才會使用相容模式。此模式可能使介面卡頓，iPhone 也可能整頁重新載入。</p>
  </div>
 </div>;
}
