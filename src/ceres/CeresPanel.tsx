import {useEffect,useRef,useState} from "react";
import {currentChatMode} from "../local-ai/chat-session";
import {getLoadedLocalModel,isLocalModelReady} from "../local-ai/engine";
import {listCandidates} from "../ai/model-orchestrator";
import {generateCeresDraft} from "./ai-draft";
import {ceresDraftDestination,type CeresDraftTone} from "./draft-policy";
import {
 getWeiGuoCeresEvents,getWeiGuoCeresStatus,
 sendWeiGuoCeresReply,weiGuoApiBase,weiGuoIdentity,
 type CeresFamilyEvent,type CeresFamilyStatus
} from "../weiguo/api";

/** External Telegram messages are always plain text; no markdown/HTML evaluation. */
export default function CeresPanel(){
 const [info,setInfo]=useState<CeresFamilyStatus|null>(null);
 const [items,setItems]=useState<CeresFamilyEvent[]>([]);
 const [chosen,setChosen]=useState<number|null>(null);
 const [reply,setReply]=useState("");
 const [draftApproved,setDraftApproved]=useState(false);
 const [replyApproved,setReplyApproved]=useState(false);
 const [modelId,setModelId]=useState("");
 const [draftTone,setDraftTone]=useState<CeresDraftTone>("natural");
 const [modelRefresh,setModelRefresh]=useState(0);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("Telegram 文字是外部資料；不會自動啟動 AI、Detroit 工具或傳送回覆。");
 const requestController=useRef<AbortController|null>(null);
 const draftAttempts=useRef<number[]>([]);
 const identity=weiGuoIdentity();
 const privateMode=currentChatMode()==="private";
 const selected=items.find(x=>x.id===chosen);
 const ready=Boolean(identity&&identity.role!=="viewer"&&weiGuoApiBase()&&!privateMode);
 // All candidates are the user's already-configured Vanilla model connections.
 // Merely showing them does not load a model or transmit Telegram message content.
 const candidates=!privateMode?listCandidates({
  localReady:isLocalModelReady(),localModel:getLoadedLocalModel()||"",
  image:false,online:navigator.onLine,privateMode:false
 }):[];
 const selectedCandidate=candidates.find(x=>x.id===modelId);
 const destination=selectedCandidate?ceresDraftDestination(selectedCandidate.source,selectedCandidate.location):"";

 function cancelDraft(){
  requestController.current?.abort();
  requestController.current=null;
  setBusy(false);
 }
 async function reload(){
  if(!ready){setNotice(privateMode?"私密模式不連接 Ceres。":"請先在衞國以家庭帳號登入，並部署 HTTPS 後端。");return;}
  setBusy(true);
  try{
   const state=await getWeiGuoCeresStatus();
   setInfo(state);
   const result=state.linked?await getWeiGuoCeresEvents():{events:[]};
   setItems(result.events);
   setChosen(previous=>result.events.some(x=>x.id===previous)?previous:(result.events[0]?.id??null));
   setNotice(state.linked?"已取得此帳號專屬的 Telegram 訊息。可選擇 Vanilla 模型起草，仍須人工確認。":"目前沒有綁定你的 Telegram 私聊帳號；請由後端管理員完成身分對應。");
  }catch(e){setNotice("讀取失敗："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 useEffect(()=>{void reload();return ()=>requestController.current?.abort();},[]);
 function choose(id:number){
  cancelDraft();
  setChosen(id);setReply("");setReplyApproved(false);setDraftApproved(false);
 }
 function changeModel(id:string){
  cancelDraft();
  setModelId(id);setDraftApproved(false);setReplyApproved(false);
 }
 async function generateDraft(){
  if(!selected||!selectedCandidate||!draftApproved||!ready||busy||selected.reply_status)return;
  const now=Date.now();
  draftAttempts.current=draftAttempts.current.filter(at=>now-at<60_000);
  if(draftAttempts.current.length>=4){setNotice("為避免意外 API 費用，每分鐘最多產生四次草稿。");return;}
  draftAttempts.current.push(now);
  const controller=new AbortController();
  requestController.current=controller;
  const owner=weiGuoIdentity()?.email;
  setBusy(true);
  setDraftApproved(false);
  setReplyApproved(false);
  try{
   const text=await generateCeresDraft(selectedCandidate,selected.text,draftTone,controller.signal);
   if(controller.signal.aborted||requestController.current!==controller||weiGuoIdentity()?.email!==owner)return;
   setReply(text);
   setNotice("Merlin／爾雅風格的草稿已產生，尚未傳送。請核對內容，再獨立勾選 Telegram 傳送同意。");
  }catch(e){
   if(!controller.signal.aborted&&requestController.current===controller){
    setNotice("草稿未產生："+String(e instanceof Error?e.message:e)+"。原本的手動回覆功能不受影響。");
   }
  }finally{
   if(requestController.current===controller){requestController.current=null;setBusy(false);}
  }
 }
 async function send(){
  if(!selected||!replyApproved||busy||!reply.trim())return;
  setBusy(true);
  try{
   await sendWeiGuoCeresReply(selected.id,reply,true);
   setReply("");setReplyApproved(false);setDraftApproved(false);
   setNotice("Telegram 已確認收到回覆；此訊息不允許重複傳送。");
   const result=await getWeiGuoCeresEvents();setItems(result.events);
  }catch(e){
   setReplyApproved(false);
   setNotice("傳送結果："+String(e instanceof Error?e.message:e)+"。若結果不確定，請勿重試同一事件。");
  }finally{setBusy(false);}
 }
 return <section className="detroit-studio-form">
  <h2>Ceres · Telegram 訊息工作台</h2>
  <p>Vanilla 原生雙向通訊：驗證家庭身分、選用已連接的 Vanilla AI 模型產生純文字草稿、人工確認後才回覆 Telegram。LINE／Discord 尚待開發。</p>
  <p>目前登入：{identity?identity.member+"（"+identity.role+"）":"尚未登入衞國"}。Telegram 金鑰只存在 Railway 後端。</p>
  {!identity&&<button type="button" onClick={()=>window.dispatchEvent(new Event("vanilla-open-weiguo"))}>開啟衞國登入</button>}
  <button type="button" onClick={()=>void reload()} disabled={!ready||busy}>{busy?"處理中…":"重新整理訊息"}</button>
  <p role="status" aria-live="polite">{notice}</p>
  {info&&<p>Ceres：{info.enabled?"後端啟用":"尚未啟用"} · 帳號：{info.linked?"已綁定":"未綁定"} · Telegram 人工回覆：{info.outboundEnabled?"已啟用":"未啟用"} · Vanilla AI 草稿：選擇下方模型後使用</p>}
  {ready&&info?.linked&&<>
   <label>選擇收到的訊息
    <select value={chosen??""} onChange={e=>choose(Number(e.target.value))}>
     {items.length===0&&<option value="">尚無訊息</option>}
     {items.map(item=><option key={item.id} value={item.id}>#{item.id} · {new Date(item.created_at*1000).toLocaleString("zh-TW")} · {item.reply_status||"待回覆"}</option>)}
    </select>
   </label>
   {selected&&<>
    <h3>收到的訊息（不可信外部內容）</h3>
    <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{selected.text}</p>
    {selected.reply_status?<p>回覆紀錄：{selected.reply_status==="sent"?"已傳送":"傳送狀態不確定，禁止自動重試"}</p>:
    <>
     <h3>AI 回覆草稿（選用）</h3>
     <p>Merlin 負責限定回覆任務，爾雅風格負責文字語氣；僅將選取的這一則訊息交給你指定的模型，不會讀取其他家庭資料或執行工具。</p>
     <label>本次草稿使用的 Vanilla 模型
      <select value={selectedCandidate?.id||""} onChange={e=>changeModel(e.target.value)} disabled={busy}>
       <option value="">請選擇模型（不自動使用雲端）</option>
       {candidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.label} · {candidate.location}</option>)}
      </select>
     </label>
     <button type="button" disabled={busy} onClick={()=>setModelRefresh(x=>x+1)}>重新偵測可用模型</button>
     {!candidates.length&&<p>尚無可用模型。請先在 Vanilla 載入本機模型，或到模型連線設定中接入 Ollama、Gemini／DeepSeek；不會在背景下載模型。</p>}
     {selectedCandidate&&<>
      <p>{destination}。若為雲端模型，可能會產生 API 費用。</p>
      <label>回覆語氣
       <select value={draftTone} onChange={e=>{setDraftTone(e.target.value as CeresDraftTone);setDraftApproved(false);}} disabled={busy}>
        <option value="natural">自然簡潔</option>
        <option value="polite">專業禮貌</option>
        <option value="friendly">親切友善</option>
       </select>
      </label>
      <label className="detroit-consent"><input type="checkbox" checked={draftApproved} disabled={busy} onChange={e=>setDraftApproved(e.target.checked)}/>我同意只將本則 Telegram 訊息交給上述模型產生草稿；{selectedCandidate.source==="local"?"內容僅在本裝置處理":"內容將傳送至所選模型服務"}，不會自動回傳 Telegram</label>
      <button type="button" disabled={busy||!draftApproved} onClick={()=>void generateDraft()}>{busy?"正在處理…":"產生 AI 回覆草稿"}</button>
     </>}
     <label>確認後的回覆文字<textarea rows={6} maxLength={3000} value={reply} onChange={e=>{setReply(e.target.value);setReplyApproved(false);}} placeholder="自己撰寫，或核對 AI 草稿"/></label>
     <label className="detroit-consent"><input type="checkbox" checked={replyApproved} disabled={busy} onChange={e=>setReplyApproved(e.target.checked)}/>我已確認這則訊息的內容與收件對象，同意本次傳送至 Telegram</label>
     <button type="button" className="detroit-primary" disabled={busy||!replyApproved||!reply.trim()||!info.outboundEnabled} onClick={()=>void send()}>確認並傳送此則回覆</button>
    </>}
   </>}
  </>}
  <p>沒有自動回覆、背景代理執行或跨家庭資料存取；即使 AI 完成草稿，也必須獨立授權每次 Telegram 發送。</p>
 </section>;
}
