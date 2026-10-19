import {useCallback,useEffect,useState} from "react";
import {Blocks,Code2,Download,RefreshCw,Upload,BookOpen,Trash2,Globe,GitBranch,Database,Play} from "lucide-react";
import {listOwnedPublicRepos,listRepoFiles,indexRepoSubset,inspectAPIPublicGET,
 type GitHubOwnedRepo,type GitHubFile} from "./github-projects";
import {listProjectCorpora,putProjectCorpus,deleteProjectCorpus,importUploadedCode,saveProjectAPI,listProjectAPIs} from "./project-store";
import {validateOpenAPI,type APIDefinition,type ProjectCorpus} from "./project-core";
import {projectCodeTrainingJSONL} from "./training-export";
import {parseCreamCSV,fromCreamRows} from "../cream/core";
import {persistCreamDataset} from "../cream/history-store";
import {attachmentOwner} from "../library/attachment-vault";
import {signedChatAccount} from "../vault/chat-sync";
import "./project-hub.css";
function parseAPIData(text:string,source:string){
 let json:unknown;try{json=JSON.parse(text);}catch{throw Error("回傳不是 JSON 表格；已讀取但不會假造 CREAM 數值");}
 const obj=(json&&typeof json==="object"?json:null) as Record<string,unknown>|null;
 const list=Array.isArray(json)?json:Array.isArray(obj?.data)?obj.data:Array.isArray(obj?.results)?obj.results:Array.isArray(obj?.items)?obj.items:null;
 if(!list||!list.length)throw Error("API 回應沒有可使用的 JSON 物件陣列；無法自動繪製表格");
 const objects=list.slice(0,3000).filter(x=>x&&typeof x==="object"&&!Array.isArray(x)) as Record<string,unknown>[];
 if(!objects.length)throw Error("JSON 陣列不是可分析的物件");
 const keys=Object.keys(objects[0]).filter(k=>objects.every(o=>{
  const v=o[k];return v==null||typeof v==="string"||typeof v==="number"||typeof v==="boolean";
 })).slice(0,12);
 if(keys.length<2)throw Error("資料缺少至少兩個可分析欄位");
 const rows=[keys,...objects.map(o=>keys.map(k=>o[k]==null?"":String(o[k])))];
 return fromCreamRows(rows,source);
}
export default function ProjectHub(){
 const owner=attachmentOwner(signedChatAccount());
 const [repos,setRepos]=useState<GitHubOwnedRepo[]>([]),[selected,setSelected]=useState(""),[repoFiles,setRepoFiles]=useState<GitHubFile[]>([]);
 const [selectedPaths,setSelectedPaths]=useState<string[]>([]),[corpora,setCorpora]=useState<ProjectCorpus[]>([]),[apis,setApis]=useState<APIDefinition[]>([]);
 const [notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[progress,setProgress]=useState("");
 const [apiText,setApiText]=useState(""),[apiEndpoint,setApiEndpoint]=useState("");
 const [selectedAPI,setSelectedAPI]=useState("");
 const refresh=useCallback(async()=>{
  try{const [r,a]=await Promise.all([listProjectCorpora(owner),listProjectAPIs(owner)]);setCorpora(r);setApis(a);}
  catch(e){setNotice("專案資料庫讀取失敗："+String(e));}
 },[owner]);
 useEffect(()=>{void refresh();const handler=()=>void refresh();window.addEventListener("vanilla-project-hub-updated",handler);
  return()=>window.removeEventListener("vanilla-project-hub-updated",handler);
 },[refresh]);
 async function fetchRepos(){
  setBusy(true);setNotice("");
  try{const list=await listOwnedPublicRepos();setRepos(list);setNotice("已從 GitHub 實際取得 "+list.length+" 個公開專案；未列出的私人 Repo 不能冒稱已讀取。");}
  catch(e){setNotice("無法從 GitHub 取得專案："+String(e));}finally{setBusy(false);}
 }
 async function openRepo(repo:string){
  setSelected(repo);setRepoFiles([]);setSelectedPaths([]);setBusy(true);
  try{
   const branch=repos.find(x=>x.full_name===repo)?.default_branch||"main";
   const files=await listRepoFiles(repo,branch);setRepoFiles(files);
   setNotice("已讀取 "+repo+" 的實際檔案樹。請選擇要加入 Vanilla 知識庫的程式碼。");
  }catch(e){setNotice("無法讀取專案目錄："+String(e));}finally{setBusy(false);}
 }
 async function readSelected(){
  if(!selected||!selectedPaths.length)return;
  setBusy(true);setNotice("正在讀取 GitHub 原始碼…");
  try{
   const branch=repos.find(x=>x.full_name===selected)?.default_branch||"main";
   const result=await indexRepoSubset(selected,repoFiles.filter(f=>selectedPaths.includes(f.path)),owner,branch);
   await putProjectCorpus(result);await refresh();
   setNotice("已真正讀取並索引 "+result.files.length+" 個 "+selected+" 檔案，可在 Vanilla 對話中引用並提供 Self-Build 修改依據。"+
    (result.warnings.length?"\n部分來源無法讀取："+result.warnings.join("；"):""));
  }catch(e){setNotice("專案索引失敗："+String(e));}finally{setBusy(false);}
 }
 function chooseFiles(filenames:string[]){
  setSelectedPaths(filenames.filter(s=>repoFiles.some(f=>f.path===s)).slice(0,12));
 }
 async function batchIndex(){
  const available=repos.length?repos:await listOwnedPublicRepos();
  if(!repos.length)setRepos(available);
  setBusy(true);let n=0,failed=0;const errors:string[]=[];
  for(const repo of available){
   try{
    setProgress("正在處理 "+(n+failed+1)+"/"+available.length+"："+repo.full_name);
    const files=await listRepoFiles(repo.full_name,repo.default_branch);
    const preferred=[...files].sort((a,b)=>{
     const rank=(path:string)=>/README\.md$/i.test(path)?0:/src\/.*(?:index|main|App|core)\.(?:tsx?|jsx?)$/i.test(path)?1:
      /index\.html$/i.test(path)?2:/package\.json$/i.test(path)?3:4;
     return rank(a.path)-rank(b.path)||a.size-b.size;
    }).slice(0,2);
    if(!preferred.length){failed++;errors.push(repo.name+"：沒有適用的可讀檔案");continue;}
    const result=await indexRepoSubset(repo.full_name,preferred,owner,repo.default_branch);
    await putProjectCorpus(result);n++;
   }catch(e){
    failed++;errors.push(repo.name+"："+String(e));
    if(/HTTP 403|rate limit/i.test(String(e)))break;
   }
  }
  setBusy(false);setProgress("");await refresh();
  setNotice("全專案索引執行完成，實際成功 "+n+" 個、未成功 "+failed+" 個。"+
   (errors.length?"\n"+errors.slice(0,4).join("\n"):"")+
   "。GitHub 公開 API 有配額限制，私人專案不在此流程中。");
 }
 async function importFiles(files:FileList|null){
  if(!files?.length)return;
  setBusy(true);try{
   const list=Array.from(files);
   const openapis=list.filter(x=>/\.json$/i.test(x.name)&&/api|openapi|swagger/i.test(x.name));
   const scripts=list.filter(x=>!openapis.includes(x));
   const saved:string[]=[];
   for(const file of openapis){
    const spec=validateOpenAPI(JSON.parse(await file.text()),file.name);
    await saveProjectAPI(owner,spec);saved.push(spec.name+"（OpenAPI）");
   }
   if(scripts.length){
    const data=await importUploadedCode(scripts,owner);await putProjectCorpus(data);
    saved.push(scripts.length+" 個本機程式碼檔");
   }
   await refresh();setNotice("已儲存："+saved.join("、")+"。程式碼只建立檢索索引，不會在你的瀏覽器任意執行。");
  }catch(e){setNotice("檔案匯入失敗："+String(e));}finally{setBusy(false);}
 }
 async function importAPISpec(){
  if(!apiText.trim())return;setBusy(true);
  try{const definition=validateOpenAPI(JSON.parse(apiText),"聊天貼上的 OpenAPI");await saveProjectAPI(owner,definition);await refresh();setApiText("");
   setNotice("API 定義已加入個人專案庫；只會主動測試公開 GET，不會自動執行寫入、刪除或付款請求。");}
  catch(e){setNotice("OpenAPI 解析失敗："+String(e));}finally{setBusy(false);}
 }
 async function callSelectedAPI(){
  const [origin,path]=apiEndpoint.split("||"),definition=apis.find(x=>x.origin===origin);
  if(!definition||!path)return;
  setBusy(true);setNotice("正在實際執行唯讀 GET…");
  try{
   const raw=await inspectAPIPublicGET(definition,path);
   try{
    const dataset=parseAPIData(raw.content,raw.url);
    const stored=await persistCreamDataset(dataset,owner);
    setNotice("成功呼叫真實 API："+raw.url+"；並把 "+stored.snapshot.observations.length+
     " 筆日期／數值觀察加入 CREAM 長期追蹤。"+
      stored.snapshot.warnings.map(x=>" "+x).join(""));
   }catch{
    setNotice("GET 已成功，回傳內容不是可追蹤的日期＋數值表格，未虛構 CREAM 記錄。\n網址："+raw.url+
     "\n前 800 字元："+raw.content.slice(0,800));
   }
  }catch(e){setNotice("API 實際讀取失敗："+String(e)+"。若需要權杖或有 CORS 限制，須使用受保護 Adapter 後端。");}
  finally{setBusy(false);}
 }
 function startIntegration(repo:string){
  const data=corpora.find(x=>x.repo===repo);
  const names=data?.files.map(f=>f.path).slice(0,7).join("、")||"";
  const idea="分析並整合 "+repo+" 的實際功能至 Vanilla；已索引的原始碼檔案有："+names+
   "。先檢查 API、授權、依賴和測試，再於保護分支建立可審核的最小整合 PR；不得直接執行不可信程式碼。";
  window.dispatchEvent(new CustomEvent("vanilla-open-builder",{detail:{idea,mode:"code"}}));
 }
 function downloadTraining(split:"train"|"eval"){
  const text=projectCodeTrainingJSONL(corpora,split);
  if(!text.trim()){setNotice("此分組沒有足夠原始碼案例；請先從更多自己擁有的程式檔建立索引。");return;}
  const uri=URL.createObjectURL(new Blob([text],{type:"application/x-ndjson;charset=utf-8"}));
  const a=document.createElement("a");a.href=uri;a.download="Vanilla_Projects_Code_SFT_"+split+".jsonl";a.click();
  setTimeout(()=>URL.revokeObjectURL(uri),1000);
  setNotice("已匯出 "+split+" 程式碼續寫 SFT 樣本。需在受控 GPU 上微調並與未訓練模型比較，不會自動覆蓋任何模型權重。");
 }
 function downloadCorpus(){
  const payload=corpora.map(x=>({repo:x.repo,source:x.source,updatedAt:x.updatedAt,files:x.files.map(f=>({path:f.path,functions:f.functions,excerpt:f.excerpt,url:f.url}))}));
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="Vanilla_Projects_RAG.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="project-hub">
  <div className="project-hub-title"><div><small>VANILLA / PROJECT INTELLIGENCE</small><h2>PROJECT HUB</h2><p>把你自己的程式碼、功能與 API 統一成 Vanilla 可檢索的知識資產，再透過 Self-Build 轉成可審核的程式修改。</p></div><Blocks size={29}/></div>
  <div className="project-hub-stats"><div><strong>{corpora.length}</strong><small>已索引專案</small></div><div><strong>{corpora.reduce((n,x)=>n+x.files.length,0)}</strong><small>已讀原始碼檔案</small></div><div><strong>{apis.length}</strong><small>已登錄 API</small></div></div>
  <div className="project-hub-columns">
   <div className="project-hub-left">
    <section className="project-hub-panel">
     <div className="project-hub-heading"><GitBranch size={16}/><strong>GitHub 專案庫</strong></div>
     <p>公開儲存庫可直接唯讀索引，包含 CITYMUS 相關專案。未找到與「稜角」名稱一致的 Repo 時，請從實際清單選取或直接上傳檔案。</p>
     <div className="project-hub-actions"><button type="button" disabled={busy} onClick={()=>void fetchRepos()}><RefreshCw size={14}/>取得我的 GitHub 專案</button>
      <button type="button" disabled={busy} onClick={()=>void batchIndex()}><Database size={14}/>索引全部公開專案</button></div>
     {progress&&<p role="status" className="project-hub-progress">{progress}</p>}
     {!!repos.length&&<div className="project-hub-repos">{repos.map(repo=><button type="button" key={repo.full_name}
      className={selected===repo.full_name?"active":""} disabled={busy} onClick={()=>void openRepo(repo.full_name)}>
      <Code2 size={14}/><span>{repo.name}</span><small>{repo.description||"GitHub"}</small></button>)}</div>}
     {!!repoFiles.length&&<div className="project-hub-files"><strong>{selected} · 選取原始碼（最多 12 個）</strong>
      {repoFiles.slice(0,70).map(file=><label key={file.path}><input type="checkbox" checked={selectedPaths.includes(file.path)} disabled={busy||(!selectedPaths.includes(file.path)&&selectedPaths.length>=12)}
       onChange={e=>chooseFiles(e.target.checked?[...selectedPaths,file.path]:selectedPaths.filter(x=>x!==file.path))}/>{file.path}<small>{(file.size/1024).toFixed(0)} KB</small></label>)}
      <button type="button" disabled={busy||!selectedPaths.length} onClick={()=>void readSelected()}>讀取選取原始碼並建立知識索引</button>
     </div>}
    </section>
    <section className="project-hub-panel"><div className="project-hub-heading"><Upload size={16}/><strong>直接丟程式／API</strong></div>
     <p>支援程式原始碼、README、設定文件，以及 OpenAPI 3.x JSON；保存可分析索引。任意上傳的 JavaScript／Python 不會直接在 iPhone 上執行。</p>
     <label className="project-hub-upload">上傳程式碼、OpenAPI 文件<input type="file" multiple accept=".ts,.tsx,.js,.jsx,.html,.css,.py,.md,.json,.yaml,.yml,.txt,.sql,.vue,.svelte" disabled={busy}
      onChange={e=>{void importFiles(e.target.files);e.target.value="";}}/></label>
     <details><summary>或貼上 OpenAPI 3.x JSON</summary><textarea rows={5} value={apiText} onChange={e=>setApiText(e.target.value)} placeholder='{"openapi":"3.0.3","info":{"title":"My API"},"servers":[{"url":"https://api.example.com"}],"paths":{"/metrics":{"get":{"summary":"Metrics"}}}}'/>
      <button disabled={busy||!apiText.trim()} type="button" onClick={()=>void importAPISpec()}>解析並加入 API</button></details>
    </section>
   </div>
   <div className="project-hub-right">
    <section className="project-hub-panel"><div className="project-hub-heading"><BookOpen size={16}/><strong>可供 Vanilla 檢索的專案知識</strong></div>
     {corpora.length?corpora.map(x=><div key={x.id} className="project-hub-corpus">
       <div><strong>{x.repo}</strong><small>{x.files.length} 份程式碼 · {x.updatedAt.slice(0,10)} · {x.source==="github"?"GitHub 原始檔案":"本機上傳"}</small></div>
       <div className="project-hub-actions"><button type="button" title="要求 Vanilla 整合此專案" onClick={()=>startIntegration(x.repo)}><Play size={13}/>整合功能</button>
        <button type="button" title="移除索引" onClick={()=>void deleteProjectCorpus(owner,x.repo).catch(e=>setNotice(String(e)))}><Trash2 size={13}/></button></div>
       <details><summary>查看已讀程式功能與來源</summary>{x.files.map(f=><div key={f.path} className="project-hub-code">
         <strong>{f.path}</strong><span>{f.functions.slice(0,12).join(" · ")||"未發現可識別的具名函式"}</span>
         {f.url&&<a href={f.url} target="_blank" rel="noopener noreferrer">原始 GitHub 檔案 ↗</a>}
         <pre>{f.excerpt.slice(0,1400)}</pre></div>)}</details>
      </div>):<p>尚無程式碼知識；讀取專案後，聊天中的專案問題便可引用已建立索引的原始碼。</p>}
     <button type="button" disabled={!corpora.length} onClick={downloadCorpus}><Download size={13}/>匯出專案 RAG 資料（非模型權重）</button>
     <div className="project-hub-actions"><button type="button" disabled={!corpora.length} onClick={()=>downloadTraining("train")}><Download size={13}/>程式學習 SFT · train</button>
     <button type="button" disabled={!corpora.length} onClick={()=>downloadTraining("eval")}><Download size={13}/>SFT · eval</button></div>
    </section>
    <section className="project-hub-panel"><div className="project-hub-heading"><Globe size={16}/><strong>外部 API → CREAM</strong></div>
     <p>只會對你載入的 OpenAPI 中已宣告的公開 GET 路徑送出真實唯讀請求；權杖型 API 需要受保護的後端。</p>
     {!!apis.length?<><select aria-label="選取唯讀 API" value={selectedAPI} onChange={e=>{setSelectedAPI(e.target.value);setApiEndpoint(e.target.value);}}>
       <option value="">選取 API 端點</option>{apis.flatMap(api=>api.paths.map(p=><option key={api.origin+"||"+p.path} value={api.origin+"||"+p.path}>{api.name} · GET {p.path}</option>))}</select>
      <button type="button" disabled={busy||!apiEndpoint} onClick={()=>void callSelectedAPI()}><Play size={13}/>實際讀取並送入 CREAM</button>
     </>:<p>匯入 OpenAPI 文件後顯示可測試的唯讀端點。</p>}
    </section>
   </div>
  </div>
  {notice&&<p className="project-hub-notice" role="status">{notice}</p>}
  <p className="project-hub-footnote">PROJECT HUB 的「學習」代表可以引用已索引原始碼；更新模型權重仍需另行產生經審核的訓練資料並在 GPU 微調。將現有專案真正加入 Vanilla 執行功能，須使用 Self-Build GitHub PR + CI 驗證。</p>
 </section>;
}
