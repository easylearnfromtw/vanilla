import {useRef,useState,lazy,Suspense,type ChangeEvent} from "react";
import {Download,Mail,PenLine,FileJson,ShieldCheck} from "lucide-react";
import {driveSession} from "../workspace/cloud-drive";
import {buildEmailTemplate,type EmailTemplateFields,type EmailTemplateKind} from "./email-templates";
import {isEmailDesign,MAX_DESIGN_BYTES,parseEmailSnapshot,scopedEmailStorageKey,type EmailSnapshot} from "./email-policy";
import "./email-studio.css";

const EmailVisualEditor=lazy(()=>import("./EmailVisualEditor"));
const initialFields:EmailTemplateFields={
 brand:"VANILLA",title:"誠摯邀請您參加活動",
 message:"您好：\n我們準備了一場特別的活動，期待與您見面。\n\n活動日期與地點：請在這裡填寫。",
 buttonText:"了解活動詳情",buttonUrl:""
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
 const [snapshot,setSnapshot]=useState<EmailSnapshot|null>(null);
 const [editorOpen,setEditorOpen]=useState(false);
 const [notice,setNotice]=useState("先生成模板；所有基本排版與匯出都在本機完成。");
 const [account,setAccount]=useState<string|null>(initialAccount);
 const uploadRef=useRef<HTMLInputElement>(null);
 function updateField<K extends keyof EmailTemplateFields>(key:K,value:EmailTemplateFields[K]){
  setFields(prev=>({...prev,[key]:value}));
 }
 function generate(){
  try{
   const result=buildEmailTemplate(kind,fields);
   setSnapshot({design:result.design,html:result.html,title:fields.title.trim()||"email",updatedAt:new Date().toISOString()});
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
   setSnapshot(parseEmailSnapshot(saved));setEditorOpen(false);
   setNotice("已讀取本機郵件存檔。");
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
 return <div className="email-studio">
  <div className="email-hero">
   <div className="email-eyebrow"><Mail size={15}/> VANILLA / EMAIL STUDIO</div>
   <h1>郵件設計工作室</h1>
   <p>Unlayer Elements 在本機產生電子郵件 HTML 與可編輯 JSON。需要拖曳修改時，再由你決定是否開啟 Unlayer 線上編輯器。</p>
  </div>
  <div className="email-grid">
   <section className="email-form" aria-label="郵件內容">
    <h2>01 / 編寫內容</h2>
    <label>模板類型
     <select value={kind} onChange={e=>setKind(e.target.value as EmailTemplateKind)}>
      {kinds.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
     </select>
    </label>
    <label>品牌名稱
     <input maxLength={100} value={fields.brand} onChange={e=>updateField("brand",e.target.value)}/>
    </label>
    <label>郵件主標題
     <input maxLength={160} value={fields.title} onChange={e=>updateField("title",e.target.value)}/>
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
    <button type="button" className="email-primary" onClick={generate}><PenLine size={17}/> 產生郵件模板</button>
   </section>
   <section className="email-preview" aria-label="郵件預覽">
    <div className="email-preview-title"><h2>02 / 預覽及匯出</h2><span>{snapshot?"HTML + JSON":"尚未產生"}</span></div>
    {snapshot?.html?
     <iframe title="郵件預覽（已停用 JavaScript）" sandbox="" referrerPolicy="no-referrer" srcDoc={snapshot.html}/>:
     <div className="email-preview-empty">{snapshot?"此設計只有 JSON，請透過編輯器匯出 HTML。":"選擇模板並輸入內容，產生後將在此顯示信件。"}</div>}
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
   <p><ShieldCheck size={16}/> 此功能會載入第三方 Unlayer 線上程式，並將目前的設計內容交由該服務處理。請勿匯入機密信件、醫療資料或個人識別資料。基本 HTML 生成與匯出不需要啟用它。</p>
   {!editorOpen?
    <button className="email-primary" disabled={!snapshot} type="button" onClick={()=>setEditorOpen(true)}>同意載入並開啟 Unlayer 編輯器</button>:
    <Suspense fallback={<p role="status">正在準備編輯器…</p>}>
     {snapshot?<EmailVisualEditor design={snapshot.design} onClose={()=>setEditorOpen(false)} onExport={(design,html)=>{
      setSnapshot(prev=>prev?{...prev,design,html,updatedAt:new Date().toISOString()}:null);
      setNotice("已同步最新編輯結果，請自行下載或按「儲存本機」。");
     }}/>:null}
    </Suspense>}
  </section>
  <p className="email-footer-note" role="status">{notice}</p>
  <p className="email-footer-note">本機存檔依目前 Google 登入帳號隔離；未登入時，使用共用裝置儲存空間。{currentAccount!==account?" 偵測到帳號變更，請重新確認儲存／讀取。":""}目前不會自動寄送郵件、同步 Drive 或呼叫 AI。</p>
 </div>;
}
