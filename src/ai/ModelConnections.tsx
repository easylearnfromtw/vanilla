import {useState} from "react";
import "./octuber-api.css";
import {Cable,CheckCircle2,RefreshCw,ShieldAlert} from "lucide-react";
import {getOllamaConfig,getOllamaTokenConfigured,setOllamaConfig,clearOllamaConfig,testOllama,generateOllamaReply,probeAtuberModel,isOllamaModelVerified,type OllamaModel} from "./ollama";
import {getVoteCount,getRatingCount,resetModelChoices} from "./model-orchestrator";
import {clearModelHealth,recordModelRun} from "./model-health";
import {isTaiwanTaideEnabled,setTaiwanTaideEnabled,isTaideModel} from "./taiwan-routing";
import {ATUBER_TIERS,OCTUBER_HIGH_CAPACITY,setOctuberTierPreference} from "./atuber-control-plane";
import {localOctuberBaseTier,installedTierModel,recognizedLocalModelName,localOctuberBaseNames} from "./octuber-local-runtimes";
export default function ModelConnections(){
 const [stored,setStored]=useState(getOllamaConfig);
 const [url,setUrl]=useState(stored.endpoint);
 const [model,setModel]=useState(stored.model);
 const [enabledModels,setEnabledModels]=useState<string[]>(stored.models||[]);
 const [secret,setSecret]=useState("");
 const [models,setModels]=useState<OllamaModel[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [inferenceVerified,setInferenceVerified]=useState(()=>Boolean(getOllamaConfig().model&&isOllamaModelVerified(getOllamaConfig().model)));
 const [count,setCount]=useState(getVoteCount);
 const [ratingCount,setRatingCount]=useState(getRatingCount);
 const [taiwanRoute,setTaiwanRoute]=useState(isTaiwanTaideEnabled);
 async function test(){
  if(!url.trim()){setNotice("請先輸入 Ollama 主機網址");return;}
  setBusy(true);setInferenceVerified(false);setNotice("正在連接 Ollama 並讀取模型清單…");
  try{
   const result=await testOllama(url,secret.trim()||undefined);
   setModels(result.models);
   const discovered=result.models.map(x=>x.name);
   setEnabledModels(previous=>[...new Set([model,...previous].filter(x=>discovered.includes(x)))].slice(0,4));
   setNotice("成功連線："+result.models.length+" 個已下載模型。請選擇其中之一並儲存。");
   if(!result.models.some(x=>x.name===model)&&result.models.length){setModel(result.models[0].name);setEnabledModels([result.models[0].name]);}
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 function save(){
  try{
   if(!url.trim()||!model.trim()){setNotice("請提供連線網址與模型名稱");return;}
   if(models.length>0&&!models.some(x=>x.name===model)){setNotice("這個模型未出現在主機的 /api/tags；請先在電腦下載完成，再取得模型清單。");return;}
   setOllamaConfig({endpoint:url,model,models:enabledModels.includes(model)?enabledModels:[model,...enabledModels].slice(0,4)},secret.trim()||undefined);
   setStored(getOllamaConfig());setSecret("");setInferenceVerified(false);
   setNotice("已儲存 Ollama 連線。若尚未測試，使用時可能因 CORS 或網路設定而失敗。");
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
 }
 async function testInference(){
  if(!stored.endpoint||!stored.model){setNotice("請先儲存 Ollama 連線和模型名稱");return;}
  setBusy(true);setNotice("正在測試已儲存的 "+stored.model+"，低效能 CPU 可能需要一段時間…");
  const started=Date.now();
  try{
   const named=recognizedLocalModelName(stored.model);
   const reply=named?await probeAtuberModel(stored.model):null;
   const text=reply?"已連線":await generateOllamaReply([{role:"user",content:"這是連線測試。請只回答：OK"}],stored.model);
   if(reply){const tier=localOctuberBaseTier(stored.model)??[...ATUBER_TIERS,OCTUBER_HIGH_CAPACITY].find(t=>t.model===stored.model||t.publicAlias===stored.model)?.tier;
    if(tier)setOctuberTierPreference(tier);}
   const seconds=Math.max(0.1,(Date.now()-started)/1000);
   recordModelRun("ollama:"+stored.model,true,Date.now()-started);
   setInferenceVerified(true);setNotice("主機實際推論成功（"+seconds.toFixed(1)+" 秒），回覆：「"+(typeof text==="string"?text.slice(0,80):"已連線")+"」。已可在聊天選用本地大型模型；模型在電腦而非手機運算。");
  }catch(error){
   setInferenceVerified(false);
   recordModelRun("ollama:"+stored.model,false,Date.now()-started);
   setNotice("模型推論測試失敗："+(error instanceof Error?error.message:String(error)));
  }finally{setBusy(false);}
 }
  function remove(){clearOllamaConfig();setStored(getOllamaConfig());setUrl("");setModel("");setSecret("");setModels([]);setEnabledModels([]);setInferenceVerified(false);setNotice("已移除 Ollama 連線設定");}
 return <section className="model-connection-panel">
  <div className="connection-title"><Cable size={20}/><h3>OCTUBER · API 與運算主機</h3></div>
  <div className="octuber-api-steps" aria-label="API 授權後設定流程">
   <div className={url?"done":""}><span>01</span><strong>填入 API 授權</strong><small>HTTPS 網址／必要時的 Key</small></div>
   <div className={models.length?"done":""}><span>02</span><strong>取得可用模型</strong><small>{models.length?"偵測到 "+models.length+" 個":"連線後讀取實際安裝型號"}</small></div>
   <div className={stored.endpoint?"done":""}><span>03</span><strong>儲存使用設定</strong><small>可調整規格與自動路由</small></div>
   <div className={inferenceVerified?"done":""}><span>04</span><strong>驗證實際回答</strong><small>{inferenceVerified?"已通過此分頁測試":"避免僅取得 API 就顯示已上線"}</small></div>
  </div>
  <p className="octuber-api-note"><strong>本地 30B 不需要付費雲端 Key。</strong>在你自己的 Windows／Mac／Linux 電腦用 Ollama 下載 30B，這裡讀取已安裝的 <code>qwen3:30b</code>／<code>qwen3:30b-a3b</code>／<code>qwen3-coder:30b</code>；不必額外建立 octuber 別名。若從 iPhone 使用，請提供有授權和 HTTPS 的電腦推論端點。</p>
  <p>可連接受 HTTPS 保護的自架 Ollama、家用電腦、雲端 VM，或 Ollama 官方雲端。你可隨時修改模型 ID、網址與候選模型；更換前可先測試連線。<strong>這不是 iPhone 裝置端運算</strong>。自架推論通常沒有逐次 API 費，但需自行負擔設備；官方 Ollama Cloud 僅有有限的免費起始點數，可能另行計費。</p>
  <label htmlFor="ollama-address">HTTPS 連線網址</label>
  <input id="ollama-address" type="url" value={url} spellCheck={false} autoCapitalize="none" placeholder="https://your-private-ollama.example" onChange={e=>{setUrl(e.target.value);setModels([]);setInferenceVerified(false);}} />
  <label htmlFor="ollama-model">模型 ID（可隨時替換）</label>
  <input id="ollama-model" type="text" value={model} spellCheck={false} autoCapitalize="none" list="ollama-model-list" placeholder="例如 qwen2.5:3b" onChange={e=>setModel(e.target.value)} />
  <datalist id="ollama-model-list">{models.map(m=><option key={m.name} value={m.name}>{m.details?.parameter_size||""}</option>)}</datalist>
  <div className="octuber-host-preset" aria-label="OCTUBER 快速選擇規格">
   {[...ATUBER_TIERS,OCTUBER_HIGH_CAPACITY].map(t=>{
    const installed=installedTierModel(models.map(m=>m.name),t.tier,[t.publicAlias,t.model]);
    return <button key={t.tier} type="button" disabled={Boolean(models.length)&&!installed}
     className={model===(installed||t.publicAlias)?"active":""}
     onClick={()=>{setModel(installed||t.publicAlias);setEnabledModels(before=>[...new Set([installed||t.publicAlias,...before])].slice(0,4));setInferenceVerified(false);}}>
     <strong>{t.brand}</strong><small>本地型號：{localOctuberBaseNames(t.tier).join("／")} · 權重約 {t.approxDownloadGB} GB</small><small>{models.length?(installed?"已偵測 "+installed+" · 待實測":"主機尚未安裝"):"尚未偵測主機"}</small>
    </button>;
   })}
  </div>
  {models.length>0&&<p className="connection-models">已偵測：{models.slice(0,8).map(x=>x.name).join("、")}{models.length>8?" 等":""}</p>}
  {models.length>0&&<fieldset className="ollama-model-pool"><legend>允許自動選擇的模型（最多 4 個）</legend>
  <p>只勾選確定已下載、願意讓 Vanilla 使用的模型。大型模型可能較慢，也會占用伺服器記憶體。</p>
  {models.map(item=><label key={item.name}>
   <input type="checkbox" checked={enabledModels.includes(item.name)} disabled={!enabledModels.includes(item.name)&&enabledModels.length>=4} onChange={e=>setEnabledModels(before=>e.target.checked?[...before,item.name].slice(0,4):before.filter(x=>x!==item.name))}/>
   <span>{item.name}{item.details?.parameter_size?" · "+item.details.parameter_size:""}</span>
  </label>)}
 </fieldset>}
 <label htmlFor="ollama-access">Ollama Cloud API Key／HTTPS 代理權杖（必要時才填）</label>
  <input id="ollama-access" type="password" value={secret} autoComplete="off" placeholder={getOllamaTokenConfigured()?"已設定（留白不變）":"僅受保護代理需要"} onChange={e=>setSecret(e.target.value)}/>
  <small>模型 ID 是名稱（如 qwen3:8b），不是存取金鑰。請在這個設定頁輸入必要權杖，不要貼到聊天訊息或 GitHub。權杖只保存在分頁工作階段，不同步 Google Drive。直接在瀏覽器呼叫遠端 Ollama 必須確認 CORS、安全存取與 HTTPS；正式生產建議使用安全後端代理。</small>
  <div className="connection-buttons">
   <button type="button" disabled={busy} onClick={()=>void test()}><RefreshCw size={15}/>{busy?"連線中…":"測試連線／取得模型"}</button>
   <button type="button" disabled={busy||!url||!model} className="primary" onClick={save}>儲存並啟用</button>
   {stored.endpoint&&<button type="button" disabled={busy} onClick={()=>void testInference()}>測試模型實際回答</button>}
   {stored.endpoint&&<button type="button" disabled={busy} onClick={remove}>中斷連線</button>}
  </div>
  {stored.endpoint&&<p className="connection-current"><CheckCircle2 size={14}/>已設定：{stored.model}（候選模型 {stored.models.length} 個）。{isOllamaModelVerified(stored.model)?"本分頁已通過實際推論，現在可選用。":"尚未通過實際推論；30B 不能只憑名稱視為可用。"}主機仍需持續開機。</p>}
  <div className="connection-status" role="status">{notice}</div>
  <div className="connection-security"><ShieldAlert size={16}/><span>iPhone 開啟的 GitHub Pages 網站使用 HTTPS，無法可靠連接家中未加密的 HTTP 服務。瀏覽器中的 localhost 指的是 iPhone，而不是家庭伺服器。可透過已驗證的 HTTPS 私有代理提供連線。</span></div>
  <div className="connection-preferences"><div>
   <strong>臺灣在地議題 · TAIDE 優先</strong>
   <p>法律問題（未指定國家時預設臺灣法）、臺灣歷史與在地政策，自動優先使用已連線 Ollama 候選中的 TAIDE Chat 模型。外國法律／非臺灣史不會被強制導向 TAIDE；私密／只用手機本地模式永不外傳。</p>
   <label><input type="checkbox" checked={taiwanRoute} onChange={event=>{setTaiwanRoute(event.target.checked);setTaiwanTaideEnabled(event.target.checked);}}/> 啟用臺灣主題 TAIDE 優先路由（預設開啟）</label>
   <p>{[stored.model,...stored.models].some(isTaideModel)?"已設定 TAIDE 名稱的 Ollama 候選模型（仍須連線與實際推論驗證）。":"目前未設定 TAIDE 模型：請先從官方權重取得相容模型並部署於自有 Ollama 主機，於上方勾選／填入實際已載入的模型 ID；本設定不會自動下載權重。"}</p>
   <p><a href="https://www.taide.tw/public/download-model" target="_blank" rel="noreferrer">TAIDE 官方模型與授權</a> · <a href="https://huggingface.co/taide/Llama-3.1-TAIDE-LX-8B-Chat" target="_blank" rel="noreferrer">TAIDE 8B Chat</a> · <a href="https://huggingface.co/taide/Gemma-3-TAIDE-12b-Chat-2602" target="_blank" rel="noreferrer">TAIDE 12B Chat</a>。模型偏好不是法規或史料查證；需核對官方原始來源。</p>
  </div></div>
  <div className="connection-preferences"><div><strong>雙答案偏好學習</strong><p>目前本機記錄 {count} 次雙答案選擇，以及 {ratingCount} 次單則回答評價。另外會在本機記錄各模型的成功／失敗及耗時，用來避開不穩定或緩慢的模型；不記錄問題內容、答案或 API Key。這不是重新訓練模型。</p></div><button type="button" onClick={()=>{if(window.confirm("確定清除本裝置的模型偏好學習紀錄？")){resetModelChoices();clearModelHealth();setCount(0);setRatingCount(0);}}}>清除本機學習紀錄</button></div>
 </section>;
}
