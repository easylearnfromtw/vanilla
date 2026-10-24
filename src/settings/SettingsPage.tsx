import {useEffect,useState} from "react";
import ReleaseReadinessPanel from "../release/ReleaseReadinessPanel";
import PWAUpdateNotice from "../pwa/PWAUpdateNotice";
import ToneSettings from "../ai/ToneSettings";
import ChatSyncSettings from "../vault/ChatSyncSettings";
import SourceSettings from "../search/SourceSettings";
import ModelConnections from "../ai/ModelConnections";
import ApiVaultPanel from "../weiguo/ApiVaultPanel";
import DriveConnection from "../vault/DriveConnection";
import SlimeWalletPanel from "../slime/SlimeWalletPanel";
import "../slime/slime-wallet.css";
import {OLLAMA_CTX_CHOICES,ollamaContextSetting,setOllamaContextSetting,DEFAULT_LOCAL_MODEL} from "../ai/model-profiles";
import {webllmRequestOptions,geminiThinkingLevel,deepseekRequestExtras,ollamaRequestExtras} from "../ai/generation-config";
import {getConfigs} from "../vault/providers";
import {getOllamaConfig} from "../ai/ollama";
import {getLoadedLocalModel} from "../local-ai/engine";
import type {TaskKind} from "../ai/task-kind";

const SECTIONS=[["account","帳號與同步"],["models","AI 模型"],["tuning","模型調校"],["style","語氣與來源"],["appearance","外觀"],["system","系統狀態"]] as const;
const TASKS:Array<[TaskKind,string]>=[["casual","閒聊"],["general","一般"],["writing","寫作"],["analysis","分析"],["code","程式"]];

function TuningCard(){
 const [ctx,setCtx]=useState(ollamaContextSetting);
 const local=getLoadedLocalModel()||DEFAULT_LOCAL_MODEL;
 const gemini=getConfigs().find(x=>x.provider==="gemini")?.model;
 const deepseek=getConfigs().find(x=>x.provider==="deepseek")?.model;
 const ollama=getOllamaConfig().model;
 return <section className="panel settings-card" id="tuning">
  <h2>模型調校</h2>
  <p>Vanilla 依「任務類型 × 模型大小」自動調整提示詞、溫度、回答長度與思考深度；長附件會依模型的上下文長度節錄，並在回答下方註明。</p>
  <div className="tuning-table-wrap"><table className="tuning-table">
   <thead><tr><th>任務</th><th>本機 {local.split("-").slice(0,2).join(" ")}</th>{gemini&&<th>Gemini 思考</th>}{deepseek&&<th>DeepSeek</th>}{ollama&&<th>Ollama</th>}</tr></thead>
   <tbody>{TASKS.map(([task,label])=>{const w=webllmRequestOptions(local,task);const d=deepseek?deepseekRequestExtras(deepseek,task):null;const o=ollama?ollamaRequestExtras(ollama,task):null;return <tr key={task}>
    <td>{label}</td>
    <td>溫度 {String(w.temperature)} · 上限 {String(w.max_tokens)}</td>
    {gemini&&<td>{geminiThinkingLevel(gemini,task)??"預設"}</td>}
    {d&&<td>{(d.thinking as {type?:string}|undefined)?.type==="enabled"?"深度思考":"快速"}{d.temperature!==undefined?" · 溫度 "+d.temperature:""}</td>}
    {o&&<td>溫度 {o.options.temperature}{o.think?" · 思考":""}</td>}
   </tr>;})}</tbody>
  </table></div>
  <label className="settings-row"><span><strong>Ollama 上下文長度</strong><small>越大可放越多附件與網頁內容，但主機記憶體需求越高。8 GB 顯示卡建議 8192。</small></span>
   <select value={ctx} onChange={e=>{const n=Number(e.target.value);setOllamaContextSetting(n);setCtx(n);}}>{OLLAMA_CTX_CHOICES.map(n=><option key={n} value={n}>{n.toLocaleString("en-US")} tokens</option>)}</select>
  </label>
 </section>;
}

export default function SettingsPage(){
 const [fontMode,setFontMode]=useState(()=>{try{return localStorage.getItem("vanilla.font.mode")||"auto";}catch{return "auto";}});
 useEffect(()=>{document.documentElement.dataset.fontMode=fontMode;try{localStorage.setItem("vanilla.font.mode",fontMode);}catch{}},[fontMode]);
 return <div className="settings-page">
  <nav className="settings-jump" aria-label="設定分類">{SECTIONS.map(([id,label])=><a key={id} href={"#"+id} onClick={e=>{e.preventDefault();document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});}}>{label}</a>)}</nav>
  <section className="panel settings-card" id="account"><h2>帳號與同步</h2>
   <p>每個家庭成員使用自己的 Google 帳號與私有 Drive 空間；共用資料需另外授權，不會自動混合。</p>
   <DriveConnection/><ChatSyncSettings/><SlimeWalletPanel/>
  </section>
  <section className="panel settings-card" id="models"><h2>AI 模型</h2><ModelConnections/><ApiVaultPanel/></section>
  <TuningCard/>
  <section className="panel settings-card" id="style"><h2>語氣與來源</h2><ToneSettings/><SourceSettings/></section>
  <section className="panel settings-card" id="appearance"><h2>外觀</h2>
   <div className="font-settings"><h3>字型</h3><p>自動模式依文字語系使用系統字型（iPhone 為蘋方）；也可以手動指定，設定保留在此裝置。</p><label htmlFor="font-mode">顯示字型 </label><select id="font-mode" value={fontMode} onChange={e=>setFontMode(e.target.value)}><option value="auto">自動（推薦）</option><option value="system">系統預設</option><option value="sans">無襯線字型</option><option value="serif">襯線字型</option><option value="mono">等寬字型</option></select><p className="font-preview">Vanilla AI · 中文 English 日本語 12345</p></div>
  </section>
  <section className="panel settings-card" id="system"><h2>系統狀態</h2><p>可在此確認裝置目前載入的版本、GitHub Pages 發布版本，以及手動檢查與更新。不會清除對話或雲端資料。</p><div className="settings-pwa-update"><PWAUpdateNotice/></div><ReleaseReadinessPanel/></section>
 </div>;
}
