import {useEffect,useState} from "react";
import {getVanillaVaultStatus,relayVanillaVault,weiGuoIdentity,
 type VanillaVaultProvider,type VanillaVaultStatus} from "./api";
import {getConfigs,removeProvider,setProvider,type Provider} from "../vault/providers";

const CLOUD=["gemini","deepseek","openai","anthropic","openrouter"] as const;
const LABELS:Record<VanillaVaultProvider,string>={
 gemini:"Google Gemini",deepseek:"DeepSeek",openai:"OpenAI",
 anthropic:"Anthropic Claude",openrouter:"OpenRouter",
 telegram:"Telegram / Ceres",canva:"Canva",notion:"Notion",
 brave:"Brave Search",tavily:"Tavily Search",github:"GitHub"
};
const SERVICES=["telegram","canva","notion","brave","tavily","github"] as const;
type VaultResult={ok:boolean;text?:string;data?:unknown;results?:unknown;message_id?:number|null;
 usage?:{input_tokens?:number;output_tokens?:number}};

/** Configuration contains no credential input: Script Properties are the only key store. */
export default function ApiVaultPanel(){
 const [status,setStatus]=useState<VanillaVaultStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [models,setModels]=useState<Record<string,string>>({});
 const [selected,setSelected]=useState<Provider[]>([]);
 const [query,setQuery]=useState("Taiwan medical news");
 const [repo,setRepo]=useState("easylearnfromtw/vanilla");
 const [chatId,setChatId]=useState("");
 const [telegramText,setTelegramText]=useState("Vanilla · API Vault 連線測試");
 const [canvaPrompt,setCanvaPrompt]=useState("");
 const [canvaKind,setCanvaKind]=useState<"image"|"presentation">("image");
 const [jobId,setJobId]=useState("");
 const [jobKind,setJobKind]=useState<"image"|"presentation">("image");
 const [lastResponse,setLastResponse]=useState("");
 const me=weiGuoIdentity();
 useEffect(()=>{
  const sync=()=>setSelected(getConfigs().filter(x=>x.key==="managed:gas").map(x=>x.provider));
  sync();window.addEventListener("vanilla-providers-changed",sync);
  return ()=>window.removeEventListener("vanilla-providers-changed",sync);
 },[]);
 async function inspect(){
  setBusy(true);setNotice("");setLastResponse("");
  try{
   const info=await getVanillaVaultStatus();
   setStatus(info);
   const active=getConfigs();
   setModels(Object.fromEntries(CLOUD.map(p=>[p,
    active.find(x=>x.provider===p&&x.key==="managed:gas")?.model||
    info.providers[p]?.models?.[0]||""])));
   setNotice("已取得 API Vault 配置狀態；下方不會顯示或下載原始 API Key。");
  }catch(e){setStatus(null);setNotice(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 function activate(provider:Provider){
  if(!status?.providers[provider]?.configured){
   setNotice("這個供應商尚未在 Apps Script Script Properties 設定金鑰");return;
  }
  const model=models[provider];
  if(!model||!status.providers[provider].models.includes(model)){
   setNotice("請先選擇 GAS 允許清單中的模型");return;
  }
  const old=getConfigs().find(x=>x.provider===provider);
  if(old&&old.key!=="managed:gas"&&!window.confirm("這將取代現有 "+LABELS[provider]+" 路由，是否繼續？"))return;
  setProvider({provider,key:"managed:gas",model});
  setNotice(LABELS[provider]+" 已設為 GAS 路由。必須以真實測試確認後端已部署。");
 }
 async function makeCall(provider:VanillaVaultProvider,operation:string,
  payload:Record<string,unknown>,model?:string){
  setBusy(true);setNotice("執行 "+LABELS[provider]+" / "+operation+" 中…");setLastResponse("");
  try{
   const result=await relayVanillaVault(provider,operation,payload,model) as VaultResult;
   if(!result.ok)throw Error("API 未確認操作成功");
   const rendered=result.text||JSON.stringify(result.data??result.results??{
     ok:result.ok,message_id:result.message_id,usage:result.usage
   },null,2);
   setLastResponse(rendered.slice(0,1500));
   setNotice(LABELS[provider]+" 已回傳結果。這不代表其他操作或額度皆正常。");
   const job=(result.data as {job?:{id?:string}}|undefined)?.job;
   if(job?.id && provider==="canva"){
    setJobId(job.id);setJobKind(operation==="image_generate"?"image":"presentation");
   }
  }catch(e){setNotice("操作失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 async function testModel(provider:Provider){
  const model=getConfigs().find(x=>x.provider===provider&&x.key==="managed:gas")?.model;
  if(!model){setNotice("請先啟用此模型");return;}
  if(!window.confirm("將送出一則實際 API 測試訊息，可能產生費用。確定繼續？"))return;
  await makeCall(provider,"chat",{messages:[{role:"user",content:"Reply with OK only."}],
    max_tokens:64},model);
 }
 async function runTool(provider:typeof SERVICES[number],operation:string){
  let payload:Record<string,unknown>={};
  if(provider==="brave"||provider==="tavily"||provider==="notion"){
   if(!query.trim()){setNotice("請輸入搜尋文字");return;}
   payload={query:query.trim().slice(0,120)};
  }else if(provider==="github"){
   const match=/^([A-Za-z0-9_.-]{1,80})\/([A-Za-z0-9_.-]{1,100})$/.exec(repo.trim());
   if(!match){setNotice("GitHub 專案格式應為 owner/repo");return;}
   payload={owner:match[1],repo:match[2]};
  }else if(provider==="telegram"){
   if(!/^-?[0-9]{5,20}$/.test(chatId.trim())||!telegramText.trim()){
    setNotice("請填入已加入 GAS 白名單的 Chat ID 和訊息");return;
   }
   if(!window.confirm("確定要向 Telegram 聊天室 "+chatId+" 發送這則真實訊息？"))return;
   payload={chat_id:chatId.trim(),text:telegramText.slice(0,4096)};
  }else if(provider==="canva"&&operation==="job_status"){
   if(!/^[A-Za-z0-9_-]{1,100}$/.test(jobId)){setNotice("請填入 Canva 工作 ID");return;}
   payload={kind:jobKind,job_id:jobId};
  }else if(provider==="canva"&&["image_generate","design_generate"].includes(operation)){
   if(canvaPrompt.trim().length<3){setNotice("請輸入生成需求");return;}
   if(!window.confirm("Canva 將實際提交生成任務，可能消耗 AI 額度。確定繼續？"))return;
   payload=operation==="image_generate"?
    {prompt:canvaPrompt.slice(0,1500),aspect_ratio:"square"}:
    {brief:canvaPrompt.slice(0,1500)};
  }
  await makeCall(provider,operation,payload);
 }
 return <section className="model-connection-panel" aria-label="Google Apps Script API Vault">
  <h3>Google Apps Script · API Vault</h3>
  <p>集中保管 11 類 API Key，經受信任的衞國後端 HMAC 簽章後轉發。
   所有供應商金鑰僅能在 Apps Script Script Properties 中設定，網站與 Google Drive 不保存原始值。</p>
  <p>本頁只會讀取狀態；按下「發送測試」才真正向雲端服務送資料。每個服務仍有獨立權限與費用。</p>
  <button type="button" onClick={()=>void inspect()} disabled={busy||me?.role!=="owner"}>
   {busy?"處理中…":"檢查所有 API 服務"}
  </button>
  {!me&&<p>請先以已核准 Google 身分登入衞國後端。</p>}
  {me&&me.role!=="owner"&&<p>只有擁有者能查看及切換共用 API 供應商。</p>}
  {status&&<div className="connection-preferences">
    <h4>文字生成模型（5 種供應商）</h4>
    {CLOUD.map(p=><div key={p} className="connection-preferences">
     <strong>{LABELS[p]} · {status.providers[p]?.configured?"已設定金鑰":"尚未設定"}</strong>
     <p>非串流文字轉發；圖片、串流與長時間運算維持原本受控路由。</p>
     <select aria-label={LABELS[p]+" 模型"} value={models[p]||""}
      onChange={e=>setModels(s=>({...s,[p]:e.target.value}))}>
      <option value="">選擇經 GAS 許可的模型</option>
      {(status.providers[p]?.models||[]).map(m=><option value={m} key={m}>{m}</option>)}
     </select>
     <div className="connection-buttons">
      <button type="button" disabled={busy||!status.providers[p]?.configured||!models[p]}
       onClick={()=>activate(p)}>啟用 GAS 路由</button>
      {selected.includes(p)&&<>
       <button type="button" disabled={busy} onClick={()=>void testModel(p)}>發送測試（可能計費）</button>
       <button type="button" disabled={busy} onClick={()=>{removeProvider(p);setNotice("已停用 "+LABELS[p]);}}>
        停用路由
       </button>
      </>}
     </div>
    </div>)}
   </div>}
  {status&&<div className="connection-preferences">
   <h4>工具與整合（6 種）</h4>
   <p>下列為原有 Ceres、Canva、Notion、Scouts、GitHub 可以使用的 Vault 憑證；
    原有工作流程是否走 GAS 由伺服器 `VANILLA_GAS_PROXY_PROVIDERS` 決定。</p>
   <label htmlFor="vault-query">搜尋文字</label>
   <input id="vault-query" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/>
   <label htmlFor="vault-repo">GitHub 儲存庫（owner/repo）</label>
   <input id="vault-repo" value={repo} maxLength={182} onChange={e=>setRepo(e.target.value)}/>
   <label htmlFor="vault-chat-id">Telegram Chat ID（白名單）</label>
   <input id="vault-chat-id" value={chatId} onChange={e=>setChatId(e.target.value)}/>
   <label htmlFor="vault-chat-text">測試訊息</label>
   <input id="vault-chat-text" value={telegramText} maxLength={300} onChange={e=>setTelegramText(e.target.value)}/>
   <label htmlFor="vault-canva-prompt">Canva 生成需求</label>
   <input id="vault-canva-prompt" value={canvaPrompt} maxLength={1500} onChange={e=>setCanvaPrompt(e.target.value)}/>
   <label htmlFor="vault-canva-kind">Canva 工作類型</label>
   <select id="vault-canva-kind" value={canvaKind} onChange={e=>setCanvaKind(e.target.value as "image"|"presentation")}>
    <option value="image">圖片</option><option value="presentation">簡報</option>
   </select>
   <label htmlFor="vault-job-id">Canva 工作 ID</label>
   <input id="vault-job-id" value={jobId} maxLength={100} onChange={e=>setJobId(e.target.value)}/>
   {SERVICES.map(provider=>{
    const item=status.providers[provider];
    const ops=provider==="telegram"?["send_message"]:
     provider==="canva"?["profile","designs",canvaKind==="image"?"image_generate":"design_generate","job_status"]:
     provider==="notion"?["search"]:provider==="github"?["repo"]:["search"];
    return <div key={provider} className="connection-preferences">
     <strong>{LABELS[provider]} · {item?.configured?"已設定":"尚未設定"}</strong>
     <p>允許操作：{(item?.operations||[]).join("、")||"無"}</p>
     <div className="connection-buttons">
      {ops.map(operation=><button key={operation} type="button"
       disabled={busy||!item?.configured} onClick={()=>void runTool(provider,operation)}>
       {operation==="send_message"?"確認並發送 Telegram":operation==="image_generate"?"生成 Canva 圖片":
        operation==="design_generate"?"生成 Canva 簡報":operation==="job_status"?"查看工作結果":
        operation==="search"?"測試搜尋":operation==="repo"?"讀取專案":"測試 "+operation}
      </button>)}
     </div>
    </div>;
   })}
  </div>}
  <div role="status" className="connection-status">{notice}</div>
  {lastResponse&&<div className="connection-status"><strong>本次回應摘要</strong>
   <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{lastResponse}</pre></div>}
  <small>目前設定及測試只對已授權者開放；這裡不會顯示 API Key。
   未完成 Apps Script 部署、伺服器權限與 Provider Allowlist 前，任何服務均不得標示為正式可用。</small>
 </section>;
}
