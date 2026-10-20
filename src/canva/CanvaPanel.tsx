import {useEffect,useState} from "react";
import {currentChatMode} from "../local-ai/chat-session";
import {weiGuoApiBase,weiGuoIdentity,getWeiGuoCanvaStatus,startWeiGuoCanvaGeneration,
 getWeiGuoCanvaJob,type CanvaJob,type CanvaKind,type CanvaStatus} from "../weiguo/api";

/** Canva is an optional cloud accelerator, not a replacement for offline LUNA/Retina. */
export default function CanvaPanel({initialPrompt=""}:{initialPrompt?:string}){
 const [kind,setKind]=useState<CanvaKind>("presentation");
 const [ratio,setRatio]=useState<"square"|"landscape"|"portrait">("landscape");
 const [prompt,setPrompt]=useState(initialPrompt.slice(0,5000));
 const [consent,setConsent]=useState(false);
 const [cap,setCap]=useState<CanvaStatus|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [job,setJob]=useState<CanvaJob|null>(null);
 const privateMode=currentChatMode()==="private";
 const owner=weiGuoIdentity()?.role==="owner";
 useEffect(()=>{if(initialPrompt.trim())setPrompt(initialPrompt.slice(0,5000));},[initialPrompt]);
 async function check(){
  if(privateMode||!owner)return;
  setBusy(true);
  try{const next=await getWeiGuoCanvaStatus();setCap(next);
   setMessage(next.configured?"Canva 後端已配置（仍須確認 Canva 帳號具有生成資格）":"Canva 尚未完成後端 OAuth 權杖與開關配置");
  }catch(e){setCap(null);setMessage(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function submit(){
  setBusy(true);setJob(null);setMessage("正在向 Canva 建立任務…");
  try{
   const next=await startWeiGuoCanvaGeneration({kind,prompt,aspect_ratio:ratio,approved_cloud_send:consent});
   setJob(next);setMessage(next.status==="in_progress"?"已收到 Canva 任務編號，請按「查詢進度」取得實際結果。":"已取得 Canva 回覆");
  }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function refresh(){
  if(!job)return;
  setBusy(true);
  try{const next=await getWeiGuoCanvaJob(job.kind,job.id);setJob(next);
   setMessage(next.status==="success"?"作品已在 Canva 建立，可開啟查看":next.status==="failed"?"Canva 生成失敗："+(next.error||"未知錯誤"):"Canva 正在生成中，稍後再查詢");}
  catch(e){setMessage(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 const ready=!!cap?.configured&&owner&&!privateMode;
 return <div className="orchestra-remote" aria-label="Canva Cloud Studio">
  <h3>Canva Cloud Studio · 圖片／簡報</h3>
  <p>Canva 官方雲端生成 API（預覽版）。需要另外配置後端 OAuth Token、授權權限及 Canva AI 額度；不使用 ChatGPT 的 Canva 登入狀態。未配置時請使用 LUNA 或 Retina 本機輸出。</p>
  <small role="status">{privateMode?"私人模式已禁止 Canva 雲端操作":!weiGuoApiBase()?"未設定衞國 HTTPS 後端":!owner?"請先在衞國系統驗證家庭擁有者身分":cap?.configured?"已配置 Canva 後端（生成資格待實際驗證）":"Canva 後端尚未驗證"}</small>
  <button type="button" disabled={busy||privateMode||!owner} onClick={()=>void check()}>檢查 Canva 連線狀態</button>
  <label>生成類型 <select value={kind} onChange={e=>{setKind(e.target.value as CanvaKind);setJob(null);setConsent(false);}}>
   <option value="presentation">可編輯 Canva 簡報</option><option value="image">AI 圖片</option>
  </select></label>
  {kind==="image"&&<label>圖片比例 <select value={ratio} onChange={e=>setRatio(e.target.value as typeof ratio)}>
   <option value="landscape">橫向 16:9</option><option value="square">正方形 1:1</option><option value="portrait">直向 9:16</option>
  </select></label>}
  <label>製作內容 <textarea rows={5} maxLength={5000} placeholder="描述主題、風格、受眾與必要文字" value={prompt} onChange={e=>{setPrompt(e.target.value);setConsent(false);}}/></label>
  <label><input type="checkbox" checked={consent} disabled={!ready} onChange={e=>setConsent(e.target.checked)}/> 我同意將此提示詞傳送至 Canva 生成，並可能使用 Canva AI 額度</label>
  <button type="button" disabled={busy||!ready||!consent||prompt.trim().length<3} onClick={()=>void submit()}>
   {busy?"作業中…":kind==="image"?"以 Canva 生成圖片":"以 Canva 生成可編輯簡報"}
  </button>
  {job&&<div><small>任務 {job.id} · {job.status}</small>
   {job.status==="in_progress"&&<button type="button" disabled={busy} onClick={()=>void refresh()}>查詢生成進度</button>}
   {job.status==="success"&&job.url&&<p><a href={job.url} target="_blank" rel="noopener noreferrer">{job.kind==="image"?"開啟生成圖片":"開啟 Canva 簡報編輯器"}</a> {job.pages!=null?"("+job.pages+" 頁)":""}</p>}
  </div>}
  {message&&<p role="status">{message}</p>}
  <small>圖片連結通常 24 小時後失效；簡報連結也可能是限期編輯網址。尚未加入自動下載 PPTX／PNG 或完整 Canva OAuth 換證流程。</small>
 </div>;
}
