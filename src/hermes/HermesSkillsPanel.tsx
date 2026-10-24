import {useState} from "react";
import {HERMES_SKILLS,HERMES_UPSTREAM_REVISION,searchHermesSkills,selectedHermesSkill,selectHermesSkill,readHermesSkill,findHermesSkill} from "./hermes-skills";

/** Opt-in, read-only preview of actual upstream Hermes SKILL.md procedures. */
export default function HermesSkillsPanel(){
 const [query,setQuery]=useState("");
 const [selected,setSelected]=useState(selectedHermesSkill);
 const [preview,setPreview]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const visible=searchHermesSkills(query,25);
 async function open(id:string){
  if(busy)return;
  setBusy(true);setPreview("");setNotice("正在讀取上游技能完整內容（不執行程式）…");
  try{const raw=await readHermesSkill(id);setPreview(raw.slice(0,7500));setNotice("已讀取真正的 SKILL.md，僅供參考，不會自動執行第三方指令。");}
  catch(err){setNotice("讀取失敗："+String(err instanceof Error?err.message:err));}
  finally{setBusy(false);}
 }
 return <section className="model-connection-panel" aria-label="Hermes Agent 技能庫">
  <h3>Hermes Agent · 技能參考庫</h3>
  <p>從 NousResearch/hermes-agent 的指定版本建立 <strong>{HERMES_SKILLS.length} 項</strong>官方核心與選配技能目錄。搜尋並讀取實際 SKILL.md 後，可明確指定某一項作為聊天的操作方法參考。這是<strong>可查閱技能／模型上下文</strong>，不是已訓練神經網路權重，也不會自動安裝、執行其 Shell 或擴充工具權限。</p>
  <p>上游版號：<code>{HERMES_UPSTREAM_REVISION.slice(0,12)}</code> · <a href="https://github.com/NousResearch/hermes-agent" target="_blank" rel="noreferrer">原始專案（MIT）</a></p>
  <label htmlFor="hermes-skill-search">尋找技能（例如 research、code、finance、browser）</label>
  <input id="hermes-skill-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="輸入技能名稱或分類" />
  <p>目前套用：<strong>{selected?findHermesSkill(selected)?.name:"未啟用任何第三方技能"}</strong></p>
  <div style={{maxHeight:300,overflowY:"auto",display:"grid",gap:7,marginTop:10}}>
   {visible.map(s=><div key={s.id} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"6px 0",borderBottom:"1px solid var(--border, #dddddd)"}}>
    <span style={{flex:"1 1 160px"}}><strong>{s.name}</strong><small style={{display:"block"}}>{s.category} · {s.optional?"選配":"核心"}</small></span>
    <button type="button" disabled={busy} onClick={()=>void open(s.id)}>閱讀技能</button>
    <button type="button" className={selected===s.id?"primary":""} onClick={()=>{selectHermesSkill(selected===s.id?"":s.id);setSelected(selectedHermesSkill());setNotice(selected===s.id?"已停用技能":"已設定為下次聊天的參考技能。僅在一般模式且可以取得文件時讀取。");}}>{selected===s.id?"停用":"選用"}</button>
   </div>)}
  </div>
  {HERMES_SKILLS.length>visible.length&&<small>目前顯示前 {visible.length} 筆，可搜尋全部項目。</small>}
  {preview&&<details open style={{marginTop:10}}><summary>已核對的上游技能正文（唯讀）</summary><pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",maxHeight:380,overflow:"auto",fontSize:12}}>{preview}</pre></details>}
  <p role="status">{notice}</p>
  <small>外部技能內容可能包含命令、安裝要求或間接提示注入；選用只會提供來源標記的參考資訊，實際行動仍受 Vanilla 權限、工具回條與使用者同意約束。</small>
 </section>;
}
