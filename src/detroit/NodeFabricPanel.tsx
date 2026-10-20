import {useState} from "react";
import {Check,Copy,Download,HardDrive,Info,Monitor,Network,Server,ShieldCheck,Users} from "lucide-react";
import "./node-fabric.css";

type Role="owner"|"friend";
const BASE=import.meta.env.BASE_URL;
const install={
 owner:{
  title:"我的電腦 · Owner",
  subtitle:"下載管理端，建立私人協調中心與節點清單。",
  filename:"vanilla-owner.py",
  script:"vanilla-owner.py",
  steps:[
   {label:"初始化（只需執行一次）",windows:"py -3 vanilla-owner.py init",unix:"python3 vanilla-owner.py init"},
   {label:"啟動本機協調中心",windows:"py -3 vanilla-owner.py serve",unix:"python3 vanilla-owner.py serve"},
   {label:"查看已加入的電腦",windows:"py -3 vanilla-owner.py nodes",unix:"python3 vanilla-owner.py nodes"},
   {label:"用完邀請碼後立即換新",windows:"py -3 vanilla-owner.py rotate-invite",unix:"python3 vanilla-owner.py rotate-invite"}
  ]
 },
 friend:{
  title:"朋友的電腦 · Contributor",
  subtitle:"朋友自行下載、自行審查、明確同意後才加入。",
  filename:"vanilla-friend.py",
  script:"vanilla-friend.py",
  steps:[
   {label:"檢查本機可分享的硬體資訊",windows:"py -3 vanilla-friend.py probe",unix:"python3 vanilla-friend.py probe"},
   {label:"明確同意並配對",windows:"py -3 vanilla-friend.py join --url https://YOUR-PRIVATE-ENDPOINT --pair INVITE_CODE --consent",unix:"python3 vanilla-friend.py join --url https://YOUR-PRIVATE-ENDPOINT --pair INVITE_CODE --consent"},
   {label:"開始傳送裝置心跳",windows:"py -3 vanilla-friend.py run",unix:"python3 vanilla-friend.py run"},
   {label:"退出並註銷授權",windows:"py -3 vanilla-friend.py leave",unix:"python3 vanilla-friend.py leave"}
  ]
 }
} as const;

export default function NodeFabricPanel(){
 const [role,setRole]=useState<Role>("owner");
 const [os,setOs]=useState<"windows"|"unix">("windows");
 const [copied,setCopied]=useState<string>("");
 const current=install[role];
 async function copy(value:string){
  try{await navigator.clipboard.writeText(value);setCopied(value);}
  catch{setCopied("無法複製，請手動選取指令。");}
 }
 return <section className="node-fabric">
  <div className="node-fabric-heading">
   <div className="node-fabric-kicker"><Network size={16}/> DETROIT / DISTRIBUTED COMPUTE</div>
   <h2>Node Fabric · 分散式節點</h2>
   <p>把自己的電腦與朋友自願共享的閒置設備，逐步整合進 Vanilla。首次版本提供真正可執行的節點註冊、撤銷與健康心跳；<strong>目前尚不會分配 GPU 任務或執行跨機 30B 模型。</strong></p>
  </div>
  <div className="node-fabric-flow" aria-label="Node Fabric 工作架構">
   <div><Server size={22}/><strong>Owner 協調端</strong><small>私人端點 · 安全配對</small></div>
   <span aria-hidden="true">↔</span>
   <div><Monitor size={22}/><strong>我的電腦</strong><small>日後可作為本地推論節點</small></div>
   <span aria-hidden="true">+</span>
   <div><Users size={22}/><strong>朋友節點</strong><small>自願參加 · 隨時退出</small></div>
  </div>
  <div className="node-fabric-role-tabs" role="tablist" aria-label="選擇安裝身分">
   <button role="tab" type="button" aria-selected={role==="owner"} className={role==="owner"?"selected":""} onClick={()=>{setRole("owner");setCopied("");}}><HardDrive size={19}/>我的電腦 <small>擁有者 / 管理端</small></button>
   <button role="tab" type="button" aria-selected={role==="friend"} className={role==="friend"?"selected":""} onClick={()=>{setRole("friend");setCopied("");}}><Users size={19}/>朋友的電腦 <small>貢獻者 / 受限節點</small></button>
  </div>
  <article className="node-fabric-install">
   <div className="node-fabric-install-head">
    <div><h3>{current.title}</h3><p>{current.subtitle}</p></div>
    <a className="node-fabric-download" href={BASE+"node-fabric/"+current.filename} download={current.filename}><Download size={18}/>下載 Python 程式</a>
   </div>
   <p className="node-fabric-compat">適用 Windows、macOS、Linux · 需安裝 Python 3.10 以上 · 原始碼可審查、無自動安裝或開機自啟。</p>
   <div className="node-fabric-os" role="group" aria-label="選擇作業系統指令">
    <button className={os==="windows"?"selected":""} onClick={()=>setOs("windows")} type="button">Windows</button>
    <button className={os==="unix"?"selected":""} onClick={()=>setOs("unix")} type="button">macOS / Linux</button>
   </div>
   <ol className="node-fabric-steps">{current.steps.map(step=>{
    const command=step[os];
    return <li key={step.label}><strong>{step.label}</strong><div className="node-fabric-command"><code>{command}</code><button type="button" aria-label={"複製："+step.label} onClick={()=>void copy(command)}>{copied===command?<Check size={15}/>:<Copy size={15}/>}</button></div></li>;
   })}</ol>
   {copied==="無法複製，請手動選取指令。"&&<p role="status">{copied}</p>}
   {role==="owner"?<div className="node-fabric-note"><Info size={19}/><p>啟動時僅監聽本機 <code>127.0.0.1:8765</code>。跨家庭連線需要自行設定經驗證的 HTTPS 私人網路代理（例如 Tailscale Serve）；不要直接把 HTTP 連接埠暴露到公網。邀請碼只私下交付，朋友加入後立即換新。</p></div>:
   <div className="node-fabric-note"><ShieldCheck size={19}/><p>下載不會啟動任何工作。只有朋友本人輸入 <code>--consent</code> 才會註冊；<code>run</code> 只回報有限的硬體資訊與心跳，不讀取個人檔案、不下載模型、不執行遠端程式碼。按 Ctrl+C 可立即停止；<code>leave</code> 撤銷配對。</p></div>}
  </article>
  <div className="node-fabric-roadmap">
   <h3>實作狀態</h3>
   <div><span>01</span><strong>身分分流與程式下載</strong><small>已提供</small></div>
   <div><span>02</span><strong>朋友同意、註冊、心跳與撤銷</strong><small>原型可測試</small></div>
   <div><span>03</span><strong>Web 儀表板讀取即時節點、Zeus/Diana 派工</strong><small>尚未接通</small></div>
   <div><span>04</span><strong>跨機模型切分、推論與故障轉移</strong><small>待研發／基準測試</small></div>
   <p>公開 PWA 不會保存 owner 金鑰、邀請碼或朋友的裝置識別資料。節點名單目前透過管理端命令查看，無法在這裡直接啟用 30B 模型。</p>
  </div>
 </section>;
