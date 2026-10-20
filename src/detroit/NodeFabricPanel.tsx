import {Download,HardDrive,ShieldCheck,Users,Network} from "lucide-react";
import "./node-fabric.css";

const BASE=import.meta.env.BASE_URL;
const downloads=[
 {name:"我的電腦",label:"Owner Node",file:"slime-my-computer.py",icon:HardDrive,
  info:"安裝在你自己的 Windows、macOS 或 Linux 電腦，加入自己的閒置算力。"},
 {name:"朋友的電腦",label:"Friend Node",file:"slime-friend.py",icon:Users,
  info:"朋友自行決定是否參加、可以隨時停止並退出，不需要提供帳號密碼或個人檔案。"}
] as const;

export default function NodeFabricPanel(){
 return <section className="node-fabric">
  <div className="node-fabric-heading">
   <div className="node-fabric-kicker"><Network size={16}/> VANILLA / SLIME</div>
   <h2>Slime · 電腦節點下載</h2>
   <p>安裝 Slime，讓不同電腦自願加入 Vanilla 節點網路。本頁僅提供程式下載與安全說明。<strong>全部管理和設定只在管理員私人 Telegram 對話中操作。</strong></p>
  </div>
  <div className="node-fabric-role-tabs" aria-label="Slime 節點下載種類">
   {downloads.map(item=><article className="node-fabric-install" key={item.file}>
    <div className="node-fabric-install-head"><div><item.icon size={24}/><h3>{item.name}</h3><p>{item.label}</p></div></div>
    <p>{item.info}</p>
    <a className="node-fabric-download" href={BASE+"slime/"+item.file} download={item.file}>
     <Download size={18}/>下載 {item.name}程式
    </a>
    <p className="node-fabric-compat">Python 3.10+ · Windows / macOS / Linux · 可檢查原始碼 · 不自動開機執行</p>
   </article>)}
  </div>
  <div className="node-fabric-note">
   <ShieldCheck size={20}/>
   <p>電腦擁有者需自行執行程式並明確同意，從管理員私下取得短效邀請碼才能加入。管理員不會因此取得遠端桌面、檔案或任意程式執行權限。按 Ctrl+C 可停止心跳，執行 leave 可自行退出。</p>
  </div>
  <div className="node-fabric-roadmap">
   <h3>安裝後如何使用？</h3>
   <p>下載後，在該檔所在的終端機執行 <code>python3 slime-friend.py probe</code>（Windows 可用 <code>py -3 slime-friend.py probe</code>）查看會分享的硬體資訊；若安裝的是「我的電腦」，將檔名改為 <code>slime-my-computer.py</code>。之後以你從管理員取得的 HTTPS 後端網址及一次性邀請碼執行 <code>join --url 網址 --invite 邀請碼 --consent</code>，最後執行 <code>run</code> 開始心跳。</p>
   <p>目前 Slime 提供安全註冊與狀態回報，沒有真正的 30B 模型切分或遠端 GPU 派工。後續需要節點執行器及效能驗證。</p>
  </div>
 </section>;
}
