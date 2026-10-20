import {useEffect,useState} from "react";
import {availableNodes,knownNodes,pairNode,removeNode,selectNode,type NodeInfo} from "./registry";
import {setOllamaConfig} from "../ai/ollama";
const RELEASE="https://github.com/easylearnfromtw/vanilla/releases";
const FILE="Vanilla-Windows-Node-Setup.exe";
export default function NodesPage(){
 const [endpoint,setEndpoint]=useState("http://127.0.0.1:18765");
 const [token,setToken]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [current,setCurrent]=useState<NodeInfo[]>([]),[known,setKnown]=useState(knownNodes);
 const [released,setReleased]=useState(false);
 async function refresh(){setKnown(knownNodes());setCurrent(await availableNodes());}
 useEffect(()=>{void refresh();fetch("https://api.github.com/repos/easylearnfromtw/vanilla/releases/latest").then(r=>r.ok?r.json():null).then(j=>setReleased(Boolean(j?.assets?.some((a:{name:string})=>a.name===FILE)))).catch(()=>{});},[]);
 async function connect(){
  setBusy(true);setMessage("正在核對節點…");
  try{
   const n=await pairNode(endpoint,token);
   if(n.models.length)setOllamaConfig({endpoint:n.endpoint,model:n.models[0],models:n.models.slice(0,4)},token.trim());
   setToken("");setMessage("配對成功。接下來由 Diana 自動選擇符合模型需求的可用節點。");
   await refresh();
  }catch(e){setMessage("配對未完成："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <div className="content-page">
  <div className="eyebrow">VANILLA / DETROIT NODE MANAGER</div><h1>運算節點</h1>
  <p className="content-description">從 Vanilla 下載 Windows 安裝程式。安裝後完成一次安全配對，Diana 便可在一般對話中選擇在線、模型相容且未滿載的主機。</p>
  <section className="panel settings-card"><h2>01 · 安裝 Windows Node</h2>
   <p>支援 Windows 10／11 x64；這是 Ollama 推論節點，不提供任意遠端程式執行。需要另外安裝 Ollama 和模型。</p>
   {released?<a href={RELEASE+"/latest/download/"+FILE} download>下載 Vanilla Windows Node 安裝程式（.exe）</a>:
    <p role="status">正式安裝檔尚未核實已發佈。Windows CI 產出發布檔後將自動開放按鈕。<a href={RELEASE} target="_blank" rel="noreferrer">查看發布頁</a></p>}
  </section>
  <section className="panel settings-card"><h2>02 · 配對此電腦</h2>
   <p>在 Windows Agent 視窗按「複製配對權杖」，貼到這裡。若網站在同一台 Windows 電腦開啟，使用預設本機網址即可；從 iPhone 使用時請填入 Tailscale Serve 提供的私人 HTTPS 網址。</p>
   <label>節點網址 <input value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="http://127.0.0.1:18765" style={{maxWidth:"100%",width:360}}/></label>
   <label>配對權杖 <input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} style={{maxWidth:"100%",width:360}}/></label>
   <p><button type="button" disabled={busy||token.length<48} onClick={()=>void connect()}>{busy?"正在驗證…":"驗證並加入節點"}</button></p>
   <p role="status">{message}</p>
  </section>
  <section className="panel settings-card"><h2>03 · 已授權節點</h2>
   <button type="button" onClick={()=>void refresh()}>重新偵測</button>
   {known.length===0?<p>尚未配對節點。</p>:known.map(n=>{const live=current.find(x=>x.id===n.id);return <article key={n.id} style={{padding:12,marginBlock:8,border:"1px solid #ccc",borderRadius:10}}>
    <strong>{n.name}</strong> {live&&selectNode(current)?.id===n.id?"· 最佳可用節點":""}
    <p>{live?"在線，RAM 可用 "+(live.availableRamGB??"未知")+"GB、VRAM 可用 "+(live.availableVramGB??"未知")+"GB，模型："+live.models.join("、"):"未驗證在線（關機、網路斷線或需重新配對）"}</p>
    <button type="button" onClick={()=>{removeNode(n.id);void refresh();}}>解除配對</button>
   </article>;})}
   <p>配對權杖僅保留於此瀏覽器分頁，不會放進 Google Drive。私密模式仍僅使用目前裝置的 WebLLM。</p>
  </section>
 </div>;
}
