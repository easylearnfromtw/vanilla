import {useEffect,useRef,useState,lazy,Suspense,type ChangeEvent} from "react";
import {Download,Mail,PenLine,FileJson,ShieldCheck} from "lucide-react";
import {driveSession} from "../workspace/cloud-drive";
import {currentChatMode} from "../local-ai/chat-session";
import {janusPermission} from "../detroit/janus";
import {buildEmailTemplate,type EmailTemplateFields,type EmailTemplateKind} from "./email-templates";
import {VENUS_EMAIL_THEMES,recommendedVenusTheme,venusAuditEmail,type VenusEmailThemeId} from "../venus/email-design";
import {auditRenderedEmail,applyInboxPreheader} from "./email-quality";
import {isEmailDesign,MAX_DESIGN_BYTES,parseEmailSnapshot,scopedEmailStorageKey,type EmailSnapshot} from "./email-policy";
import "./email-studio.css";

const EmailVisualEditor=lazy(()=>import("./EmailVisualEditor"));
const initialFields:EmailTemplateFields={
 brand:"VANILLA",title:"誠摯邀請您參加活動",
 message:"您好：\n我們準備了一場特別的活動，期待與您見面。\n\n活動日期與地點：請在這裡填寫。",
 buttonText:"了解活動詳情",buttonUrl:"",preheader:"活動資訊與報名方式，一封信了解重點"
};
const kinds:Array<{id:EmailTemplateKind;label:string}>= [
 {id:"invitation",label:"活動邀請函"},
 {id:"newsletter",label:"會員電子報"},
 {id:"announcement",label:"公告通知"}
];
function download(name:string,content:string,type:string){
 const url=URL.createObjectURL(new Blob([content],{type}));
 const anchor=document.createElement("a");
 anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function initialAccount(){return driveSession()?.email||null;}
export default function EmailStudio(){
 const [kind,setKind]=useState<EmailTemplateKind>("invitation");
 const [fields,setFields]=useState<EmailTemplateFields>(initialFields);
 const [venusTheme,setVenusTheme]=useState<VenusEmailThemeId>("warm");
 const [previewSize,setPreviewSize]=useState<"desktop"|"phone">("desktop");
 const [snapshot,setSnapshot]=useState<EmailSnapshot|null>(null);
 const [editorOpen,setEditorOpen]=useState(false);
 const [notice,setNotice]=useState("先生成模板；所有基本排版與匯出都在本機完成。");
 const [account,setAccount]=useState<string|null>(initialAccount);
 const uploadRef=useRef<HTMLInputElement>(null);
 const accountRef=useRef(account);
 useEffect(()=>{
  function resetOnAccountChange(){
   const current=initialAccount();
   if(accountRef.current===current)return;
   accountRef.current=current;
   setAccount(current);
   setSnapshot(null);
   setFields({...initialFields});
   setKind("invitation");
   setVenusTheme("warm");
   setEditorOpen(false);
   setNotice("Google 帳號已切換；先前帳號的郵件內容與編輯欄位已清除。");
  }
  window.addEventListener("vanilla-drive-connected",resetOnAccountChange);
  window.addEventListener("vanilla-drive-disconnected",resetOnAccountChange);
  return ()=>{
   window.removeEventListener("vanilla-drive-connected",resetOnAccountChange);
   window.removeEventListener("vanilla-drive-disconnected",resetOnAccountChange);
  };
 },[]);

 function updateField<K extends keyof EmailTemplateFields>(key:K,value:EmailTemplateFields[K]){
  setFields(prev=>({...prev,[key]:value}));
 }
 function generate(){
  try{
   const verdict=janusPermission("render-local",{privateMode:currentChatMode()==="private",approved:false});
   if(!verdict.allow)throw new Error(verdict.reason);
   const result=buildEmailTemplate(kind,fields,venusTheme);
   setSnapshot({design:result.design,html:result.html,title:fields.title.trim()||"email",updatedAt:new Date().toISOString(),source:{kind,theme:venusTheme,fields:{...fields}}});
   setEditorOpen(false);
   setNotice("模板已產生。可以離線預覽與下載；雲端編輯器不會自動連線。");
  }catch(error){setNotice("生成失敗："+String(error instanceof Error?error.message:error));}
 }
 function save(){
  if(!snapshot)return;
  try{
   const current=initialAccount();
   if(current!==account){setAccount(current);setNotice("帳號已變更，請確認後重試儲存");return;}
   const data=JSON.stringify(snapshot);
   if(data.length>MAX_DESIGN_BYTES)throw new Error("設計檔案超過本機儲存上限");
   localStorage.setItem(scopedEmailStorageKey(account),data);
   setNotice("已儲存於此裝置目前帳號的瀏覽器空間；不會自動同步到 Drive。");
  }catch(error){setNotice("儲存失敗："+String(error instanceof Error?error.message:error));}
 }
 function restore(){
  try{
   const current=initialAccount();
   if(current!==account){setAccount(current);setNotice("帳號已變更，請再按一次讀取");return;}
   const saved=localStorage.getItem(scopedEmailStorageKey(account));
   if(!saved)throw new Error("此帳號尚無本機郵件存檔");
   const loaded=parseEmailSnapshot(saved);
   setSnapshot(loaded);setEditorOpen(false);
   if(loaded.source){setKind(loaded.source.kind);setVenusTheme(loaded.source.theme);setFields({...loaded.source.fields});}
   setNotice(loaded.source?"已讀取郵件存檔，並還原版型與編輯欄位。":"已讀取舊版郵件存檔；原始編輯欄位不在舊格式中。");
  }catch(error){setNotice("讀取失敗："+String(error instanceof Error?error.message:error));}
 }
 async function importJson(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  try{
   if(file.size>MAX_DESIGN_BYTES)throw new Error("JSON 檔案不可超過 1 MB");
   const content=await file.text();
   const design:unknown=JSON.parse(content);
   if(!isEmailDesign(design))throw new Error("不是有效的 Unlayer 設計 JSON");
   setSnapshot({design,html:"",title:file.name.replace(/\.json$/i,"").slice(0,160),updatedAt:new Date().toISOString()});
   setEditorOpen(false);
   setNotice("已載入設計 JSON。需主動開啟 Unlayer 編輯器並同步後，才能匯出修改後的 HTML。");
  }catch(error){setNotice("匯入失敗："+String(error instanceof Error?error.message:error));}
 }
 const fileStem=(snapshot?.title||"vanilla-email").replace(/[^\p{L}\p{N}_-]+/gu,"-").slice(0,64)||"vanilla-email";
 const currentAccount=initialAccount();
 const venusFindings=venusAuditEmail(fields);
 const critical=venusFindings.filter(x=>x.level==="caution").length;
 const htmlAudit=auditRenderedEmail(snapshot?.html||"");
 const sourceChanged=Boolean(snapshot?.source&&!snapshot.externallyEdited&&JSON.stringify(snapshot.source)!==JSON.stringify({kind,theme:venusTheme,fields}));
 const htmlAlerts=htmlAudit.findings.filter(f=>f.level==="caution").length;
 return <div className="email-studio">
  <div className="email-hero">
   <div className="email-eyebrow"><Mail size={15}/> VANILLA / DETROIT / JANUS</div>
   <h1>JANUS <span>· 郵件設計</span></h1>
   <p>Janus 負責郵件 HTML／JSON 產製，Venus 提供本機配色、排版建議與手機預覽。需使用拖曳編輯時，再由你決定是否開啟 Unlayer 線上編輯器。</p>
  </div>
  <div className="email-grid">
   <section className="email-form" aria-label="郵件內容">
    <h2>01 / 編寫內容</h2>
    <label>模板類型
     <select value={kind} onChange={e=>{const next=e.target.value as EmailTemplateKind;setKind(next);setVenusTheme(recommendedVenusTheme(next));}}>
      {kinds.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
     </select>
    </label>
    <div className="email-venus-panel">
     <div className="email-venus-heading"><strong>VENUS · 視覺呈現</strong><span>本機設計輔助</span></div>
     <label>排版風格
      <select aria-label="Venus 郵件排版風格" value={venusTheme} onChange={e=>setVenusTheme(e.target.value as VenusEmailThemeId)}>
       {Object.values(VENUS_EMAIL_THEMES).map(theme=><option key={theme.id} value={theme.id}>{theme.label} · {theme.description}</option>)}
      </select>
     </label>
     <p>切換風格不會更動已產生的郵件，按「產生郵件」才會更新內容。</p>
    </div>
    <label>品牌名稱
     <input maxLength={100} value={fields.brand} onChange={e=>updateField("brand",e.target.value)}/>
    </label>
    <label>郵件主標題
     <input maxLength={160} value={fields.title} onChange={e=>updateField("title",e.target.value)}/>
    </label>
    <label>收件匣預覽摘要（視郵件服務支援，不顯示在信件正文）
     <input maxLength={150} value={fields.preheader||""} onChange={e=>updateField("preheader",e.target.value)} placeholder="一句話提示讀者此封郵件重點"/>
    </label>
    <label>內文
     <textarea maxLength={3000} rows={7} value={fields.message} onChange={e=>updateField("message",e.target.value)}/>
    </label>
    <label>按鈕文字
     <input maxLength={80} value={fields.buttonText} onChange={e=>updateField("buttonText",e.target.value)}/>
    </label>
    <label>按鈕連結（僅 HTTPS，可留白）
     <input type="url" inputMode="url" placeholder="https://example.com" value={fields.buttonUrl} onChange={e=>updateField("buttonUrl",e.target.value)}/>
    </label>
    <section className="email-venus-audit" aria-label="Venus 排版與內容檢查">
     <div className="email-venus-heading"><strong>VENUS · 品質檢查</strong><span>{critical?critical+" 項需注意":venusFindings.length+" 項優化建議"}</span></div>
     {venusFindings.length?<ul>{venusFindings.map(check=><li key={check.code} className={"venus-"+check.level}>{check.message}</li>)}</ul>:
      <p>基本長度與連結格式沒有明顯問題。郵件相容性、寄送及送達率仍需另行驗證。</p>}
    </section>
    <button type="button" className="email-primary" onClick={generate}><PenLine size={17}/> Janus × Venus · 產生郵件</button>
   </section>
   <section className="email-preview" aria-label="郵件預覽">
    <div className="email-preview-title"><h2>02 / Venus 預覽及匯出</h2><span>{snapshot?"HTML + JSON":"尚未產生"}</span></div>
    <div className="email-preview-mode" role="group" aria-label="預覽裝置">
     <button type="button" aria-pressed={previewSize==="desktop"} onClick={()=>setPreviewSize("desktop")}>桌面 · 600px</button>
     <button type="button" aria-pressed={previewSize==="phone"} onClick={()=>setPreviewSize("phone")}>手機 · 360px</button>
    </div>
    <div className={"email-preview-canvas"+(previewSize==="phone"?" is-phone":"")}>
     {snapshot?.html?
      <iframe title="郵件預覽（已停用 JavaScript）" sandbox="" referrerPolicy="no-referrer" srcDoc={snapshot.html}/>:
      <div className="email-preview-empty">{snapshot?"此設計只有 JSON，請透過編輯器匯出 HTML。":"選擇模板並輸入內容，產生後將在此顯示信件。"}</div>}
    </div>
    <section className="email-venus-audit" aria-label="Venus 郵件成品檢查">
     <div className="email-venus-heading"><strong>VENUS · HTML 成品檢查</strong><span>{htmlAudit.status==="unavailable"?"尚無 HTML":htmlAlerts?htmlAlerts+" 項需注意":htmlAudit.findings.length+" 項建議"}</span></div>
     {sourceChanged&&<p className="email-output-stale">編輯欄位已變更，目前預覽／下載仍是上次產生的版本。請重新按「產生郵件」。</p>}
     {snapshot?.externallyEdited&&<p>內容已在 Unlayer 編輯器修改，以下依最新同步 HTML 重新檢查；表單欄位可能不一致。</p>}
     {htmlAudit.status==="unavailable"?<p>{snapshot?"只有設計 JSON，開啟選用的編輯器並同步後才會取得 HTML。":"產生或讀取 HTML 後，Venus 才能檢查成品。"}</p>:
      htmlAudit.findings.length?<ul>{htmlAudit.findings.map(f=><li key={f.code} className={"venus-"+f.level}>{f.message}</li>)}</ul>:
      <p>未發現本檢查器能識別的 HTML 結構、連結或圖片問題；仍不等於郵件客戶端相容性驗證。</p>}
    </section>
    <div className="email-actions">
     <button type="button" disabled={!snapshot?.html} onClick={()=>snapshot&&download(fileStem+".html",snapshot.html,"text/html;charset=utf-8")}><Download size={15}/> HTML</button>
     <button type="button" disabled={!snapshot} onClick={()=>snapshot&&download(fileStem+".json",JSON.stringify(snapshot.design,null,2),"application/json")}><FileJson size={15}/> 設計 JSON</button>
     <button type="button" disabled={!snapshot} onClick={save}>儲存本機</button>
     <button type="button" onClick={restore}>讀取本機</button>
     <button type="button" onClick={()=>uploadRef.current?.click()}>匯入 JSON</button>
     <input ref={uploadRef} type="file" accept=".json,application/json" aria-label="匯入 Unlayer JSON" onChange={e=>void importJson(e)} hidden/>
    </div>
   </section>
  </div>
  <section className="email-cloud">
   <h2>03 / 視覺化拖曳編輯（選用）</h2>
   <p><ShieldCheck size={16}/> 私密模式只能使用 Janus 本機模板，不會開啟第三方編輯器。此功能會載入第三方 Unlayer 線上程式，並將目前的設計內容交由該服務處理。請勿匯入機密信件、醫療資料或個人識別資料。基本 HTML 生成與匯出不需要啟用它。</p>
   {!editorOpen?
    <button className="email-primary" disabled={!snapshot} type="button" onClick={()=>{const verdict=janusPermission("hosted-editor",{privateMode:currentChatMode()==="private",approved:true});if(!verdict.allow){setNotice(verdict.reason);return;}setEditorOpen(true);}}>同意載入並開啟 Unlayer 編輯器</button>:
    <Suspense fallback={<p role="status">正在準備編輯器…</p>}>
     {snapshot?<EmailVisualEditor design={snapshot.design} onClose={()=>setEditorOpen(false)} onExport={(design,html)=>{
      setSnapshot(prev=>prev?{...prev,design,html:applyInboxPreheader(html,prev.source?.fields.preheader||""),updatedAt:new Date().toISOString(),externallyEdited:true}:null);
      setNotice("已同步最新編輯結果，請自行下載或按「儲存本機」。");
     }}/>:null}
    </Suspense>}
  </section>
  <p className="email-footer-note" role="status">{notice}</p>
  <p className="email-footer-note">Venus 分別檢查目前表單及最新保存的 HTML；匯入 JSON 必須先取得 HTML 才能完成成品檢查。收件匣摘要只在部分郵件客戶端生效，裝置預覽仍不等於 Gmail／Outlook 實際渲染。</p>
  <p className="email-footer-note">Detroit / Janus · 本機存檔依目前 Google 登入帳號隔離；未登入時，使用共用裝置儲存空間。{currentAccount!==account?" 偵測到帳號變更，請重新確認儲存／讀取。":""}目前不會自動寄送郵件、同步 Drive 或呼叫 AI。</p>
 </div>;
}
