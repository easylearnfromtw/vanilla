import {useCallback,useEffect,useState} from "react";
import {CheckCircle2,AlertTriangle,RefreshCw,ExternalLink,ShieldCheck} from "lucide-react";
import {launchReadiness,launchCounts,LAUNCH_LABEL,type LaunchInput,type LaunchStatus} from "./readiness";
import {VANILLA_BUILD} from "../version";
import {getLoadedLocalModel} from "../local-ai/engine";
import {driveSession,listWorkspaceFiles} from "../workspace/cloud-drive";
import {getOllamaConfig,isOllamaConfigured,testOllama} from "../ai/ollama";
import {getGoogleClientId,getAnalyticsConnection} from "../cream/google-sources";
import {getSearchBridge,getWebReaderToken,fetchSearchBridge} from "../search/search-bridge";
import {readNoodles} from "../noodles/storage";
import {availableProviders} from "../vault/providers";
import "./release.css";

type ProbeKey="pages"|"drive"|"ollama"|"web";
type ProbeState={status:"success"|"error";message:string;checkedAt:string};
const names:Record<ProbeKey,string>={pages:"正式網站版本",drive:"Google Drive 唯讀存取",ollama:"Ollama 模型清單",web:"全網搜尋後端"};
function snapshot():LaunchInput{
 const online=typeof navigator!=="undefined"?navigator.onLine:false;
 return {
  online,cloudProvidersConfigured:availableProviders().length>0,localModelLoaded:Boolean(getLoadedLocalModel()),webGPU:typeof navigator!=="undefined"&&"gpu" in navigator,
  indexedDB:typeof indexedDB!=="undefined",driveAuthorized:Boolean(driveSession()),
  analyticsClientConfigured:Boolean(getGoogleClientId("analytics")),
  analyticsAuthorized:getAnalyticsConnection(),ollamaConfigured:isOllamaConfigured(),
  webSearchConfigured:Boolean(getSearchBridge()),webSearchTokenConfigured:Boolean(getWebReaderToken()),
  noodlesEnabled:readNoodles().enabled
 };
}
function timeStamp(){return new Date().toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"});}
async function probe(key:ProbeKey):Promise<string>{
 if(key==="pages"){
  const url=new URL(import.meta.env.BASE_URL+"version.json",location.origin);
  url.searchParams.set("t",String(Date.now()));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
   const response=await fetch(url,{cache:"no-store",credentials:"same-origin",signal:controller.signal});
   if(!response.ok)throw Error("HTTP "+response.status);
   const body=await response.json() as {build?:unknown};
   if(typeof body.build!=="string")throw Error("版本資訊格式錯誤");
   if(body.build!==VANILLA_BUILD)throw Error("此裝置載入 "+VANILLA_BUILD+"；網站已發布 "+body.build+"。請更新 PWA。");
   return "網站回傳 Build "+body.build+"，與目前載入版本一致。";
  }finally{clearTimeout(timer);}
 }
 if(key==="drive"){
  const session=driveSession();
  if(!session)throw Error("尚未取得有效的 Google Drive 工作階段；請先在設定中登入。");
  const files=await listWorkspaceFiles(session.token);
  return "Google Drive 唯讀清單請求成功；Vanilla Workspace 中有 "+files.length+" 個可列出的檔案。";
 }
 if(key==="ollama"){
  if(!isOllamaConfigured())throw Error("尚未設定 Ollama HTTPS 端點與模型 ID。");
  const config=getOllamaConfig();
  const response=await testOllama();
  const models=response.models.map(x=>x.name);
  if(!models.includes(config.model))throw Error("Ollama API 已連通，但設定的模型「"+config.model+"」不在模型清單內。");
  return "Ollama API 已連線並找到指定模型。未執行推論或產生 API 費用。";
 }
 if(!getSearchBridge()||!getWebReaderToken())throw Error("尚未設定安全 HTTPS 搜尋／擷取後端及本次分頁權杖。");
 const hits=await fetchSearchBridge("Vanilla AI");
 return "搜尋後端 HTTP 查詢成功，回傳 "+hits.length+" 筆結果。這不保證每個網站都能讀取全文。";
}
export default function ReleaseReadinessPanel(){
 const [input,setInput]=useState(snapshot);
 const [checks,setChecks]=useState<Partial<Record<ProbeKey,ProbeState>>>({});
 const [pending,setPending]=useState<ProbeKey|null>(null);
 const [expanded,setExpanded]=useState(true);
 const refresh=useCallback(()=>setInput(snapshot()),[]);
 useEffect(()=>{
  const events=["online","offline","vanilla-providers-changed","vanilla-drive-connected","vanilla-drive-disconnected","vanilla-noodles-changed","vanilla-search-bridge-changed"];
  for(const type of events)window.addEventListener(type,refresh);
  return()=>{for(const type of events)window.removeEventListener(type,refresh);};
 },[refresh]);
 const rows=launchReadiness(input),counts=launchCounts(rows);
 async function check(key:ProbeKey){
  if(pending)return;
  setPending(key);setChecks(old=>{const next={...old};delete next[key];return next;});
  try{const message=await probe(key);setChecks(old=>({...old,[key]:{status:"success",message,checkedAt:timeStamp()}}));}
  catch(error){setChecks(old=>({...old,[key]:{status:"error",message:error instanceof Error?error.message:String(error),checkedAt:timeStamp()}}));}
  finally{setPending(null);refresh();}
 }
 return <section className="release-check" aria-label="Vanilla 上線狀態與功能健康檢查">
  <div className="release-head">
   <div><span className="release-eyebrow">VANILLA / RELEASE READINESS</span><h3>正式上線健康檢查</h3><p>區分「程式已部署」「目前裝置可執行」「外部服務真的連線成功」。以下不會猜測金鑰、登入狀態或伺服器可用性。</p></div>
   <button type="button" onClick={()=>{refresh();setExpanded(x=>!x);}} aria-expanded={expanded}>{expanded?"收起詳細檢查":"展開詳細檢查"}</button>
  </div>
  <p className="release-build"><ShieldCheck size={14}/>目前裝置 Build <code>{VANILLA_BUILD}</code></p>
  <div className="release-totals">
   {(["ready","limited","setup","planned"] as LaunchStatus[]).map(status=><div key={status} className={"release-total release-"+status}><strong>{counts[status]}</strong><span>{LAUNCH_LABEL[status]}</span></div>)}
  </div>
  {expanded&&<>
   <h4>實際連線驗證</h4>
   <p className="release-small">以下檢查只在你點擊時執行。Drive 僅讀取檔案清單；Ollama 讀模型清單；搜尋後端測試會送出公開的「Vanilla AI」搜尋詞，可能計入 API 額度。</p>
   <div className="release-probes">
    {(["pages","drive","ollama","web"] as ProbeKey[]).map(key=><div key={key} className="release-probe">
      <div><strong>{names[key]}</strong>
       {checks[key]?<p className={checks[key]?.status==="success"?"passed":"failed"}>{checks[key]?.message} · {checks[key]?.checkedAt}</p>:<small>尚未在此裝置測試</small>}
      </div><button type="button" onClick={()=>void check(key)} disabled={Boolean(pending)}><RefreshCw size={13}/>{pending===key?"測試中…":"測試"}</button>
     </div>)}
   </div>
   <h4>功能上線盤點</h4>
   <div className="release-items">{rows.map(row=><details key={row.id} className={"release-item release-"+row.status}>
     <summary><span aria-hidden="true">{row.status==="ready"?<CheckCircle2 size={15}/>:<AlertTriangle size={15}/>}</span><strong>{row.name}</strong><small>{LAUNCH_LABEL[row.status]}</small></summary>
     <p>{row.description}</p>{row.action&&<p className="release-next">下一步：{row.action}</p>}
    </details>)}</div>
   <p className="release-small">全部列為「本機可用」才可能代表目前裝置符合設定；正式上線仍須通過實機驗收。CREAM 14 模組、NOODLES 完整自主訓練等規劃功能不因網站成功部署而變成已完成。</p>
   <a href="https://github.com/easylearnfromtw/vanilla/actions" target="_blank" rel="noopener noreferrer">查看 GitHub Pages 建置／部署紀錄 <ExternalLink size={13}/></a>
  </>}
 </section>;
}
