import {useEffect,useState} from "react";
import {Sparkles,Plus,ShieldCheck,Download,ArrowUpRight,CheckCircle2,AlertTriangle,RefreshCcw,Trash2,Code2,BookOpen} from "lucide-react";
import {getConfigs,generateCloudReply} from "../vault/providers";
import {isOllamaConfigured,generateOllamaReply,getOllamaConfig} from "../ai/ollama";
import {generateLocalReply,getLoadedLocalModel} from "../local-ai/engine";
import {getToneProfile,toneInstruction} from "../ai/tone-adaptation";
import {loadFeatures,validateFeature,featureTemplate,proposalFromAI,installFeature,removeFeature,type FeatureSpec,type FeatureKind} from "./feature-schema";

type Provider="auto"|"local"|"ollama"|"gemini";
function descriptor(spec:FeatureSpec):Record<string,unknown>{
 return {name:spec.name,description:spec.description,kind:spec.kind,fields:spec.fields,
  formula:spec.formula,initialItems:spec.initialItems};
}
function issueMarkdown(idea:string):string{
 return ["# Vanilla Self-Build 工程需求","", "## 使用者需求",idea.trim()||"未指定","",
  "## 安全與品質要求",
  "- 保留既有對話、本地 AI、Google Drive、Ollama 及表格功能",
  "- 先開獨立功能分支與 PR，不直接推送 main",
  "- TypeScript 編譯及回歸測試通過才能合併",
  "- 新增網路、雲端、資料讀取或刪除權限時需單獨授權",
  "- 不可在瀏覽器執行未受審核的 AI 程式碼",
  "- 提供 UI 預覽、變更摘要與回復方式",
  "",
  "## 驗收重點",
  "1. 可以從 Vanilla 介面實際使用",
  "2. iPhone PWA 可操作；無多餘按鈕",
  "3. 既有功能不受影響",
  "4. 使用者審核後才允許合併與部署",
  ""].join("\n");
}
function downloadProposal(name:string,body:string){
 const url=URL.createObjectURL(new Blob([body],{type:"text/markdown;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export default function BuildStudio({onOpen,editingId,onEditingChange}:{onOpen:(id:string)=>void;editingId?:string|null;onEditingChange:(id:string|null)=>void}){
 const [installed,setInstalled]=useState<FeatureSpec[]>(loadFeatures);
 const [idea,setIdea]=useState("");
 const [provider,setProvider]=useState<Provider>("auto");
 const [pending,setPending]=useState<FeatureSpec|null>(null);
 const [status,setStatus]=useState("");
 const [busy,setBusy]=useState(false);
 const [selectedKind,setSelectedKind]=useState<FeatureKind>("checklist");
 useEffect(()=>{const update=()=>setInstalled(loadFeatures());window.addEventListener("vanilla-features-changed",update);return()=>window.removeEventListener("vanilla-features-changed",update);},[]);
 const current=installed.find(x=>x.id===editingId);
 useEffect(()=>{
  if(!current)return;
  setIdea("請幫我改進「"+current.name+"」：");
  setPending(null);
 },[current?.id]);
 function createTemplate(){
  try{
   const spec=featureTemplate(selectedKind);
   setPending(spec);onEditingChange(null);
   setStatus("已建立安全模板預覽。只有按下「確認安裝」後才會加入工作區。");
  }catch(e){setStatus(e instanceof Error?e.message:String(e));}
 }
 function reviewLocalJSON(){
  try{
   const parsed=JSON.parse(idea) as unknown;
   const spec=validateFeature(parsed,current);
   setPending(spec);setStatus("JSON 規格通過檢查，可預覽並安裝");
  }catch(e){setStatus("JSON 驗證失敗："+(e instanceof Error?e.message:String(e)));}
 }
 async function generate(){
  if(!idea.trim()||busy)return;
  setBusy(true);setPending(null);setStatus("正在規劃功能結構…");
  const permitted=provider==="auto"?(isOllamaConfigured()?"ollama":getConfigs().some(x=>x.provider==="gemini")?"gemini":getLoadedLocalModel()?"local":null):provider;
  if(!permitted){setBusy(false);setStatus("未找到可用的本地 AI、Ollama 或 Gemini。你可以先使用下方功能模板，或貼上 JSON 規格。");return;}
  if(permitted==="local"&&!getLoadedLocalModel()){setBusy(false);setStatus("尚未載入本地 AI 模型");return;}
  if(permitted==="ollama"&&!isOllamaConfigured()){setBusy(false);setStatus("請先在系統設定連接 Ollama");return;}
  if(permitted==="gemini"&&!getConfigs().some(x=>x.provider==="gemini")){setBusy(false);setStatus("請先設定 Gemini API");return;}
  if(permitted!=="local"){
   const endpoint=permitted==="gemini"?"Google Gemini 雲端":getOllamaConfig().endpoint;
   if(!window.confirm("Vanilla 將把你的功能構想"+(current?"與現有功能規格":"")+"送到 "+endpoint+" 產生方案。不會傳送聊天紀錄、存取權杖或此功能儲存的使用資料。是否同意？")){setBusy(false);setStatus("已取消外部傳送");return;}
  }
  const schema=[
   '請依照需求回傳「唯一一個 JSON 物件」，不要 Markdown 或多餘解釋。',
   'Vanilla Self-Build 支援的安全模組 kind 僅為 checklist / tracker / calculator / notes。',
   '必填 {"kind":"tracker","name":"功能名稱","description":"一句說明","fields":[{"id":"item","label":"欄位","type":"text"}]}',
   'tracker: fields 1~12 欄，type 可用 text/number/date/checkbox。',
   'calculator: fields 必須都是 number，並提供 formula（只允許欄位 id、數字和 + - * / ()）。例 {"kind":"calculator","name":"費用估算","description":"計算總費用","fields":[{"id":"price","label":"單價","type":"number"},{"id":"count","label":"數量","type":"number"}],"formula":"price*count"}。',
   'checklist: fields:[]，可加入 initialItems 字串陣列；notes: fields:[]。',
   '欄位 ID 小寫英文字母開頭，最多 26 字元；不能產出 JS、網路請求、API Token、HTML 或任意執行指令。',
   '如果構想超出限制，請盡量用最相近的安全模組實現；不可假稱已能直接修改 Vanilla 原始碼。',
   '使用臺灣繁體中文。功能構想：'+idea.slice(0,1800),
   current?'這是要改進的現有功能（請保留適用的欄位 ID，避免紀錄遺失）：'+JSON.stringify(descriptor(current)):""
  ].filter(Boolean).join("\n");
  try{
   const history:[{role:"user";content:string}]=[{role:"user",content:schema}];
   const result=permitted==="ollama"?await generateOllamaReply(history):
    permitted==="gemini"?await generateCloudReply("gemini",history):
    await generateLocalReply(history,()=>{});
   const proposed=proposalFromAI(result,current);
   setPending(proposed);
   setStatus("已產生 "+proposed.kind+" 類型的功能預覽；尚未執行或修改 Vanilla。");
  }catch(e){setStatus("生成或驗證失敗："+(e instanceof Error?e.message:String(e))+"。可以改用另一個模型或安全模板。");}
  finally{setBusy(false);}
 }
 function approve(){
  if(!pending)return;
  try{
   installFeature(pending);
   const id=pending.id;
   setInstalled(loadFeatures());setPending(null);onEditingChange(null);
   setStatus("功能已正式安裝在目前裝置，現在可以從左側導覽直接使用。");
   onOpen(id);
  }catch(e){setStatus("安裝失敗："+(e instanceof Error?e.message:String(e)));}
 }
 function remove(spec:FeatureSpec){
  if(!window.confirm("確定移除「"+spec.name+"」？這只移除功能配置；資料仍暫時保留在裝置內。"))return;
  try{removeFeature(spec.id);setInstalled(loadFeatures());if(editingId===spec.id)onEditingChange(null);setStatus("已移除功能；資料未刪除");}
  catch(e){setStatus(e instanceof Error?e.message:String(e));}
 }
 return <div className="builder-studio">
  <div className="workspace-banner"><div className="workspace-banner-icon"><Sparkles size={26}/></div><div><h2>Vanilla Self-Build Studio</h2><p>你說想要什麼，Vanilla 生成可安裝的小工具；先檢查方案、再批准，不會擅自改動程式碼。</p></div></div>
  <div className="builder-disclosure"><ShieldCheck size={18}/><div><strong>安全的自我擴充，不是無限制自我改寫。</strong><p>第一階段讓 Vanilla 自動建立待辦、追蹤器、計算器、筆記模組，會在瀏覽器本機執行；不會執行 AI 任意 JavaScript、存取 API Key、修改 GitHub 原始碼或自行部署。</p></div></div>
  <section className="builder-panel"><div className="builder-section-heading"><span>01 / 需求</span><h3>{current?"改進現有功能："+current.name:"描述你想新增的功能"}</h3></div>
   <textarea value={idea} onChange={e=>{setIdea(e.target.value);setPending(null);}} rows={4} placeholder="例如：幫我做一個家庭開支追蹤器，紀錄日期、支出、類別，手機上能新增並匯出 CSV。" maxLength={1800}/>
   <div className="builder-controls"><label>生成模型 <select value={provider} onChange={e=>setProvider(e.target.value as Provider)}><option value="auto">自動（Ollama → Gemini → 本地）</option><option value="local">手機本地 AI</option><option value="ollama">Ollama</option><option value="gemini">Gemini API</option></select></label><button type="button" className="workspace-primary" disabled={busy||!idea.trim()} onClick={()=>void generate()}><Sparkles size={16}/>{busy?"正在設計…":"AI 生成方案"}</button></div>
   <div className="builder-template-heading"><span>沒有模型也能立即建立</span></div>
   <div className="builder-template-choices"><select aria-label="安全模組模板" value={selectedKind} onChange={e=>setSelectedKind(e.target.value as FeatureKind)}><option value="checklist">待辦清單</option><option value="tracker">資料追蹤器</option><option value="calculator">數字計算器</option><option value="notes">筆記頁面</option></select><button type="button" onClick={createTemplate}><Plus size={16}/>預覽模板</button><button type="button" disabled={!idea.trim()} onClick={reviewLocalJSON}>驗證 JSON 規格</button></div>
  </section>
  <section className="builder-panel"><div className="builder-section-heading"><span>02 / 檢查</span><h3>功能安裝預覽</h3></div>
   {!pending?<p className="builder-empty">等待你提出需求。AI 產生的方案會先顯示於此，不會立即啟用。</p>:<>
    <div className="builder-preview-header"><div><strong>{pending.name}</strong><p>{pending.description}</p><small>模組：{pending.kind} · {current?"更新至 v"+pending.revision:"新功能 v1"}</small></div><span>待批准</span></div>
    {pending.fields.length>0&&<div className="builder-fields">{pending.fields.map(field=><div key={field.id}><strong>{field.label}</strong><span>{field.type} · {field.id}{field.unit?" · "+field.unit:""}</span></div>)}</div>}
    {pending.formula&&<p className="builder-formula">公式：<code>{pending.formula}</code></p>}
    {pending.initialItems?.length? <p className="builder-formula">預設清單：{pending.initialItems.join("、")}</p>:null}
    {current&&<p className="builder-warning"><AlertTriangle size={15}/>現有紀錄會留在本機。刪除／更名舊欄位可能使部分資料不再顯示，請先備份。</p>}
    <div className="builder-approve"><button type="button" className="workspace-primary" onClick={approve}><CheckCircle2 size={16}/>{current?"確認更新功能":"確認安裝功能"}</button><button type="button" onClick={()=>setPending(null)}>取消方案</button></div>
   </>}
  </section>
  <section className="builder-panel"><div className="builder-section-heading"><span>03 / 已安裝</span><h3>我的自建工具 <small>({installed.length}/24)</small></h3></div>
   {installed.length===0?<p className="builder-empty">目前尚無自建工具。選擇模板或描述你想要的功能。</p>:<div className="builder-installed">{installed.map(spec=><article key={spec.id}><div><strong>{spec.name}</strong><p>{spec.description}</p><small>{spec.kind} · v{spec.revision}</small></div><div><button type="button" onClick={()=>onOpen(spec.id)}>開啟</button><button type="button" onClick={()=>onEditingChange(spec.id)}><RefreshCcw size={14}/>改進</button><button type="button" aria-label={"移除 "+spec.name} title="移除功能" onClick={()=>remove(spec)}><Trash2 size={15}/></button></div></article>)}</div>}
  </section>
  <section className="builder-panel builder-engineering"><div className="builder-section-heading"><span>04 / 進階</span><h3>原始碼等級的功能修改</h3></div>
   <p>如果需求超出這四種模組，例如新增完整 AI Agent、資料庫、3D 功能或串接外部服務，可以產生工程需求。真正修改 React 原始碼仍需 GitHub 分支、程式碼審查、測試與你批准合併，不能從手機頁面直接無審核部署。</p>
   <div className="builder-engineering-actions">
    <button type="button" disabled={!idea.trim()} onClick={()=>downloadProposal("Vanilla-Self-Build-需求.md",issueMarkdown(idea))}><Download size={16}/>匯出工程需求</button>
    <button type="button" disabled={!idea.trim()} onClick={()=>{
     const url="https://github.com/easylearnfromtw/vanilla/issues/new?title="+encodeURIComponent("Self-Build: "+idea.slice(0,65))+"&body="+encodeURIComponent(issueMarkdown(idea).slice(0,6000));
     window.open(url,"_blank","noopener,noreferrer");
    }}><ArrowUpRight size={16}/>提交 GitHub Issue</button>
   </div><p className="builder-engineering-footnote"><Code2 size={15}/>提交 Issue 會開啟 GitHub 網頁供你確認；不會自行提交 PR、使用 GitHub 權杖或跳過部署審核。</p>
  </section>
  <p className="builder-status" role="status">{status}</p>
  <p className="workspace-footnote"><BookOpen size={13}/>已安裝工具和資料只留在本機瀏覽器，跨裝置同步及進階程式碼自動建置需另行設計授權與後端。</p>
 </div>;
}
