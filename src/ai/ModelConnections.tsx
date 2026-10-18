import {useState} from "react";
import {Cable,CheckCircle2,RefreshCw,ShieldAlert} from "lucide-react";
import {getOllamaConfig,getOllamaTokenConfigured,setOllamaConfig,clearOllamaConfig,testOllama,type OllamaModel} from "./ollama";
import {getVoteCount,resetModelChoices} from "./model-orchestrator";
export default function ModelConnections(){
 const [stored,setStored]=useState(getOllamaConfig);
 const [url,setUrl]=useState(stored.endpoint);
 const [model,setModel]=useState(stored.model);
 const [enabledModels,setEnabledModels]=useState<string[]>(stored.models||[]);
 const [secret,setSecret]=useState("");
 const [models,setModels]=useState<OllamaModel[]>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [count,setCount]=useState(getVoteCount);
 async function test(){
  if(!url.trim()){setNotice("請先輸入 Ollama 主機網址");return;}
  setBusy(true);setNotice("正在連接 Ollama 並讀取模型清單…");
  try{
   const result=await testOllama(url,secret.trim()||undefined);
   setModels(result.models);
   const discovered=result.models.map(x=>x.name);
   setEnabledModels(previous=>[...new Set([model,...previous.filter(x=>discovered.includes(x))].filter(Boolean))].slice(0,4));
   setNotice("成功連線："+result.models.length+" 個已下載模型。請選擇其中之一並儲存。");
   if(!model&&result.models.length){setModel(result.models[0].name);setEnabledModels([result.models[0].name]);}
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 function save(){
  try{
   if(!url.trim()||!model.trim()){setNotice("請提供連線網址與模型名稱");return;}
   setOllamaConfig({endpoint:url,model,models:enabledModels.includes(model)?enabledModels:[model,...enabledModels].slice(0,4)},secret.trim()||undefined);
   setStored(getOllamaConfig());setSecret("");
   setNotice("已儲存 Ollama 連線。若尚未測試，使用時可能因 CORS 或網路設定而失敗。");
  }catch(e){setNotice(e instanceof Error?e.message:String(e));}
 }
 function remove(){clearOllamaConfig();setStored(getOllamaConfig());setUrl("");setModel("");setSecret("");setModels([]);setEnabledModels([]);setNotice("已移除 Ollama 連線設定");}
 return <section className="model-connection-panel">
  <div className="connection-title"><Cable size={20}/><h3>Ollama · 家庭 AI 伺服器</h3></div>
  <p>可連接樹莓派調度的家庭主機、家用電腦、雲端 VM，或使用 API Key 的 Ollama 官方雲端服務。<strong>這不是 iPhone 裝置端運算</strong>。自架推論通常沒有逐次 API 費，但需自行負擔設備；官方 Ollama Cloud 僅有有限的免費起始點數，可能另行計費。</p>
  <label htmlFor="ollama-address">HTTPS 連線網址</label>
  <input id="ollama-address" type="url" value={url} spellCheck={false} autoCapitalize="none" placeholder="https://your-private-ollama.example" onChange={e=>setUrl(e.target.value)} />
  <label htmlFor="ollama-model">使用模型</label>
  <input id="ollama-model" type="text" value={model} spellCheck={false} autoCapitalize="none" list="ollama-model-list" placeholder="例如 qwen2.5:3b" onChange={e=>setModel(e.target.value)} />
  <datalist id="ollama-model-list">{models.map(m=><option key={m.name} value={m.name}>{m.details?.parameter_size||""}</option>)}</datalist>
  {models.length>0&&<p className="connection-models">已偵測：{models.slice(0,8).map(x=>x.name).join("、")}{models.length>8?" 等":""}</p>}
  {models.length>0&&<fieldset className="ollama-model-pool"><legend>允許自動選擇的模型（最多 4 個）</legend>
  <p>只勾選確定已下載、願意讓 Vanilla 使用的模型。大型模型可能較慢，也會占用伺服器記憶體。</p>
  {models.map(item=><label key={item.name}>
   <input type="checkbox" checked={enabledModels.includes(item.name)} disabled={!enabledModels.includes(item.name)&&enabledModels.length>=4} onChange={e=>setEnabledModels(before=>e.target.checked?[...before,item.name].slice(0,4):before.filter(x=>x!==item.name))}/>
   <span>{item.name}{item.details?.parameter_size?" · "+item.details.parameter_size:""}</span>
  </label>)}
 </fieldset>}
 <label htmlFor="ollama-access">HTTPS 代理存取權杖（選填）</label>
  <input id="ollama-access" type="password" value={secret} autoComplete="off" placeholder={getOllamaTokenConfigured()?"已設定（留白不變）":"僅受保護代理需要"} onChange={e=>setSecret(e.target.value)}/>
  <small>權杖只保存在本分頁的工作階段，不同步到 Google Drive。不要將未設防的 Ollama 11434 埠公開到 Internet；遠端連線需 HTTPS、安全存取控制與允許的 CORS Origin。</small>
  <div className="connection-buttons">
   <button type="button" disabled={busy} onClick={()=>void test()}><RefreshCw size={15}/>{busy?"連線中…":"測試連線／取得模型"}</button>
   <button type="button" disabled={busy||!url||!model} className="primary" onClick={save}>儲存並啟用</button>
   {stored.endpoint&&<button type="button" disabled={busy} onClick={remove}>中斷連線</button>}
  </div>
  {stored.endpoint&&<p className="connection-current"><CheckCircle2 size={14}/>已設定：{stored.model}。這表示已保存設定，並非持續在線的證明。</p>}
  <div className="connection-status" role="status">{notice}</div>
  <div className="connection-security"><ShieldAlert size={16}/><span>iPhone 開啟的 GitHub Pages 網站使用 HTTPS，無法可靠連接家中未加密的 HTTP 服務。瀏覽器中的 localhost 指的是 iPhone，而不是家庭伺服器。可透過已驗證的 HTTPS 私有代理提供連線。</span></div>
  <div className="connection-preferences"><div><strong>雙答案偏好學習</strong><p>目前本機記錄 {count} 次成對選擇。這些資料只調整模型排序，不會修改模型參數或自動上傳。</p></div><button type="button" onClick={()=>{if(window.confirm("確定清除本裝置的模型偏好學習紀錄？")){resetModelChoices();setCount(0);}}}>重設偏好</button></div>
 </section>;
}
