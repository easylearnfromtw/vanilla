import {lazy,Suspense,useCallback,useEffect,useMemo,useState} from "react";
import {Activity,ChevronRight,Computer,Copy,Download,HardDrive,Power,RefreshCw,ShieldCheck,Users,WifiOff,Zap} from "lucide-react";
import {currentChatMode} from "../local-ai/chat-session";
import {weiGuoApiBase,weiGuoIdentity,getSlimeNodes,getSlimeStatus,createSlimeInvite,setSlimeNodeEnabled,revokeSlimeNode,previewSlimeRoute,type SlimeNode} from "../weiguo/api";
import "./slime.css";
const LegacyWindowsNodes=lazy(()=>import("../nodes/NodesPage"));

type OS="windows"|"macos"|"linux";
type Role="owner"|"friend";
type BuildAsset={name:string;browser_download_url:string};
const RELEASE_API="https://api.github.com/repos/easylearnfromtw/vanilla/releases/latest";
const RELEASES="https://github.com/easylearnfromtw/vanilla/releases";
function detectOS():OS{
 const ua=typeof navigator==="undefined"?"":navigator.userAgent.toLowerCase();
 return /windows/.test(ua)?"windows":/macintosh|mac os/.test(ua)?"macos":"linux";
}
function assetFor(assets:BuildAsset[],role:Role,os:OS):BuildAsset|undefined{
 const name=role==="owner"?"Slime-Owner":"Slime-Friend";
 const ending=os==="windows"?".exe":os==="macos"?"-macos.zip":"-linux.tar.gz";
 return assets.find(a=>a.name===name+(os==="windows"?".exe":ending)
   &&/^https:\/\/github\.com\/easylearnfromtw\/vanilla\/releases\/download\//.test(a.browser_download_url));
}

export default function SlimePanel(){
 const [role,setRole]=useState<Role>("owner");
 const [os,setOS]=useState<OS>(detectOS);
 const [assets,setAssets]=useState<BuildAsset[]>([]);
 const [releaseChecked,setReleaseChecked]=useState(false);
 const [nodes,setNodes]=useState<SlimeNode[]>([]);
 const [online,setOnline]=useState(false);
 const [supported,setSupported]=useState(false);
 const [invite,setInvite]=useState("");
 const [notice,setNotice]=useState("");
 const [working,setWorking]=useState("");
 const [route,setRoute]=useState("");
 const identity=weiGuoIdentity();
 const allowed=Boolean(identity&&identity.role==="owner"&&weiGuoApiBase()&&currentChatMode()!=="private");
 const asset=useMemo(()=>assetFor(assets,role,os),[assets,role,os]);
 const refresh=useCallback(async()=>{
   if(!allowed)return;
   try{
     const [s,n]=await Promise.all([getSlimeStatus(),getSlimeNodes()]);
     setSupported(s.ready);setNodes(n.nodes);setOnline(true);setNotice("");
   }catch(err){setOnline(false);setSupported(false);setNotice(String(err instanceof Error?err.message:err));}
 },[allowed]);
 useEffect(()=>{
   void fetch(RELEASE_API,{headers:{Accept:"application/vnd.github+json"}}).then(async r=>{
     if(!r.ok)return;
     const data=await r.json() as {assets?:BuildAsset[]};
     setAssets(Array.isArray(data.assets)?data.assets:[]);
   }).catch(()=>{}).finally(()=>setReleaseChecked(true));
 },[]);
 useEffect(()=>{
   void refresh();
   if(!allowed)return;
   const timer=window.setInterval(()=>void refresh(),30000);
   return()=>window.clearInterval(timer);
 },[refresh,allowed]);
 const doWork=async(id:string,fn:()=>Promise<unknown>)=>{
   setWorking(id);setNotice("");
   try{await fn();await refresh();}
   catch(err){setNotice(String(err instanceof Error?err.message:err));}
   finally{setWorking("");}
 };
 const ready=nodes.filter(n=>n.schedulable).length;
 const seen=nodes.filter(n=>n.online).length;
 return <section className="slime-page" aria-label="Slime 分散式節點管理">
  <div className="slime-hero">
   <div className="slime-overline"><span className="slime-dot"/> VANILLA · DETROIT / SLIME</div>
   <h2>Slime <span>Network</span></h2>
   <p>把自己的電腦與朋友自願分享的閒置裝置，接入同一個資源網路。下載程式、貼上邀請、開啟共享，就能在中央看到連線狀態。</p>
   <div className="slime-hero-status"><ShieldCheck size={15}/> 私有身分驗證 · 可立即退出 · 不會偷偷執行程式</div>
  </div>
  <div className="slime-metrics">
   <div><strong>{allowed&&online?nodes.length:"—"}</strong><span>已註冊節點</span></div>
   <div><strong>{allowed&&online?seen:"—"}</strong><span>目前有心跳</span></div>
   <div><strong>{allowed&&online?ready:"—"}</strong><span>可選擇節點</span></div>
   <div><strong>未啟用</strong><span>跨機模型推論</span></div>
  </div>
  <div className="slime-sections">
   <article className="slime-card">
    <div className="slime-heading"><div><span className="slime-kicker">01 · JOIN</span><h3>下載 Slime</h3></div><Download size={20}/></div>
    <p>朋友不需要建立後端、輸入 API Key 或修改路由器。配對後會顯示硬體資訊，關閉程式即可停止回報。</p>
    <div className="slime-switcher" role="group" aria-label="下載身分">
     <button type="button" className={role==="owner"?"chosen":""} aria-pressed={role==="owner"} onClick={()=>setRole("owner")}><Computer size={16}/> 我的電腦</button>
     <button type="button" className={role==="friend"?"chosen":""} aria-pressed={role==="friend"} onClick={()=>setRole("friend")}><Users size={16}/> 朋友的電腦</button>
    </div>
    <label className="slime-os-label" htmlFor="slime-operating-system">裝置系統</label>
    <select id="slime-operating-system" value={os} onChange={e=>setOS(e.target.value as OS)}>
     <option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux</option>
    </select>
    {asset?<a className="slime-main-action" href={asset.browser_download_url} target="_blank" rel="noopener noreferrer"><Download size={17}/>下載 {role==="owner"?"我的電腦":"朋友版"} Slime <ChevronRight size={16}/></a>:
     <a className="slime-main-action pending" href={RELEASES} target="_blank" rel="noopener noreferrer"><Download size={17}/>{releaseChecked?"查看待發佈的安裝檔":"確認安裝檔狀態"} <ChevronRight size={16}/></a>}
    <small>{asset?"安裝檔由 GitHub Releases 發布；請核對發行版本及簽章。":"目前未確認有對應平台的正式安裝檔。不要將原始 Python 程式誤認為免設定安裝包。"}</small>
    <div className="slime-onboarding">
     <span><strong>1</strong> 下載並啟動</span><span><strong>2</strong> 貼上邀請連結</span><span><strong>3</strong> 同意共享並連線</span>
    </div>
   </article>
   <article className="slime-card">
    <div className="slime-heading"><div><span className="slime-kicker">02 · CONNECT</span><h3>邀請裝置加入</h3></div><Zap size={20}/></div>
    <p>邀請只用一次、10 分鐘內有效。朋友可以自己選擇是否共享，沒有同意就不會加入。</p>
    {!allowed?<div className="slime-empty">
      <ShieldCheck size={23}/><strong>需要衞國家庭 Owner 登入</strong>
      <p>登入後才可產生邀請、查看朋友規格及調整節點。私人模式不連線。</p>
      <button type="button" onClick={()=>window.dispatchEvent(new Event("vanilla-open-weiguo"))}>前往衞國登入</button>
     </div>:<>
       <button type="button" className="slime-secondary" disabled={!supported||Boolean(working)} onClick={()=>void doWork("invite",async()=>{const r=await createSlimeInvite();setInvite(r.link);})}>建立一次性邀請連結</button>
       {invite&&<div className="slime-invite"><input readOnly value={invite} aria-label="Slime 邀請連結"/><button type="button" onClick={()=>void navigator.clipboard.writeText(invite).then(()=>setNotice("邀請連結已複製（10 分鐘內有效）")).catch(()=>setNotice("無法自動複製，請手動選取連結"))}><Copy size={16}/> 複製</button></div>}
       <small>配對連結包含單次有效的秘密，僅透過私人通訊傳給受邀者。中央不會顯示你的朋友的個人檔案。</small>
     </>}
   </article>
  </div>
  <article className="slime-card slime-dashboard">
   <div className="slime-heading">
    <div><span className="slime-kicker">03 · CONTROL</span><h3>中央節點控制台</h3></div>
    <button type="button" aria-label="重新整理 Slime 節點" onClick={()=>void refresh()} disabled={!allowed||Boolean(working)}><RefreshCw size={17}/>重新整理</button>
   </div>
   {notice&&<p className="slime-notice" role="status">{notice}</p>}
   {!allowed?<div className="slime-empty">此頁不會顯示其他使用者的電腦。請先取得家庭擁有者授權。</div>:
   !supported?<div className="slime-empty">Slime 伺服器尚未啟用或無法連線；中央不會偽造節點狀態。</div>:
   nodes.length===0?<div className="slime-empty"><WifiOff size={28}/><strong>還沒有加入的裝置</strong><p>產生邀請後，在自己的電腦或朋友電腦開啟 Slime 即可註冊。</p></div>:
   <div className="slime-nodes">{nodes.map(n=><div className="slime-node" key={n.id}>
    <div className="slime-node-top">
     <div><span className={"slime-online "+(n.online?"is-online":"is-offline")}/><strong>{n.label}</strong><small>{n.role==="owner"?"我的電腦":"朋友的電腦"}</small></div>
     <span className="slime-state">{n.schedulable?"允許派工":n.online?"已暫停":"未連線 · 不可調度"}</span>
    </div>
    <div className="slime-specs"><span><Computer size={14}/> {n.os||"未知系統"}</span><span><HardDrive size={14}/> {n.ram_gb} GB RAM</span><span><Activity size={14}/> CPU {n.cpu} 核心</span><span>{n.gpu||"GPU 未回報"}</span></div>
    <div className="slime-node-bottom">
     <label><input type="checkbox" disabled={Boolean(working)||!n.online} checked={n.owner_enabled} onChange={e=>void doWork(n.id,()=>setSlimeNodeEnabled(n.id,e.target.checked))}/> 允許 Slime 選用</label>
     <button type="button" disabled={Boolean(working)} onClick={()=>{if(window.confirm("確定撤銷 "+n.label+"？這台電腦必須重新接受邀請才能加入。"))void doWork(n.id,()=>revokeSlimeNode(n.id));}}>撤銷配對</button>
    </div>
   </div>)}</div>}
   <p className="slime-fine"><Power size={15}/> 「未連線」只代表沒有心跳，無法判定真正關機或被刪除；150 秒後自動不再納入派工。遠端關機、螢幕關閉與 Wake-on-LAN 尚未啟用，需要硬體支援及該電腦所有者另行同意。</p>
   <div className="slime-route">
    <div><strong>AI 自動調度 · 資源預覽</strong><p>已建立選節點資格檢查；尚未讓 AI 在朋友電腦上執行模型或工具。</p></div>
    <button type="button" disabled={!supported||!allowed||Boolean(working)} onClick={()=>void doWork("route",async()=>{const r=await previewSlimeRoute("model-shard",4);setRoute(r.candidate_nodes.length?"目前符合記憶體條件的節點："+r.candidate_nodes.map(n=>n.label).join("、")+"；未執行推論":"目前沒有符合條件且在線的節點。";})}>查看可用節點</button>
    {route&&<small role="status">{route}</small>}
   </div>
  </article>
 </section>;
