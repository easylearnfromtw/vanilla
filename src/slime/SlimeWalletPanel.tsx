import {useEffect,useRef,useState} from "react";
import {renderWeiGuoGoogleButton} from "../vault/google-auth";
import {weiGuoApiBase} from "../weiguo/api";
import {driveSession} from "../workspace/cloud-drive";

type Wallet={
 claimed:boolean;balance:number;earned:number;spent:number;
 usage?:{requests?:number;exactTokens?:number;estimatedTokens?:number;inputTokens?:number;outputTokens?:number};
 usageByModel?:Array<{model:string;total_tokens:number}>;
};
type Weeken={joined:boolean;status:string;bonusTokens:number;permissions?:{contact:boolean;diagnostics:boolean;networkRelay:boolean}};

function amount(n:number|undefined){return Number(n||0).toLocaleString("zh-TW");}

/** Public Vanilla account-facing credits. Identity tokens never enter storage. */
export default function SlimeWalletPanel(){
 const google=useRef<HTMLDivElement|null>(null);
 const token=useRef("");
 const [wallet,setWallet]=useState<Wallet|null>(null);
 const [weeken,setWeeken]=useState<Weeken|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const base=weiGuoApiBase();
 const signedIn=Boolean(driveSession());

 async function api<T>(name:string,credential:string):Promise<T>{
  const origin=weiGuoApiBase();
  if(!origin)throw new Error("尚未連接 Vanilla 衞國 HTTPS 後端");
  const res=await fetch(origin+"/v1/slime/rewards/"+name,{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({credential}),cache:"no-store",mode:"cors",
   credentials:"omit",referrerPolicy:"no-referrer"
  });
  const response=await res.json().catch(()=>({})) as {detail?:string};
  if(!res.ok)throw new Error(response.detail||"無法取得 Token 錢包："+res.status);
  return response as T;
 }
 async function refresh(credential:string){
  const w=await api<Wallet>("balance",credential);
  setWallet(w);
  if(w.claimed){
   const record=await api<Weeken>("weeken/status",credential);
   setWeeken(record);
  }else setWeeken(null);
 }
 useEffect(()=>{
  const current=google.current;
  if(!base||!current||!signedIn)return;
  let active=true;
  void renderWeiGuoGoogleButton(current,credential=>{
   token.current=credential;setBusy(true);setMessage("正在查詢 Vanilla Token 錢包…");
   void refresh(credential).then(()=>{
    if(active)setMessage("Google 驗證成功，餘額已更新。");
   }).catch(error=>{if(active)setMessage(error instanceof Error?error.message:String(error));})
    .finally(()=>{if(active)setBusy(false);});
  }).catch(error=>{if(active)setMessage(error instanceof Error?error.message:String(error));});
  return()=>{active=false;token.current="";};
 },[base,signedIn]);

 return <div className="slime-wallet-front" aria-label="Slime Token 錢包">
  <div className="slime-wallet-front-head">
   <span className="slime-wallet-eyebrow">VANILLA / SLIME CREDITS</span>
   <h3>我的 Token 錢包</h3>
   <p>透過 Google 驗證帳號後，查看 Slime 加入獎勵、WEEKEN 加碼與實際模型消耗。</p>
  </div>
  {!base?<p role="status">此網站尚未設定衞國 HTTPS 後端，無法即時取得餘額。</p>
    :!signedIn?<p role="status">請先在 Vanilla 登入 Google 帳號。</p>
    :<div className="slime-wallet-google" ref={google}/>}
  {wallet&&<div className="slime-wallet-stat">
   <div><small>可用 Token</small><strong className={wallet.balance<0?"debt":""}>{amount(wallet.balance)}</strong>
    {wallet.balance<0&&<small>節點已移除，扣回獎勵後形成負餘額。</small>}</div>
   <div><small>累計核發</small><strong>{amount(wallet.earned)}</strong></div>
   <div><small>模型已消耗</small><strong>{amount(wallet.spent)}</strong></div>
   <div><small>結算方式</small><strong>實測優先</strong>
    <small>實測 {amount(wallet.usage?.exactTokens)} · 保守計算 {amount(wallet.usage?.estimatedTokens)}</small></div>
   <div className="slime-wallet-wide"><small>WEEKEN VPN 企劃</small>
    <strong>{weeken?.joined?"已加入":weeken?.status==="withdrawn"?"已撤回":"尚未登記"}</strong>
    {weeken?.joined&&<small>登記加碼 {amount(weeken.bonusTokens)} Token；VPN 網路傳輸未授權。</small>}</div>
  </div>}
  {wallet&&!wallet.claimed&&<p>目前沒有可用的 Slime 節點獎勵。請先完成裝置配對並於領獎頁用同一個 Google 帳號領取。</p>}
  {wallet?.claimed&&<div className="slime-wallet-actions">
   <button type="button" disabled={busy||!token.current} onClick={()=>{
    setBusy(true);void refresh(token.current).then(()=>setMessage("Token 已更新。"))
     .catch(e=>setMessage(e instanceof Error?e.message:String(e))).finally(()=>setBusy(false));
   }}>重新整理餘額</button>
   <a href={base?base+"/v1/slime/rewards":"#account"} target="_blank" rel="noopener noreferrer">管理 API Key 與 WEEKEN 登記 ↗</a>
  </div>}
  {message&&<p role="status" aria-live="polite">{message}</p>}
  <p className="slime-wallet-privacy">Google ID Token 僅用於當次驗證，不儲存在 Vanilla 前端；裝置配對密鑰與 API Key 不會出現在這個畫面。獎勵 Token 不是現金。</p>
 </div>;
}
