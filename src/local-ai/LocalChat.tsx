import {useState} from "react";
import {detectLocalAICapabilities} from "./capabilities";
import {generateLocalReply,isLocalModelReady,loadLocalModel,type ChatTurn,LOCAL_MODEL} from "./engine";

export default function LocalChat(){
  const [history,setHistory]=useState<ChatTurn[]>([]);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState(0);
  const [status,setStatus]=useState(isLocalModelReady()?"本地模型已載入":"尚未下載本地模型");
  const [ready,setReady]=useState(isLocalModelReady());
  const capabilities=detectLocalAICapabilities();
  async function initialize(){
    setBusy(true);
    try{
      await loadLocalModel((message,value)=>{setStatus(message);setProgress(value);});
      setReady(true);setStatus("模型已載入；回答完全在裝置端產生");
    }catch(error){setStatus(error instanceof Error?error.message:"模型載入失敗");}
    finally{setBusy(false);}
  }
  async function send(){
    const question=draft.trim();
    if(!question||busy||!ready)return;
    const next:ChatTurn[]=[...history,{role:"user",content:question}];
    setHistory([...next,{role:"assistant",content:""}]);setDraft("");setBusy(true);
    try{
      const answer=await generateLocalReply(next,text=>setHistory([...next,{role:"assistant",content:text}]));
      setHistory([...next,{role:"assistant",content:answer||"（模型沒有產生內容）"}]);
    }catch(error){setHistory([...next,{role:"assistant",content:"生成失敗："+(error instanceof Error?error.message:"未知錯誤")}]);}
    finally{setBusy(false);}
  }
  return <section className="chat">
    <div className="local-model">
      <strong>iPhone 本地 AI · {LOCAL_MODEL}</strong>
      <p>模型首次載入需要下載檔案，可能佔用大量裝置儲存與記憶體。下載後是否可離線重用，取決於瀏覽器快取是否保留。</p>
      <p role="status">{status}</p>
      {busy&&!ready&&<progress value={progress} max={1} style={{width:"100%"}}/>}
      {!capabilities.webgpu&&<p>此瀏覽器未偵測到 WebGPU；目前不能執行本地推論。</p>}
      <button type="button" disabled={busy||ready||!capabilities.webgpu} onClick={initialize}>{ready?"模型已準備好":busy?"正在載入…":"下載並啟動本地 AI"}</button>
    </div>
    <div className="chat-messages" aria-live="polite">
      {history.length===0?<div className="hero"><h2>Vanilla · Local Intelligence</h2><p>模型準備完成後即可在 iPhone 上進行本地對話，訊息不會送到遠端推論 API。</p></div>:history.map((turn,index)=><div key={index} className={"bubble "+(turn.role==="assistant"?"assistant-bubble":"")}>{turn.content||"思考中…"}</div>)}
    </div>
    <div className="chat-bottom">
      <form onSubmit={event=>{event.preventDefault();void send();}}>
        <input aria-label="本地 AI 訊息" placeholder={ready?"輸入訊息，使用裝置端模型回答":"請先啟動本地模型"} value={draft} disabled={!ready||busy} onChange={event=>setDraft(event.target.value)}/>
        <button type="submit" title="送出本地 AI" disabled={!ready||busy||!draft.trim()}>送出</button>
      </form>
      <small>對話目前只保留在此頁面記憶體中，重新整理會消失。尚未連接加密記憶庫或 Google Drive 同步。</small>
    </div>
  </section>;
}
