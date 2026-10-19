import {useEffect,useState} from "react";
import {currentChatMode} from "../local-ai/chat-session";
import {
 getWeiGuoCeresEvents,getWeiGuoCeresStatus,draftWeiGuoCeresReply,
 sendWeiGuoCeresReply,weiGuoApiBase,weiGuoIdentity,
 type CeresFamilyEvent,type CeresFamilyStatus
} from "../weiguo/api";

/** Display external text as plain React text, never HTML or a command. */
export default function CeresPanel(){
 const [info,setInfo]=useState<CeresFamilyStatus|null>(null);
 const [items,setItems]=useState<CeresFamilyEvent[]>([]);
 const [chosen,setChosen]=useState<number|null>(null);
 const [reply,setReply]=useState("");
 const [draftApproved,setDraftApproved]=useState(false);
 const [replyApproved,setReplyApproved]=useState(false);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("Telegram 訊息不會自動啟動 AI 或任何工具。");
 const identity=weiGuoIdentity();
 const privateMode=currentChatMode()==="private";
 const selected=items.find(x=>x.id===chosen);
 const ready=Boolean(identity&&identity.role!=="viewer"&&weiGuoApiBase()&&!privateMode);
 async function reload(){
  if(!ready){setNotice(privateMode?"私密模式不連接 Ceres。":"請先在衞國以家庭帳號登入，並部署 HTTPS 後端。");return;}
  setBusy(true);
  try{
   const state=await getWeiGuoCeresStatus();
   setInfo(state);
   const result=state.linked?await getWeiGuoCeresEvents():{events:[]};
   setItems(result.events);
   setChosen(previous=>result.events.some(x=>x.id===previous)?previous:(result.events[0]?.id??null));
   setNotice(state.linked?"已取得此帳號專屬的 Telegram 訊息。":"目前沒有綁定你的 Telegram 私聊帳號；請由後端管理員完成身分對應。");
  }catch(e){setNotice("讀取失敗："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 useEffect(()=>{void reload();},[]);
 function choose(id:number){
  setChosen(id);setReply("");setReplyApproved(false);setDraftApproved(false);
 }
 async function generateDraft(){
  if(!selected||!draftApproved||busy)return;
  setBusy(true);
  try{
   const data=await draftWeiGuoCeresReply(selected.id,true);
   setReply(data.draft);setReplyApproved(false);
   setNotice("草稿已取得，但尚未傳送。請逐字確認，才能按「傳送」。");
  }catch(e){setNotice("草稿失敗："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
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
  <p>Vanilla 原生雙向通訊：逐人身分綁定、唯讀訊息收件匣、可選本機 AI 草稿與人工確認後回覆。不使用 AstrBot 程式碼；LINE／Discord 仍待獨立開發。</p>
  <p>目前登入：{identity?identity.member+"（"+identity.role+"）":"尚未登入衞國"}。所有 Telegram 金鑰都只存於後端。</p>
  {!identity&&<button type="button" onClick={()=>window.dispatchEvent(new Event("vanilla-open-weiguo"))}>開啟衞國登入</button>}
  <button type="button" onClick={()=>void reload()} disabled={!ready||busy}>{busy?"處理中…":"重新整理訊息"}</button>
  <p role="status" aria-live="polite">{notice}</p>
  {info&&<p>Ceres：{info.enabled?"後端啟用":"尚未啟用"} · 帳號：{info.linked?"已綁定":"未綁定"} · 回覆：{info.outboundEnabled?"已啟用":"未啟用"} · 本地草稿：{info.draftEnabled?"已啟用":"未啟用"}</p>}
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
     {info.draftEnabled&&<label className="detroit-consent"><input type="checkbox" checked={draftApproved} onChange={e=>setDraftApproved(e.target.checked)}/>同意將這則 Telegram 文字傳送到我自行部署的本地 Ollama，僅產生草稿</label>}
     {info.draftEnabled&&<button type="button" disabled={busy||!draftApproved} onClick={()=>void generateDraft()}>產生本地 AI 草稿</button>}
     <label>確認後的回覆文字<textarea rows={6} maxLength={3000} value={reply} onChange={e=>{setReply(e.target.value);setReplyApproved(false);}} placeholder="自己撰寫，或確認本地 AI 草稿"/></label>
     <label className="detroit-consent"><input type="checkbox" checked={replyApproved} onChange={e=>setReplyApproved(e.target.checked)}/>我已確認這則訊息的內容與收件對象，同意本次傳送至 Telegram</label>
     <button type="button" className="detroit-primary" disabled={busy||!replyApproved||!reply.trim()||!info.outboundEnabled} onClick={()=>void send()}>確認並傳送此則回覆</button>
    </>}
   </>}
  </>}
  <p>此版本沒有 AI 自動回覆、背景代理執行或讀取其他家庭成員資料的權限；詳細部署要求見 docs/CERES_INTEGRATION.md。</p>
 </section>;
