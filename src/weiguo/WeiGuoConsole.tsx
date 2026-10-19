import {useMemo,useState} from "react";
import {Bot,Globe2,ShieldCheck,Plus,Trash2,Copy,CheckCircle2} from "lucide-react";
import {WEIGUO_BUILTINS,loadWeiGuoTools,saveWeiGuoTools,validateCustomTool,type WeiGuoTool} from "./registry";
import "./weiguo.css";
const capabilityLabel:Record<string,string>={navigate:"開啟網站",click:"點擊",fill:"輸入",scroll:"捲動",extract:"擷取",research:"搜尋",analyze:"統計",chart:"圖表","read-file":"讀檔",schedule:"排程",plan:"任務規劃"};
export default function WeiGuoConsole(){
 const [tools,setTools]=useState<WeiGuoTool[]>(loadWeiGuoTools);
 const [id,setId]=useState("");const [name,setName]=useState("");const [description,setDescription]=useState("");const [cap,setCap]=useState("extract");
 const [notice,setNotice]=useState("");
 const catalog=useMemo(()=>[...WEIGUO_BUILTINS,...tools],[tools]);
 function add(){
  try{
   const t=validateCustomTool({id,name,description,capabilities:[cap]});
   saveWeiGuoTools([...tools,t]);setTools([...tools,t]);setName("");setId("");setDescription("");setNotice("已登錄工具規格；尚未授予網頁操作權限。");
  }catch(e){setNotice(String(e instanceof Error?e.message:e))}
 }
 function remove(target:string){const next=tools.filter(x=>x.id!==target);saveWeiGuoTools(next);setTools(next);setNotice("已從此裝置的工具登錄表移除。");}
 async function copyManifest(){
  try{await navigator.clipboard.writeText(JSON.stringify({system:"衞國",runtime:"Detroit / Zeus",tools:catalog.map(x=>({id:x.id,name:x.name,capabilities:x.capabilities,enabled:x.enabled}))},null,2));setNotice("已複製工具清單；未執行任何網頁操作。");}
  catch{setNotice("複製失敗，請確認 Safari 剪貼簿權限。");}
 }
 return <div className="weiguo-page">
  <header className="weiguo-head"><div className="weiguo-eyebrow">VANILLA / DETROIT / BROWSER AUTOMATION</div><h1>衞國 <span>系統</span></h1><p>以 Zeus 調度、Athena 守門，讓 Scouts、Playwright 和你日後加入的工具協作。iPhone 負責對話與核准，瀏覽器由獨立後端執行。</p></header>
  <div className="weiguo-systemline"><span><Bot size={15}/> Single Model Runtime</span><span><ShieldCheck size={15}/> 需核准寫入操作</span><span><Globe2 size={15}/> 後端尚未連接</span></div>
  <section className="weiguo-section"><div className="weiguo-heading"><h2>工具登錄表</h2><button type="button" onClick={()=>void copyManifest()}><Copy size={15}/> 複製工具規格</button></div>
   <div className="weiguo-catalog">{catalog.map(tool=><article key={tool.id} className="weiguo-tool"><div><strong>{tool.name}</strong><small>{tool.engine} · {tool.enabled?"已具備現有本機能力":"需設定或接線"}</small></div><p>{tool.description}</p><div className="weiguo-capabilities">{tool.capabilities.map(c=><span key={c}>{capabilityLabel[c]||c}</span>)}</div>{tool.source==="custom"&&<button className="weiguo-delete" type="button" onClick={()=>remove(tool.id)}><Trash2 size={13}/> 移除登錄</button>}</article>)}</div>
  </section>
  <section className="weiguo-section"><h2>加入外部工具</h2><p>在此建立擴充工具的能力清單；不會執行外部程式或自動信任外來 API。真正接線需要後端適配器、權限審核與測試。</p>
  <form className="weiguo-form" onSubmit={e=>{e.preventDefault();add();}}>
    <label>工具 ID<input value={id} onChange={e=>setId(e.target.value)} placeholder="my-research-tool" required maxLength={40}/></label>
    <label>名稱<input value={name} onChange={e=>setName(e.target.value)} placeholder="我的研究工具" required maxLength={64}/></label>
    <label>功能說明<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="它能處理哪些資料、需要哪些授權？" maxLength={280} rows={2}/></label>
    <label>主要能力<select value={cap} onChange={e=>setCap(e.target.value)}>{Object.entries(capabilityLabel).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <button type="submit"><Plus size={15}/> 登錄工具</button></form>
  {notice&&<p className="weiguo-notice" role="status"><CheckCircle2 size={15}/>{notice}</p>}</section>
  <section className="weiguo-section weiguo-security"><h2>衞國的真實執行流程</h2>
   <p><b>Merlin</b> 理解任務 → <b>Zeus</b> 選擇工具與批准節點 → <b>Athena</b> 阻擋惡意網站與提示注入 → <b>Scouts／Playwright</b> 在受控瀏覽器操作 → <b>CREAM</b> 核算結果 → <b>爾雅與 Venus</b> 呈現。</p>
   <p>程式碼提供受限的 Playwright/FastAPI 服務參考。**目前沒有已驗證的瀏覽器後端連線**；若要跨網站點擊、填表及長期排程，需在受信任主機部署、驗證登入與審核權限。所有帳密與後端金鑰均不得寫入公開的 GitHub Pages。</p>
  </section>
 </div>;
}
