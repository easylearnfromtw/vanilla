import {useEffect,useMemo,useState} from "react";
import {ChevronRight,Computer,Download,ShieldCheck,Users} from "lucide-react";
import "./slime.css";

type OS="windows"|"macos"|"linux";
type Role="owner"|"friend";
type BuildAsset={name:string;browser_download_url:string};
const RELEASE_API="https://api.github.com/repos/easylearnfromtw/vanilla/releases?per_page=20";
const RELEASES="https://github.com/easylearnfromtw/vanilla/releases";
function detectOS():OS{
 const ua=typeof navigator==="undefined"?"":navigator.userAgent.toLowerCase();
 return /windows/.test(ua)?"windows":/macintosh|mac os/.test(ua)?"macos":"linux";
}
function assetFor(assets:BuildAsset[],role:Role,os:OS):BuildAsset|undefined{
 const name=role==="owner"?"Slime-Owner":"Slime-Friend";
 const ending=os==="windows"?".exe":os==="macos"?"-macos.zip":"-linux.tar.gz";
 return assets.find(a=>a.name===name+ending
  &&/^https:\/\/github\.com\/easylearnfromtw\/vanilla\/releases\/download\//.test(a.browser_download_url));
}

/** Slime's only PWA surface: binaries + installation and consent guidance.
 * Every admin setting has moved to owner-verified private Ceres Telegram.
 */
export default function SlimePanel(){
 const [role,setRole]=useState<Role>("owner");
 const [os,setOS]=useState<OS>(detectOS);
 const [assets,setAssets]=useState<BuildAsset[]>([]);
 const [releaseChecked,setReleaseChecked]=useState(false);
 const asset=useMemo(()=>assetFor(assets,role,os),[assets,role,os]);
 useEffect(()=>{
  let active=true;
  void fetch(RELEASE_API,{headers:{Accept:"application/vnd.github+json"}})
   .then(async r=>{if(!r.ok)return [];const data=await r.json() as Array<{assets?:BuildAsset[]}>;
    return Array.isArray(data)?data.flatMap(item=>Array.isArray(item.assets)?item.assets:[]):[];})
   .then(found=>{if(active)setAssets(found);})
   .catch(()=>{}).finally(()=>{if(active)setReleaseChecked(true);});
  return()=>{active=false;};
 },[]);
 return <section className="slime-page" aria-label="Slime 電腦節點下載">
  <div className="slime-hero">
   <div className="slime-overline"><span className="slime-dot"/> VANILLA · DETROIT / SLIME</div>
   <h2>Slime <span>Downloads</span></h2>
   <p>讓自己的電腦或經朋友同意的閒置裝置加入 Vanilla 節點網路。本頁只提供下載和安裝說明；邀請、管理及權限設定全部改由擁有者私人 Telegram 對話完成。</p>
   <div className="slime-hero-status"><ShieldCheck size={15}/> 自願配對 · 不取得桌面與個人檔案 · 隨時退出</div>
  </div>
  <article className="slime-card">
   <div className="slime-heading"><div><span className="slime-kicker">DOWNLOAD · 下載</span><h3>選擇電腦與系統</h3></div><Download size={20}/></div>
   <p>依照使用者身分選擇程式。朋友只需取得管理員私下發送的一次性邀請連結，不需要 Vanilla 管理員權限、API Key 或電腦遠端桌面權限。</p>
   <div className="slime-switcher" role="group" aria-label="下載身分">
    <button type="button" className={role==="owner"?"chosen":""} aria-pressed={role==="owner"} onClick={()=>setRole("owner")}><Computer size={16}/> 我的電腦</button>
    <button type="button" className={role==="friend"?"chosen":""} aria-pressed={role==="friend"} onClick={()=>setRole("friend")}><Users size={16}/> 朋友的電腦</button>
   </div>
   <label className="slime-os-label" htmlFor="slime-os">作業系統</label>
   <select id="slime-os" value={os} onChange={e=>setOS(e.target.value as OS)}>
    <option value="windows">Windows</option><option value="macos">macOS</option><option value="linux">Linux</option>
   </select>
   {asset?
    <a className="slime-main-action" href={asset.browser_download_url} target="_blank" rel="noopener noreferrer"><Download size={17}/>下載 {role==="owner"?"我的電腦":"朋友版"} Slime <ChevronRight size={16}/></a>:
    <a className="slime-main-action pending" href={RELEASES} target="_blank" rel="noopener noreferrer"><Download size={17}/>{releaseChecked?"查看尚未發佈的安裝檔":"確認發行檔狀態"} <ChevronRight size={16}/></a>}
   <small>{asset?"由 Vanilla 官方 GitHub Releases 發布；安裝前請檢查版本、來源與系統安全警告。":"尚未找到符合此裝置的安裝檔，請以正式 Releases 頁面的狀態為準；目前不宣稱已發布免安裝程式。"}</small>
   <div className="slime-onboarding">
    <span><strong>1</strong> 下載程式</span><span><strong>2</strong> 私下取得邀請</span><span><strong>3</strong> 本人同意後加入</span>
   </div>
  </article>
  <article className="slime-card">
   <div className="slime-heading"><div><span className="slime-kicker">PRIVACY · 隱私</span><h3>共享完全由裝置擁有者決定</h3></div><ShieldCheck size={20}/></div>
   <p>關閉 Slime 可停止健康心跳，亦可在裝置端點選「退出並撤銷配對」。即使管理員允許調度，朋友仍可自行暫停共享或退出。</p>
   <p>現階段只提供裝置註冊及狀態回報；真正的多電腦 30B 推論、遠端派工與電源控制尚未啟用。</p>
  </article>
 </section>;
}
