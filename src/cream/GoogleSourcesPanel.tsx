import {useEffect,useState} from "react";
import {analyzeCream,summarizeCream,type CreamDataset} from "./core";
import {connectAnalytics,disconnectAnalytics,fetchAnalyticsReport,getAnalyticsConnection,getGoogleClientId,
 listAnalyticsProperties,lookerStudioLink,setGoogleClientId,type GA4Property,type GA4Dimension,type GA4Metric} from "./google-sources";
import "./google-sources.css";

type Props={privateMode:boolean;onAnalyze:(dataset:CreamDataset,summary:string)=>void};
const DIMENSIONS:[GA4Dimension,string][]=[["date","日期趨勢"],["sessionDefaultChannelGroup","流量來源"],["country","國家"],["eventName","事件名稱"]];
const METRICS:[GA4Metric,string][]=[["activeUsers","活躍使用者"],["sessions","工作階段"],["eventCount","事件數"],["totalUsers","總使用者"],["screenPageViews","頁面瀏覽次數"]];
export default function GoogleSourcesPanel({privateMode,onAnalyze}:Props){
 const [open,setOpen]=useState(false);
 const [clientId,setClientId]=useState(()=>getGoogleClientId("analytics"));
 const [connected,setConnected]=useState(getAnalyticsConnection);
 const [properties,setProperties]=useState<GA4Property[]>([]);
 const [propertyId,setPropertyId]=useState("");
 const [dimension,setDimension]=useState<GA4Dimension>("date");
 const [metric,setMetric]=useState<GA4Metric>("activeUsers");
 const [days,setDays]=useState<7|28|90>(28);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 useEffect(()=>{
  if(!open||privateMode)return;
  // Warm up GIS script before the user clicks; iPhone popups need a user gesture.
  const el=document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
  if(!el&&!window.google?.accounts?.oauth2){
   const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.async=true;
   document.head.appendChild(script);
  }
 },[open,privateMode]);
 async function authorize(){
  if(privateMode){setMessage("私密模式不連線 Google Analytics；請切換一般模式。");return;}
  setBusy(true);setMessage("");
  try{
   setGoogleClientId("analytics",clientId);
   await connectAnalytics();
   setConnected(true);
   setMessage("Google Analytics 已取得唯讀授權，授權令牌只保存在這次開啟的網頁記憶體。");
   const found=await listAnalyticsProperties();
   setProperties(found);setPropertyId(found[0]?.id||"");
   if(!found.length)setMessage("OAuth 授權成功，但沒有找到可存取的 GA4 資源。請確認帳號權限、GA Admin API 啟用狀況。");
  }catch(error){setConnected(false);setMessage("連線失敗："+(error instanceof Error?error.message:String(error)));}
  finally{setBusy(false);}
 }
 async function refresh(){
  setBusy(true);
  try{const found=await listAnalyticsProperties();setProperties(found);setPropertyId(previous=>found.some(p=>p.id===previous)?previous:found[0]?.id||"");setMessage("已讀取 "+found.length+" 個 GA4 資源。");}
  catch(e){setMessage("無法取得 GA4 資源："+String(e));}
  finally{setBusy(false);}
 }
 async function analyze(){
  if(!propertyId)return;
  setBusy(true);setMessage("正在從 Google Analytics API 讀取真實資料…");
  try{
   const report=await fetchAnalyticsReport({propertyId,dimension,metric,days});
   const validation=analyzeCream(report.dataset);
   if(!validation.metrics.length)throw Error("GA4 回傳資料沒有可計算的數值欄");
   const label=properties.find(p=>p.id===propertyId)?.name||"GA4";
   onAnalyze(report.dataset,"Google Analytics 4「"+label+"」唯讀資料已匯入 CREAM。"+summarizeCream(validation)+" 數值來自 GA4 Data API，不是模型估算。");
   setMessage("資料已匯入聊天中的 CREAM；未自動上傳 Google Drive 或傳送到外部 LLM。");
  }catch(e){setMessage("匯入失敗："+String(e));}
  finally{setBusy(false);}
 }
 const selected=properties.find(x=>x.id===propertyId);
 return <section className="cream-google" aria-label="Google Analytics 與 Looker Studio 串接">
  <button className="cream-google-toggle" type="button" onClick={()=>setOpen(!open)} aria-expanded={open}>
   <strong>CREAM <span>× GOOGLE</span></strong>
   <span>Analytics 資料導入 · Looker Studio 報表 {open?"−":"＋"}</span>
  </button>
  {open&&<div className="cream-google-body">
   <p>**CREAM 是主要分析引擎**。Analytics 提供原始彙整數據；Looker Studio 提供外部報表。Google OAuth Client Secret 不會存放在 Vanilla。</p>
   {privateMode?<p className="cream-google-warning">目前為私密模式，已停用 Google Analytics 連線與資料讀取。</p>:<>
    <label>Analytics OAuth Client ID（不是 GOCSPX- Secret）
     <input type="text" spellCheck={false} placeholder="123456789-abc.apps.googleusercontent.com" value={clientId} onChange={e=>setClientId(e.target.value)} autoComplete="off"/>
    </label>
    <small>可留空沿用 Vanilla 原有 Google OAuth Client ID，但對應 Cloud 專案必須啟用 Analytics Admin API、Data API，並設定網頁來源 https://easylearnfromtw.github.io。要使用獨立 Analyze 專案，請填入完整的 Client ID。</small>
    <div className="cream-google-buttons">
     <button type="button" disabled={busy} onClick={()=>void authorize()}>{busy?"讀取中…":"連接 Google Analytics（唯讀）"}</button>
     {connected&&<button type="button" disabled={busy} onClick={()=>void refresh()}>重新取得 GA4 資源</button>}
     {connected&&<button type="button" onClick={()=>{disconnectAnalytics();setConnected(false);setProperties([]);setPropertyId("");setMessage("Vanilla 已忘記 Analytics access token，未影響原有 Drive 登入。");}}>中斷 Analytics</button>}
    </div>
    {connected&&!!properties.length&&<div className="cream-google-options">
     <label>GA4 資源<select value={propertyId} onChange={e=>setPropertyId(e.target.value)}>{properties.map(p=><option key={p.id} value={p.id}>{p.accountName+" / "+p.name+" ("+p.id+")"}</option>)}</select></label>
     <label>分析維度<select value={dimension} onChange={e=>setDimension(e.target.value as GA4Dimension)}>{DIMENSIONS.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
     <label>分析指標<select value={metric} onChange={e=>setMetric(e.target.value as GA4Metric)}>{METRICS.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
     <label>時間區間<select value={days} onChange={e=>setDays(Number(e.target.value) as 7|28|90)}><option value={7}>最近 7 日</option><option value={28}>最近 28 日</option><option value={90}>最近 90 日</option></select></label>
     <button type="button" disabled={busy||!propertyId} onClick={()=>void analyze()}>將 GA4 真實數據交給 CREAM 分析</button>
    </div>}
   </>}
   <div className="cream-studio">
    <strong>Google Looker Studio · 外部報表</strong>
    <p>從已選擇的 GA4 資源開啟 Google 官方 Linking API 建立報表，報表資料來源仍受你的 Google 帳戶授權控制。Studio 不取代 CREAM。</p>
    <a href={selected?lookerStudioLink(selected):"https://lookerstudio.google.com/overview"} target="_blank" rel="noopener noreferrer">
     {selected?"使用此 GA4 資源建立 Studio 報表 ↗":"開啟 Looker Studio ↗"}
    </a>
    <small>不需要在瀏覽器填入 Studio OAuth Client Secret。新報表需在 Google 介面完成確認；目前不會聲稱已由 API 自動建立或儲存。</small>
   </div>
   {message&&<p role="status" className="cream-google-status">{message}</p>}
  </div>}
 </section>;
}
