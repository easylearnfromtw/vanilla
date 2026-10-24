import {useEffect,useState} from "react";
import {getVanillaVaultStatus,relayVanillaVault,weiGuoIdentity,type VanillaVaultStatus} from "./api";
import {getConfigs,removeProvider,setProvider,type Provider} from "../vault/providers";

/** No credentials or signing keys are ever handled by this React component. */
export default function ApiVaultPanel(){
 const [status,setStatus]=useState<VanillaVaultStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [models,setModels]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState<Provider[]>([]);
 useEffect(()=>{
  const sync=()=>setSelected(getConfigs().filter(x=>x.key==="managed:gas").map(x=>x.provider));
  sync();window.addEventListener("vanilla-providers-changed",sync);
  return ()=>window.removeEventListener("vanilla-providers-changed",sync);
 },[]);
 const me=weiGuoIdentity();
 async function inspect(){
  setBusy(true);setNotice("");
  try{
   const info=await getVanillaVaultStatus();
   setStatus(info);
   setModels(Object.fromEntries(["gemini","deepseek"].map(p=>[p,info.providers[p]?.models?.[0]||""])));
   setNotice("已取得受保護的 API Vault 狀態。此處只顯示是否設定，不傳回 API Key。");
  }catch(e){setStatus(null);setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 function activate(provider:Provider){
  if(!status?.providers[provider]?.configured){setNotice("此服務尚未在 Google Apps Script 設定 API Key");return;}
  const model=models[provider];
  if(!model||!status.providers[provider].models.includes(model)){setNotice("請先在 GAS 設定模型允許清單");return;}
  const existing=getConfigs().find(x=>x.provider===provider);
  if(existing&&existing.key!=="managed:gas"&&!window.confirm("目前已連線另一個 "+provider+" 服務。要改成由 GAS 轉發嗎？"))return;
  setProvider({provider,key:"managed:gas",model});
  setNotice(provider+" 已切換為 GAS 受控路由（僅目前正常授權的後端可呼叫）。");
 }
 async function test(provider:Provider){
  const model=getConfigs().find(x=>x.provider===provider&&x.key==="managed:gas")?.model;
  if(!model){setNotice("請先啟用模型");return;}
  setBusy(true);setNotice("正在透過後端測試 "+provider+"…");
  try{
   const result=await relayVanillaVault(provider,"chat",{messages:[{role:"user",content:"Reply with OK only."}],max_tokens:64},model);
   setNotice(result.ok&&result.text?"已收到模型回應："+result.text.slice(0,70):"服務未回傳有效文字");
  }catch(e){setNotice("測試失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 return <section className="model-connection-panel" aria-label="Google Apps Script API Vault">
  <h3>Google Apps Script · API Vault</h3>
  <p>共用 API Key 只放在 Apps Script 的 Script Properties。Vanilla 先透過已驗證 Google 帳號連接衞國後端，再由後端簽章轉發；瀏覽器不會收到真正的 API Key。</p>
  <button type="button" onClick={()=>void inspect()} disabled={busy||me?.role!=="owner"}>{busy?"連線檢查中…":"檢查 API Vault"}</button>
  {!me&&<p>請先登入已授權的衞國 Google 帳號。</p>}
  {me&&me.role!=="owner"&&<p>金鑰狀態僅擁有者可以查看；一般家庭成員無權管理金鑰。</p>}
  {status&&(["gemini","deepseek"] as const).map(p=>{
   const cfg=status.providers[p];
   return <div key={p} className="connection-preferences"><div>
    <strong>{p==="gemini"?"Gemini":"DeepSeek"} · {cfg?.configured?"金鑰已設定":"尚未設定"}</strong>
    <p>僅支援文字與非串流回應；圖片、持續串流及超長推論仍走原有服務。</p>
    <select value={models[p]||""} aria-label={p+" 模型"} onChange={e=>setModels(x=>({...x,[p]:e.target.value}))}>
     <option value="">選擇 GAS 允許的模型</option>
     {(cfg?.models||[]).map(m=><option value={m} key={m}>{m}</option>)}
    </select>
    <div className="connection-buttons">
     <button type="button" disabled={!cfg?.configured||!models[p]||busy} onClick={()=>activate(p)}>啟用 GAS 轉發</button>
     {selected.includes(p)&&<button type="button" disabled={busy} onClick={()=>void test(p)}>發送測試（可能計費）</button>}
     {selected.includes(p)&&<button type="button" onClick={()=>{removeProvider(p);setNotice("已停用 GAS "+p+" 路由");}}>停用</button>}
    </div>
   </div></div>;
  })}
  {status&&<p>可管理服務：{Object.entries(status.providers).map(([p,c])=>p+(c.configured?" ✓":" —")).join("、")}</p>}
  <div className="connection-status" role="status">{notice}</div>
  <small>此頁不會建立或部署 Apps Script。若 GAS 尚未部署，請先依 docs/VANILLA_GAS_VAULT.md 設定；切換模型不代表成功呼叫，請使用測試按鈕確認。</small>
 </section>;
}
