import {useState} from "react";
import {Cloud,ShieldCheck,Unplug} from "lucide-react";
import {OCTUBER_HOSTED_OPTIONS,hostedOctuberState,verifyHostedOctuber,clearHostedOctuber,type HostedOctuberModel} from "./octuber-hosted";
import "./octuber-api.css";

/**
 * Unlike model aliases, this panel only enables a tier after an actual paid
 * provider completion. It is a consumer API connection, never a GPU deployment.
 */
export default function HostedOctuberPanel(){
 const [model,setModel]=useState<HostedOctuberModel>("qwen/qwen3-30b-a3b-instruct-2507");
 const [key,setKey]=useState("");
 const [active,setActive]=useState(hostedOctuberState);
 const [working,setWorking]=useState(false);
 const [notice,setNotice]=useState("尚未連線。30B/32B 需要有可用餘額的 OpenRouter 帳號，手機不需下載模型權重。");
 const [metered,setMetered]=useState(()=>{try{return localStorage.getItem("vanilla.models.allow-metered.v1")==="true";}catch{return false;}});
 async function activate(){
  if(working)return;
  setWorking(true);setNotice("正在使用真實模型進行短回答驗證（可能產生少量費用）…");
  try{
   const report=await verifyHostedOctuber(model,key);
   setActive(hostedOctuberState());setKey("");
   setNotice("實際推論成功 · "+(report.elapsedMs/1000).toFixed(1)+" 秒 · "+report.answer);
   if(!metered&&window.confirm("已驗證大型模型。要啟用對話中的「允許計費雲端 API」嗎？之後回覆可能產生服務商費用，首次傳送聊天內容前仍會確認。")){
    try{localStorage.setItem("vanilla.models.allow-metered.v1","true");}catch{}
    setMetered(true);
    window.dispatchEvent(new Event("vanilla-metered-changed"));
   }
  }catch(error){setActive(hostedOctuberState());setNotice("無法啟用："+(error instanceof Error?error.message:String(error)));}
  finally{setWorking(false);}
 }
 function disconnect(){clearHostedOctuber();setActive(null);setKey("");setNotice("已中斷並清除本次分頁中的大型模型金鑰。");}
 return <section className="model-connection-panel" aria-label="OCTUBER 託管大型模型推論">
  <div className="connection-title"><Cloud size={20}/><h3>OCTUBER 14B／30B／32B · 直接啟用雲端推論</h3></div>
  <p>不需要自己架 GPU、安裝 Ollama 或在 iPhone 下載大型權重。使用你自己的 <strong>OpenRouter API Key</strong>，透過 HTTPS 連接實際託管的 Qwen 模型。這是第三方推論服務，可能計費；模型名稱是 OCTUBER 的使用介面級距，<strong>不是 OCTUBER 已自行微調的模型</strong>。</p>
  <div className="octuber-api-steps">
   <div className={key||active?"done":""}><span>01</span><strong>取得 API Key</strong><small>OpenRouter 個人帳號</small></div>
   <div className={model?"done":""}><span>02</span><strong>選擇真實模型</strong><small>14B／30B／32B</small></div>
   <div className={active?"done":""}><span>03</span><strong>驗證回答並啟用</strong><small>{active?"推論成功":"未驗證不可選用"}</small></div>
  </div>
  <p><a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer">OpenRouter · 建立自己的 API Key ↗</a>　<a href="https://openrouter.ai/qwen/qwen3-30b-a3b-instruct-2507" target="_blank" rel="noopener noreferrer">查看 30B 規格與即時價格 ↗</a></p>
  <label htmlFor="hosted-octuber-model">選擇大型模型</label>
  <select id="hosted-octuber-model" value={model} disabled={working} onChange={event=>setModel(event.target.value as HostedOctuberModel)}>
   {OCTUBER_HOSTED_OPTIONS.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
  </select>
  <label htmlFor="hosted-octuber-key">OpenRouter API Key（不會儲存到網站或 Google Drive）</label>
  <input id="hosted-octuber-key" type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" value={key} onChange={event=>setKey(event.target.value)} placeholder="sk-or-…" disabled={working}/>
  <div className="connection-buttons">
   <button type="button" className="primary" disabled={working||!key.trim()} onClick={()=>void activate()}>{working?"推論驗證中…":"實測回答並啟用此模型"}</button>
   {active&&<button type="button" disabled={working} onClick={disconnect}><Unplug size={14}/>中斷並清除 Key</button>}
  </div>
  {active?<p className="connection-current"><ShieldCheck size={14}/>本分頁已驗證：{OCTUBER_HOSTED_OPTIONS.find(x=>x.id===active.model)?.label} · {metered?"對話計費開關已開啟":"仍需在對話頁開啟「允許計費雲端 API」"}。首次傳送對話仍需授權。</p>:
   <p className="octuber-api-note">尚未有已驗證的託管模型。未驗證的型號不會冒充可用的 30B。</p>}
  <p className="octuber-api-note" role="status" aria-live="polite">{notice}</p>
  <p className="octuber-api-note">安全說明：僅在本次分頁的 JavaScript 記憶體保留 Key，不寫入 localStorage／sessionStorage／聊天／Drive；重新載入須重新連線。請只在信任的裝置操作。直接在瀏覽器呼叫服務仍受 CORS／網路限制，生產環境若需要長期供多人使用，應改由受保護的伺服器代理保管 Key。私密模式永遠不傳送至此服務。</p>
 </section>;
}
