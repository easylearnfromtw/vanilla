import {useEffect,useState,lazy,Suspense} from 'react';
import {Image,FileText,ShieldCheck,Clock3,Download,Layers3,Palette,Database,Mail,Activity,CalendarDays,Network} from 'lucide-react';
import OrchestraStudio from '../orchestra/OrchestraStudio';
import LucaPanel from '../luca/LucaPanel';
import MedusaTool from './MedusaTool';
import QuirinusTool from './QuirinusTool';
import ApiRegistryPanel from './ApiRegistryPanel';
import {bardGenerate,bardSave,type BardImage} from './bard';
import {createRetinaDocument,downloadRetina,type RetinaFormat} from './retina';
import {currentChatMode} from '../local-ai/chat-session';
import {convertWeiGuoWordCraft,weiGuoApiBase,weiGuoIdentity} from '../weiguo/api';
import {DETROIT_ENGINES} from './core';
import './studio.css';
const JanusStudio=lazy(()=>import('../email/EmailStudio'));
const NotionSchedulePanel=lazy(()=>import('../notion/NotionSchedulePanel'));
const SlimePanel=lazy(()=>import('../slime/SlimePanel'));
type Tab='retina'|'bard'|'athena'|'jobs'|'orchestra'|'luna'|'registry'|'janus'|'medusa'|'luca'|'quirinus'|'notion'|'slime';
export default function DetroitStudio({initialBody,initialTab="retina"}:{initialBody?:string|null;initialTab?:Tab}={}){
 const [tab,setTab]=useState<Tab>(initialTab);
 useEffect(()=>{setTab(initialTab);},[initialTab]);
 useEffect(()=>{if(initialBody?.trim()){setBody(initialBody.slice(0,160000));setTab('retina');}},[initialBody]);
 const [title,setTitle]=useState('新報告');
 const [body,setBody]=useState('# 摘要\n請將實際資料、研究內容或已確認的文字貼在這裡。\n# 建議\n- 每項結論註明依據。');
 const [format,setFormat]=useState<RetinaFormat>('pdf');
 const [prompt,setPrompt]=useState('');
 const [approve,setApprove]=useState(false);
 const [wordcraftApproved,setWordcraftApproved]=useState(false);
 const [image,setImage]=useState<BardImage|null>(null);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const [health,setHealth]=useState('未連接後端。');
 const [workerEndpoint,setWorkerEndpoint]=useState('');
 useEffect(()=>{if(tab==='jobs')setHealth('請部署自己的 Worker 並在此輸入 URL。此頁不收取後端管理金鑰。');},[tab]);
 async function make(){
  if(busy)return;setBusy(true);setStatus('Retina 正在本機排版…');
  try{const result=await createRetinaDocument({title,body,format});downloadRetina(result);setStatus(`已產製 ${result.name}，共整理 ${result.sections} 個內容區塊。未將內容送至雲端。`);}
  catch(e){setStatus('匯出失敗：'+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 async function makeWordcraft(){
  if(busy)return;
  if(currentChatMode()==='private')return setStatus('私人模式禁止將文件內容傳送到後端，請使用本機 Retina。');
  if(!wordcraftApproved)return setStatus('請先明確同意將文件內容傳送至衞國後端。');
  if(format==='pptx')return setStatus('WordCraft 此介面僅支援 DOCX／PDF，PPTX 請使用本機 Retina。');
  setBusy(true);setStatus('WordCraft 後端正在處理文件…');
  try{
   const file=await convertWeiGuoWordCraft(title,body,format);
   downloadRetina({name:file.filename,mime:file.mime,bytes:file.bytes,sections:0});
   setStatus('WordCraft 文件已產生並提供下載；文件內容未儲存在衞國工作資料庫。');
  }catch(e){setStatus('WordCraft 未完成：'+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 async function generate(){
  if(busy)return;setBusy(true);setStatus('Bard 正在呼叫已授權 Gemini 圖片模型…');setImage(null);
  try{const result=await bardGenerate(prompt,{privateMode:currentChatMode()==='private',approved:approve});setImage(result);setStatus('已取得圖片。圖片只存在目前分頁，請按下載保存。');}
  catch(e){setStatus('生圖未完成：'+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 async function checkWorker(){
  if(!/^https:\/\//i.test(workerEndpoint))return setHealth('請輸入自己的 HTTPS Worker 網址。');
  setHealth('檢查中…');
  try{
   // Worker admin API is not accessible anonymously; deliberately do not store or expose server credentials here.
   const url=new URL(workerEndpoint);if(url.username||url.password||url.search||url.hash)throw Error('請輸入不含密碼或 query 的安全網址');
   const res=await fetch(url.origin+'/public-health',{method:'GET',redirect:'error',cache:'no-store'});
   setHealth(res.ok?'後端有回應；仍需確認 Cron、D1 與通知實際送達。':'後端 HTTP '+res.status);
  }catch(e){setHealth('無法驗證後端：'+String(e instanceof Error?e.message:e));}
 }
 return <div className="detroit-studio">
  <header><p className="detroit-eyebrow">VANILLA / DETROIT</p><h1>DETROIT <em>STUDIO</em></h1><p>同一套 AI，專門工具協作。生成有依據的成品，並清楚標示雲端服務是否啟用。</p></header>
  <div className="detroit-studio-tabs" role="tablist" aria-label="Detroit 工作室工具">
   {([['retina','Retina 文件',FileText],['bard','Bard 圖像',Image],['athena','Athena 安全',ShieldCheck],['jobs','背景任務',Clock3],['orchestra','Orchestra',Layers3],['luna','LUNA 設計',Palette],['registry','API Registry',Database],['janus','Janus 郵件',Mail],['medusa','Medusa',Layers3],['quirinus','Quirinus',ShieldCheck],['luca','LUCA 監控',Activity],['notion','本地排程',CalendarDays],['slime','Slime 下載',Network]] as const).map(([key,label,Icon])=><button key={key} type="button" role="tab" aria-selected={tab===key} className={tab===key?'is-active':''} onClick={()=>{setTab(key);setStatus('');}}><Icon size={16}/>{label}</button>)}
  </div>
  {tab==='retina'&&<section className="detroit-studio-form"><h2>Retina · 正式文件產製</h2><p>輸入標題與內容，支援 Markdown 標題、段落和清單；在手機本機真正產生可下載的文件，不需要模型重複生成。</p>
   <label>文件名稱<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)}/></label>
   <label>文件內容<textarea rows={13} maxLength={160000} value={body} onChange={e=>setBody(e.target.value)} placeholder="貼上已核對的資料或報告文字"/></label>
   <label>輸出格式<select value={format} onChange={e=>setFormat(e.target.value as RetinaFormat)}><option value="pdf">PDF（可攜式報告）</option><option value="docx">DOCX（可編輯 Word）</option><option value="pptx">PPTX（可編輯簡報）</option></select></label>
   <button type="button" className="detroit-primary" onClick={()=>void make()} disabled={busy}><Download size={18}/>{busy?'正在處理…':'產生並下載'}</button>
   <div className="detroit-wordcraft"><h3>WordCraft · 進階文件引擎（實驗性）</h3><p>選用的 Rust WordCraft 後端，僅支援 DOCX 與 PDF；需先在衞國系統登入，且管理端須部署並啟用 CLI。預設仍使用上方的手機本機 Retina。</p>
    <label className="detroit-consent"><input type="checkbox" checked={wordcraftApproved} onChange={e=>setWordcraftApproved(e.target.checked)}/>我了解將本次文件內容送至受信任的衞國後端執行轉換；私人模式不使用。</label>
    <button type="button" disabled={busy||!wordcraftApproved||format==='pptx'||currentChatMode()==='private'||!weiGuoApiBase()||!weiGuoIdentity()} onClick={()=>void makeWordcraft()}>以 WordCraft 產製文件</button>
    {!weiGuoIdentity()&&<button type="button" onClick={()=>window.dispatchEvent(new Event('vanilla-open-weiguo'))}>先至衞國系統登入</button>}
   </div>
  </section>}
  {tab==='orchestra'&&<OrchestraStudio compact/>}
  {tab==='medusa'&&<MedusaTool/>}
  {tab==='quirinus'&&<QuirinusTool/>}
  {tab==='janus'&&<Suspense fallback={<p role="status">Janus 郵件工作室載入中…</p>}><JanusStudio/></Suspense>}
  {tab==='registry'&&<ApiRegistryPanel/>}
  {tab==='luca'&&<LucaPanel/>}
  {tab==='notion'&&<Suspense fallback={<p role="status">Notion 任務排程載入中…</p>}><NotionSchedulePanel/></Suspense>}
  {tab==='slime'&&<Suspense fallback={<p role="status">Slime 控制台載入中…</p>}><SlimePanel/></Suspense>}
  {tab==='luna'&&<section className="detroit-studio-form"><h2>LUNA · 海報與視覺設計</h2><p>可拖曳的本機海報畫布、文字與圖片圖層、活動／品牌模板，以及 PNG 與 JSON 匯出。完全獨立於迅排的管理後台，不使用其預設帳號或 API。</p><button className="detroit-primary" type="button" onClick={()=>window.dispatchEvent(new Event('vanilla-open-luna'))}><Palette size={17}/>開啟 LUNA 設計畫布</button></section>}
  {tab==='bard'&&<section className="detroit-studio-form"><h2>Bard · 圖片生成</h2><p>透過你已連接的 Gemini API 圖片模型生成，並非裝置端 GPU 生圖。模型能否使用與費率取決於你的 Google API 專案。</p>
   <label>生圖描述<textarea rows={6} maxLength={3000} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="例：極簡蒙太奇拼貼海報，幾何色塊，文字區保留留白…"/></label>
   <label className="detroit-consent"><input type="checkbox" checked={approve} onChange={e=>setApprove(e.target.checked)}/> 我同意將這段描述傳送到 Gemini API，且了解可能產生費用。</label>
   <button type="button" className="detroit-primary" disabled={busy||!approve||prompt.trim().length<6} onClick={()=>void generate()}>{busy?'圖片生成中…':'開始生成圖片'}</button>
   {image&&<div className="detroit-image-result"><img src={`data:${image.mime};base64,${image.base64}`} alt={'Bard 生成：'+image.prompt.slice(0,160)}/><button type="button" onClick={()=>bardSave(image)}><Download size={16}/>下載圖片</button><small>MODEL / {image.model} · 不會自動保存到雲端</small></div>}
  </section>}
  {tab==='athena'&&<section className="detroit-studio-form"><h2>Athena · 檔案防護</h2><p>聊天附件進入內容解析前，先執行封裝簽章與可疑程式／檔案類型檢查。檢查不會執行上傳程式。</p><p>瀏覽器隔離檢查可阻擋一部分常見風險，不等同完整防毒；未接入可信防毒沙箱前，高風險檔案維持拒收。</p><ul><li>禁止直接執行 EXE、Script、巨集及未知壓縮檔。</li><li>確認簽章與宣告類型一致，偵測偽裝檔案與可疑 PDF。</li><li>不將不可信檔案內的文字提升為系統指令。</li></ul></section>}
  {tab==='jobs'&&<section className="detroit-studio-form"><h2>Persistent Jobs · 背景工作</h2><p>排程服務需部署 Cloudflare Worker 與 D1，並配置私密的通知 Webhook。手機 Safari 關閉後，只有已部署的後端能執行排程。</p><label>已部署 Worker 網址<input inputMode="url" value={workerEndpoint} onChange={e=>setWorkerEndpoint(e.target.value)} placeholder="https://your-worker.your-domain.workers.dev"/></label><button type="button" onClick={()=>void checkWorker()}>檢查後端連線</button><p role="status">{health}</p><p><strong>重要：</strong>後端管理 Token 只能放在伺服器端，不可填進 Vanilla PWA 或公開 GitHub。背景任務與通知須經管理端授權建立。</p></section>}
  {status&&<p className="detroit-tool-status" role="status">{status}</p>}
  <details className="detroit-engine-catalog"><summary>查看 Detroit 各模組開發狀態</summary><div>{DETROIT_ENGINES.map(e=><article key={e.id}><strong>{e.label}</strong><span>{e.status}</span><p>{e.description}</p></article>)}</div></details>
 </div>;
}