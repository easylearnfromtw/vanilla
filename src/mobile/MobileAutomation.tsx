import {useEffect,useMemo,useState} from "react";
import {Copy,ShieldCheck,Smartphone,ExternalLink} from "lucide-react";
import {planMobileTask,mobileCliCommand,validateMobileBridgeUrl,executeReadOnlyMobileTask,inPrivateChat,type MobilePlatform} from "./mobile-agent";

/** All execution is opt-in. Browser cannot access XCUITest, ADB or WebDriverAgent directly. */
export default function MobileAutomation({initialGoal=""}:{initialGoal?:string}){
 const [platform,setPlatform]=useState<MobilePlatform>("ios");
 const [goal,setGoal]=useState(initialGoal||"查看目前開啟的 App 是什麼");
 const [endpoint,setEndpoint]=useState("");
 const [token,setToken]=useState("");
 const [approved,setApproved]=useState(false);
 const [running,setRunning]=useState(false);
 const [result,setResult]=useState("");
 useEffect(()=>{if(initialGoal){setGoal(initialGoal);setApproved(false);setResult("");}},[initialGoal]);
 const plan=useMemo(()=>planMobileTask(goal,platform),[goal,platform]);
 const isPrivate=inPrivateChat();
 const ready=plan.risk==="read-only"&&!isPrivate&&approved&&Boolean(endpoint.trim())&&Boolean(token.trim());
 function resetPreview(next:string){setGoal(next);setApproved(false);setResult("");}
 async function copyCommand(){
  if(plan.risk==="blocked")return;
  try{await navigator.clipboard.writeText(mobileCliCommand(plan));setResult("已複製電腦端 Mobilerun 指令；尚未執行任何手機操作。");}
  catch{setResult("無法使用剪貼簿，請檢查 Safari 權限。");}
 }
 async function run(){
  if(!ready||running)return;
  setRunning(true);setResult("");
  try{
   // The bridge must independently enforce device identity, per-step authorization and read-only scope.
   validateMobileBridgeUrl(endpoint);
   if(!window.confirm("你即將授權外部橋接服務檢視 "+(platform==="ios"?"iPhone":"Android")+" 的畫面內容。確定執行這項讀取任務？"))return;
   const data=await executeReadOnlyMobileTask(plan,endpoint,token);
   setResult((data.completed?"完成：":"未完成：")+data.summary);
  }catch(e){setResult("未執行／執行失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setRunning(false);setApproved(false);}
 }
 return <div className="content-page">
  <div className="eyebrow">VANILLA / DEVICE AGENT</div>
  <h1><Smartphone size={25} style={{verticalAlign:"middle",marginRight:10}}/>手機操作 Agent</h1>
  <p className="content-description">Mobilerun 技術整合實驗區。先審查任務，再選擇複製電腦端指令，或連線至你自行部署、具認證的 HTTPS 橋接服務。GitHub Pages／Safari 不能直接控制 iPhone 系統。</p>
  <section className="panel">
   <h2>1. 裝置與操作任務</h2>
   <label htmlFor="vanilla-device-platform">裝置</label>
   <select id="vanilla-device-platform" value={platform} onChange={e=>{setPlatform(e.target.value as MobilePlatform);setApproved(false);setResult("");}} style={{display:"block",margin:"8px 0 18px",padding:10,border:"1px solid #ddd",borderRadius:9}}>
    <option value="ios">iPhone / iOS（需要 macOS + Xcode + WebDriverAgent）</option><option value="android">Android（需要 ADB + Portal）</option>
   </select>
   <label htmlFor="vanilla-device-goal">自然語言任務</label>
   <textarea id="vanilla-device-goal" rows={3} maxLength={280} value={goal} onChange={e=>resetPreview(e.target.value)} style={{width:"100%",marginTop:8,padding:12,border:"1px solid #ddd",borderRadius:10,resize:"vertical"}}/>
   <p role="status" style={{fontWeight:600,color:plan.risk==="blocked"?"#ac332a":"#333"}}>{plan.risk==="blocked"?"已封鎖":plan.risk==="read-only"?"讀取任務（可申請執行）":"互動任務（僅可人工執行）"} · {plan.reason}</p>
   <button type="button" disabled={plan.risk==="blocked"} onClick={()=>void copyCommand()} style={{padding:"11px 15px",border:"1px solid #d4d4d4",background:"#fff",borderRadius:10,display:"inline-flex",gap:7,alignItems:"center"}}><Copy size={16}/> 複製 Mobilerun 電腦端指令</button>
   <p style={{fontSize:12}}>複製指令不會執行任務。iOS 須使用官方裝置橋接程序，且手機必須與控制電腦連接。</p>
  </section>
  <section className="panel">
   <h2>2. 選用 HTTPS 安全橋接</h2>
   <p>僅供你已有專用 Bridge 時使用。這不是 Mobilerun 官方 Cloud API，需由可信任的伺服器實作相同協定。不要直接連 Portal 8080、不要把 API Key 寫進 GitHub 或 Google Drive。</p>
   <label htmlFor="vanilla-mobile-endpoint">你的橋接網址（結尾 /api/vanilla/mobile/run）</label>
   <input id="vanilla-mobile-endpoint" type="url" autoComplete="off" spellCheck={false} placeholder="https://your-secure-bridge.example/api/vanilla/mobile/run" value={endpoint} onChange={e=>{setEndpoint(e.target.value);setApproved(false);}} style={{display:"block",width:"100%",margin:"8px 0 16px",padding:12,border:"1px solid #ddd",borderRadius:10}}/>
   <label htmlFor="vanilla-mobile-token">短效工作階段憑證（僅放在目前 React 記憶體）</label>
   <input id="vanilla-mobile-token" type="password" autoComplete="off" placeholder="由可信任 Bridge 簽發" value={token} onChange={e=>{setToken(e.target.value);setApproved(false);}} style={{display:"block",width:"100%",margin:"8px 0 16px",padding:12,border:"1px solid #ddd",borderRadius:10}}/>
   <label style={{display:"flex",gap:9,alignItems:"flex-start",lineHeight:1.6}}><input type="checkbox" checked={approved} disabled={plan.risk!=="read-only"||isPrivate||running} onChange={e=>setApproved(e.target.checked)} style={{marginTop:5}}/><span>我已確認此網域由我管理、已設定裝置權限限制，並同意將本次任務交由該服務執行。</span></label>
   {isPrivate&&<p role="alert">私密模式已啟用：禁止將任務傳送到外部橋接服務。</p>}
   <button type="button" disabled={!ready||running} onClick={()=>void run()} style={{marginTop:16,padding:"11px 17px",background:ready?"#202226":"#e1e2e4",color:ready?"white":"#777",border:0,borderRadius:10}}>{running?"執行中…":"確認後執行讀取任務"}</button>
   {result&&<div role="status" style={{marginTop:15,padding:14,border:"1px solid #e5e5e5",borderRadius:11,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{result}</div>}
  </section>
  <p className="content-description" style={{fontSize:12,display:"flex",alignItems:"center",gap:6}}><ShieldCheck size={15}/> 預設拒絕管理員／憑證／付款／刪除／傳送資料等敏感操作。前端檢查不取代伺服器授權與逐步風險管控。</p>
  <a href="https://github.com/droidrun/mobilerun" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",gap:5,alignItems:"center"}}>查看 Mobilerun 原始專案 <ExternalLink size={14}/></a>
 </div>;
}
