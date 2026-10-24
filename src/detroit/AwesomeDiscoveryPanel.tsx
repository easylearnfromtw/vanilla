import {useMemo,useState} from "react";
import {ArrowLeft,ArrowUpRight,Clipboard,Download,Search,ShieldCheck} from "lucide-react";
import {currentChatMode} from "../local-ai/chat-session";
import {awesomeIntegrationProposal,loadAwesomeCatalog,loadAwesomeProjects,reviewAwesomeRepo,type AwesomeEntry,type AwesomeReview} from "./awesome-discovery";
import "./awesome-discovery.css";

export default function AwesomeDiscoveryPanel(){
 const [catalog,setCatalog]=useState<AwesomeEntry[]>([]);
 const [projects,setProjects]=useState<AwesomeEntry[]>([]);
 const [selected,setSelected]=useState<AwesomeEntry|null>(null);
 const [review,setReview]=useState<AwesomeReview|null>(null);
 const [query,setQuery]=useState("");
 const [category,setCategory]=useState("全部");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("尚未連接 Awesome 公開索引。");
 const privateMode=currentChatMode()==="private";
 const showing=selected?projects:catalog;
 const categories=useMemo(()=>["全部",...new Set(showing.map(item=>item.category))], [showing]);
 const results=useMemo(()=>{
  const needle=query.toLocaleLowerCase().trim();
  return showing.filter(item=>(category==="全部"||item.category===category)&&(!needle||[item.name,item.description,item.category,item.owner+"/"+item.repo].join(" ").toLocaleLowerCase().includes(needle))).slice(0,75);
 },[showing,category,query]);
 async function loadCatalog(refresh=false){
  if(privateMode)return setNotice("私密模式禁止使用公開 GitHub 查詢；請切換一般模式後主動載入。");
  setBusy(true);setNotice("正在讀取 Awesome 官方清單…");
  try{
   const next=await loadAwesomeCatalog(refresh);
   setCatalog(next);setSelected(null);setProjects([]);setReview(null);setQuery("");setCategory("全部");
   setNotice("已載入 "+next.length+" 筆 Awesome 主題索引；公開來源僅供研究。");
  }catch(e){setNotice("讀取索引失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 async function openTopic(topic:AwesomeEntry){
  if(privateMode)return;
  setBusy(true);setSelected(topic);setProjects([]);setReview(null);setQuery("");setCategory("全部");setNotice("正在閱讀 "+topic.name+" 清單…");
  try{
   const next=await loadAwesomeProjects(topic);
   setProjects(next);
   setNotice(next.length?"已找到 "+next.length+" 筆 GitHub 候選專案，請選擇個別專案評估。":"此清單沒有可自動辨識的 GitHub 專案連結；可開啟原始頁人工查看。");
  }catch(e){setNotice("讀取清單失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 async function inspect(project:AwesomeEntry){
  if(privateMode)return;
  setBusy(true);setReview(null);setNotice("正在核對 GitHub 專案資訊…");
  try{const result=await reviewAwesomeRepo(project);setReview(result);setNotice("已取得公開中繼資料。風險分數僅為篩選提示，不等同漏洞掃描或授權審查。");}
  catch(e){setNotice("評估失敗："+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 }
 function downloadProposal(){
  if(!review)return;
  const proposal=awesomeIntegrationProposal(review);
  const blob=new Blob([proposal],{type:"text/markdown;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="vanilla-integration-"+review.entry.owner+"-"+review.entry.repo+".md";
  a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  setNotice("已輸出無裝飾標記的 Markdown 整合提案；尚未修改或安裝任何外掛。");
 }
 async function copyProposal(){
  if(!review)return;
  try{await navigator.clipboard.writeText(awesomeIntegrationProposal(review));setNotice("整合提案已複製；請貼至 Self-Build 並先審查程式碼。");}
  catch{setNotice("無法存取剪貼簿，請改用下載提案。");}
 }
 return <section className="detroit-studio-form awesome-discovery">
  <div className="awesome-topline"><span>SCOUTS / DIANA / QUIRINUS</span><span>READ ONLY</span></div>
  <h2>Awesome Discovery <span>開源技術探索</span></h2>
  <p>從 <a href="https://github.com/sindresorhus/awesome" target="_blank" rel="noopener noreferrer">sindresorhus/awesome</a> 的主題目錄逐層尋找真實 GitHub 專案，分析維護、授權與整合可行性。清單索引本身不是可以安裝的套件。</p>
  {privateMode?<p role="alert">目前是私密模式：已阻擋外部 GitHub 查詢。</p>:<div className="awesome-toolbar">
   <button type="button" className="detroit-primary" disabled={busy} onClick={()=>void loadCatalog(true)}>{busy?"讀取中…":catalog.length?"更新索引":"載入 Awesome 索引"}</button>
   {selected&&<button type="button" disabled={busy} onClick={()=>{setSelected(null);setReview(null);setQuery("");setCategory("全部");setNotice("已回到主題目錄。");}}><ArrowLeft size={15}/>返回主題</button>}
   {selected&&<a href={selected.url} target="_blank" rel="noopener noreferrer">查看主題原始清單 <ArrowUpRight size={13}/></a>}
  </div>}
  <p className="awesome-status" role="status">{notice}</p>
  {!!catalog.length&&<div className="awesome-filters">
   <label><Search size={16}/>搜尋 {selected?"候選專案":"主題"}<input value={query} onChange={e=>setQuery(e.target.value)} maxLength={100} placeholder={selected?"專案名稱或用途":"AI、安全、Python、UI…"} disabled={busy}/></label>
   <label>分類<select value={category} onChange={e=>setCategory(e.target.value)} disabled={busy}><option value="全部">全部分類</option>{categories.filter(s=>s!=="全部").map(s=><option key={s} value={s}>{s}</option>)}</select></label>
  </div>}
  {!!showing.length&&<><div className="awesome-section-label">{selected?"PROJECTS / "+selected.name:"CURATED TOPICS"} · {results.length} 筆顯示（每頁最多 75 筆）</div>
   <div className="awesome-results">{results.map(item=><article key={item.url}>
    <div><strong>{item.name}</strong><small>{item.category} · {item.owner}/{item.repo}</small></div>
    {item.description&&<p>{item.description}</p>}
    <div className="awesome-item-actions">
     <button type="button" disabled={busy||privateMode} onClick={()=>void (selected?inspect(item):openTopic(item))}>{selected?"評估專案":"查看候選項目"}</button>
     <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={"開啟 "+item.name+" GitHub 原始頁"}>GitHub <ArrowUpRight size={13}/></a>
    </div>
   </article>)}</div></>}
  {review&&<div className="awesome-review">
   <div className="awesome-review-header"><div><span>REPOSITORY REVIEW</span><h3>{review.entry.owner}/{review.entry.repo}</h3></div><strong>{review.score}<small>/100</small></strong></div>
   <p>{review.recommendation}。這是公開中繼資料的初步篩選，非軟體安全認證。</p>
   <dl><div><dt>Stars</dt><dd>{review.stars.toLocaleString("en-US")}</dd></div><div><dt>最近推送</dt><dd>{review.updated?review.updated.slice(0,10):"未知"}</dd></div><div><dt>授權</dt><dd>{review.license}</dd></div></dl>
   {review.warnings.length?<ul>{review.warnings.map(x=><li key={x}>{x}</li>)}</ul>:<p>沒有觸發預設靜態警示；仍須掃描相依套件、檢查 LICENSE/NOTICE 與人工審查。</p>}
   <div className="awesome-review-actions">
    <button type="button" onClick={()=>void copyProposal()}><Clipboard size={15}/>複製整合提案</button>
    <button type="button" onClick={downloadProposal}><Download size={15}/>下載 .md 提案</button>
    <button type="button" onClick={()=>window.dispatchEvent(new Event("vanilla-open-builder"))}><ShieldCheck size={15}/>開啟 Self-Build</button>
   </div>
   <p className="awesome-fineprint">Self-Build 仍須另外配置受保護 Worker、PR 審核與 CI。此處不會自動複製、安裝或執行外部程式碼。</p>
  </div>}
  <p className="awesome-fineprint">可移除自有作品的裝飾性標記；不得移除第三方授權要求的版權聲明、NOTICE 或必要署名。外部 GitHub 請求不攜帶聊天內容、API Key 或 Cookie。</p>
 </section>;
}
