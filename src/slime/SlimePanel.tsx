import {useEffect,useMemo,useState} from "react";
import {ArrowUpRight,Check,ChevronRight,Computer,Copy,Download,HelpCircle,Monitor,ShieldCheck,Smartphone,Users} from "lucide-react";
import "./slime.css";

type OS="windows"|"macos"|"linux"|"mobile";
type Role="owner"|"friend";
type Asset={name:string;browser_download_url:string;size:number;digest?:string};
type GitHubRelease={tag_name:string;html_url:string;published_at:string;assets:Asset[];draft?:boolean;prerelease?:boolean};
type ReleaseStatus="loading"|"ready"|"missing"|"error";
const RELEASE_API="https://api.github.com/repos/easylearnfromtw/vanilla/releases?per_page=20";
const RELEASES="https://github.com/easylearnfromtw/vanilla/releases";
function detectOS():OS{
 const ua=typeof navigator==="undefined"?"":navigator.userAgent.toLowerCase();
 if(/iphone|ipad|ipod|android|mobile/.test(ua))return "mobile";
 if(/windows/.test(ua))return "windows";
 if(/macintosh|mac os/.test(ua))return "macos";
 if(/linux|x11/.test(ua))return "linux";
 return "mobile";
}
function trustedAsset(release:GitHubRelease|undefined,role:Role,os:OS):Asset|undefined{
 if(!release||os==="mobile"||release.draft||release.prerelease||!/^slime-v[\w.-]+$/.test(release.tag_name))return;
 const prefix=role==="owner"?"Slime-Owner":"Slime-Friend";
 const suffix=os==="windows"?".exe":os==="macos"?"-macos.zip":"-linux.tar.gz";
 return release.assets.find(a=>a.name===prefix+suffix&&a.size>0&&
  a.browser_download_url.startsWith("https://github.com/easylearnfromtw/vanilla/releases/download/"+release.tag_name+"/"));
}
function inviteFromURL():string|null{
 if(typeof window==="undefined")return null;
 const code=window.location.hash.match(/^#slime=((?:[A-Za-z0-9_-]{24,160}|[A-Za-z0-9]{4}(?:-[A-Za-z0-9]{4}){2}))$/)?.[1];
 return code?window.location.origin+window.location.pathname+window.location.search+"#slime="+code:null;
}
const LABELS:Record<Exclude<OS,"mobile">,string>={windows:"Windows",macos:"macOS",linux:"Linux"};
/** Vanilla public surface: verified download + consent onboarding only.
 * Privileged node controls and service secrets stay in Telegram.
 */
export default function SlimePanel(){
 const [role,setRole]=useState<Role>("owner");
 const [os,setOS]=useState<OS>(detectOS);
 const [release,setRelease]=useState<GitHubRelease|undefined>();
 const [status,setStatus]=useState<ReleaseStatus>("loading");
 const [invite,setInvite]=useState<string|null>(inviteFromURL);
 const [copyResult,setCopyResult]=useState("");
 const [showTroubleshooting,setShowTroubleshooting]=useState(false);
 const pairCode=useMemo(()=>{
  if(!invite)return null;
  const token=invite.match(/#slime=([^#&?]+)$/)?.[1]??"";
  return /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/.test(token)?token:null;
 },[invite]);
 const asset=useMemo(()=>trustedAsset(release,role,os),[release,role,os]);
 useEffect(()=>{
  // Never leave one-time invitation secrets in URL history/address bar.
  if(invite&&window.location.hash.startsWith("#slime=")){
   window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);
   setRole("friend");
  }
 },[invite]);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(RELEASE_API,{headers:{Accept:"application/vnd.github+json"},signal:controller.signal})
   .then(async response=>{
    if(response.status===404){setStatus("missing");return;}
    if(!response.ok)throw Error("GitHub Releases 無法取得");
    const data=await response.json() as GitHubRelease[];
    const found=Array.isArray(data)?data.find(item=>item&&Array.isArray(item.assets)
      &&/^slime-v[\w.-]+$/.test(item.tag_name)&&!item.draft&&!item.prerelease):undefined;
    if(!found){setStatus("missing");return;}
    setRelease(found);setStatus("ready");
   }).catch(e=>{if((e as Error)?.name!=="AbortError")setStatus("error");});
  return()=>controller.abort();
 },[]);
 async function copyInvite(){
  if(!invite)return;
  try{await navigator.clipboard.writeText(invite);setCopyResult("邀請已複製；請只傳給同意安裝的裝置使用者");}
  catch{setCopyResult("複製失敗，請從 Telegram 重新取得邀請連結");}
 }
 async function copyPairCode(){
  if(!pairCode)return;
  try{await navigator.clipboard.writeText(pairCode);
      setCopyResult("短配對碼已複製；請在 Slime 安裝程式中輸入。");}
  catch{setCopyResult("複製失敗；請手動記下上方 12 位短配對碼。");}
 }
 const platform=os==="mobile"?"此裝置不支援執行節點":LABELS[os];
 const available=status==="ready"&&Boolean(asset);
 return <section className="slime-page" aria-label="Slime 電腦節點下載">
  <header className="slime-hero">
   <div className="slime-overline"><span className="slime-dot"/> VANILLA / SLIME NETWORK</div>
   <h2>讓你的電腦<br/><span>成為 AI 節點。</span></h2>
   <p>下載、配對、上線。電腦只會在取得裝置持有人同意後加入 Vanilla，並由 Telegram Owner 決定是否允許模型推論。</p>
   <div className="slime-hero-status"><ShieldCheck size={16}/> 只向 WeiGuo 主動連線 · 不開放本地 Ollama 連接埠</div>
  </header>
  {invite&&<article className="slime-card slime-invite-ready">
   <div className="slime-heading"><div><span className="slime-kicker">INVITE DETECTED</span><h3>收到 Slime 一次性邀請</h3></div><LockKeyhole size={20}/></div>
   <p>此邀請僅保留在當次頁面，已從網址列移除。新電腦第一次開啟 Slime 時輸入配對碼即可。10 分鐘有效，使用一次後失效。</p>
   {pairCode&&<div className="slime-short-code" aria-label="本次 Slime 節點配對碼">
    <span>一次性節點配對碼</span><strong>{pairCode}</strong>
    <small>每 4 位分組 · 使用後自動作廢</small>
   </div>}
   {pairCode&&<button className="slime-main-action" type="button" onClick={()=>void copyPairCode()}><Copy size={16}/> 複製配對碼 <ChevronRight size={16}/></button>}
   <button className="slime-outline-action" type="button" onClick={()=>void copyInvite()}><Copy size={16}/> 複製備用邀請連結</button>
   <small role="status" aria-live="polite">{copyResult||"不要公開此連結，也不要將邀請碼貼到客服或社群。"}</small>
  </article>}
  <article className="slime-card">
   <div className="slime-heading"><div><span className="slime-kicker">STEP 01 · DOWNLOAD</span><h3>下載你的 Slime</h3></div><Download size={20}/></div>
   <div className="slime-switcher" role="group" aria-label="下載身分">
    <button type="button" className={role==="owner"?"chosen":""} aria-pressed={role==="owner"} onClick={()=>setRole("owner")}><Computer size={17}/> 我的電腦</button>
    <button type="button" className={role==="friend"?"chosen":""} aria-pressed={role==="friend"} onClick={()=>setRole("friend")}><Users size={17}/> 朋友的電腦</button>
   </div>
   <div className="slime-os-label">選擇要執行 Slime 的電腦系統</div>
   <div className="slime-platforms" role="group" aria-label="選擇作業系統">
    {(["windows","macos","linux"] as const).map(item=><button key={item} type="button" className={os===item?"chosen":""} aria-pressed={os===item} onClick={()=>setOS(item)}>{LABELS[item]}</button>)}
   </div>
   {os==="mobile"&&<div className="slime-support-note"><Smartphone size={18}/><span>你目前使用手機或無法辨識的裝置。Slime Runner 需要 Windows、macOS 或 Linux 電腦，請選擇電腦作業系統後將下載頁傳給該電腦。</span></div>}
   <div className="slime-download-meta"><span>{status==="loading"?"正在核對官方發行版本":status==="error"?"無法取得 GitHub Releases 狀態":status==="missing"?"目前沒有正式 Slime 發行版":release?.tag_name||"版本待確認"}</span><small>{platform}</small></div>
   {available&&asset?
    <a className="slime-main-action" href={asset.browser_download_url} target="_blank" rel="noopener noreferrer"><Download size={18}/>下載 {role==="owner"?"Owner":"Friend"} {LABELS[os as Exclude<OS,"mobile">]} 版本<ChevronRight size={17}/></a>:
    <a className="slime-main-action pending" href={RELEASES} target="_blank" rel="noopener noreferrer"><ArrowUpRight size={17}/>{status==="loading"?"查看發行檔狀態":"前往官方 Releases 查看"}<ChevronRight size={17}/></a>}
   <small>{asset&&available
    ?"官方 GitHub 發行檔。Windows 提供獨立 .exe；macOS／Linux 壓縮包需要 Python 3。所有檔案都需先驗證來源，尚未提供數位程式碼簽章。"
    :"尚未找到本次選擇的正式安裝檔，不會以其他系統版本或舊版檔案冒充可下載。可先閱讀安裝步驟。"}</small>
   {asset?.digest?.startsWith("sha256:")&&<code className="slime-checksum">SHA-256 {asset.digest.slice(7)}</code>}
   {release&&<a className="slime-subtle-link" href={release.html_url.startsWith(RELEASES+"/tag/")?release.html_url:RELEASES} target="_blank" rel="noopener noreferrer">查看發行說明、SHA256SUMS 與版本來源 <ArrowUpRight size={13}/></a>}
  </article>
  <article className="slime-card">
   <div className="slime-heading"><div><span className="slime-kicker">STEP 02–04 · CONNECT</span><h3>首次執行與配對</h3></div><Monitor size={19}/></div>
   <ol className="slime-steps">
    <li><span className="slime-step-number">01</span><div><strong>開啟安裝檔</strong><p>Windows 雙擊 Slime 程式；macOS 解壓後開啟對應 .command，Linux 解壓後執行 start-slime.sh。不要執行來源不明的同名檔案。</p></div></li>
    <li><span className="slime-step-number">02</span><div><strong>輸入一次性短配對碼</strong><p>由 管理者私人的 Ceres 控制介面 的 Owner 私聊產生配對碼，將短碼交給要加入的電腦使用者。首次配對時填寫電腦名稱並同意共享。</p></div></li>
    <li><span className="slime-step-number">03</span><div><strong>確認節點上線</strong><p>裝置會安全儲存專用 Token，以 HTTPS 回報心跳。Owner 在 Telegram 的 /hub → Slime 節點核對裝置；重開程式會連回相同節點，不需重新索取邀請。</p></div></li>
    <li><span className="slime-step-number">04</span><div><strong>需要 AI 推論時才核准</strong><p>安裝並啟動本機 Ollama；Owner 另外同意推論後，才允許外部 Vanilla API 模型任務傳入此電腦。一般節點心跳不等於開放模型。</p></div></li>
   </ol>
  </article>
  <article className="slime-card">
   <div className="slime-heading"><div><span className="slime-kicker">PRIVACY · CONTROL</span><h3>隨時停止與退出</h3></div><ShieldCheck size={19}/></div>
   <p>關閉程式或 Ctrl+C 可停止回報與新工作；節點稍後會顯示離線。需要永久解除配對時，使用桌面程式的 <code>--leave</code> 指令，由後端撤銷憑證。</p>
   <p>朋友版不取得 Telegram 管理權限。只有裝置主人保持執行，且 Owner 明確核准推論時，Slime 才會處理模型任務；請勿用於未經同意的電腦。</p>
   <button className="slime-help-toggle" type="button" aria-expanded={showTroubleshooting} onClick={()=>setShowTroubleshooting(!showTroubleshooting)}><HelpCircle size={16}/> 常見安裝與連線問題 <ChevronRight size={16}/></button>
   {showTroubleshooting&&<div className="slime-troubleshoot">
    <p><strong>下載按鈕沒有檔案？</strong> 尚未正式發佈對應版本。請查看 Releases；不可把未經驗證的建置檔當成正式安裝包。</p>
    <p><strong>Windows 安全警告？</strong> 此版本尚未簽署程式碼。請先確認 GitHub 發行來源與 SHA-256，不應關閉防毒或繞過裝置保護。</p>
    <p><strong>顯示無法連線？</strong> 確認網路、WeiGuo HTTPS 服務及一次性邀請是否過期。重新打開已配對的程式不需再貼邀請。</p>
    <p><strong>節點在線卻不能用模型？</strong> 確認 Ollama 已安裝並有本地模型，且 Telegram Owner 已核准該節點推論。Vanilla 對外模型 API 未正式開啟時仍會拒絕外部推論。</p>
    <p><strong>想移除節點？</strong> 在該電腦執行 Slime 的 <code>--leave</code>，或請 Owner 於 Telegram 撤銷節點；請勿僅刪除本機 Token 造成失聯殘留。</p>
   </div>}
  </article>
 </section>;
}
