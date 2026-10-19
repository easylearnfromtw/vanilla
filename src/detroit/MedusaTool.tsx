import {useState} from 'react';
import {Terminal,Play,ShieldAlert} from 'lucide-react';
import {currentChatMode} from '../local-ai/chat-session';
import {runWeiGuoMedusaCode,weiGuoApiBase,weiGuoIdentity,
  type MedusaLanguage,type MedusaResult} from '../weiguo/api';

/** Explicitly triggered Judge0 sandbox. Never evaluate code in the PWA. */
export default function MedusaTool(){
 const [language,setLanguage]=useState<MedusaLanguage>('python');
 const [code,setCode]=useState('print("Hello, Medusa!")');
 const [stdin,setStdin]=useState('');
 const [approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [result,setResult]=useState<MedusaResult|null>(null);
 const identity=weiGuoIdentity();
 const privateMode=currentChatMode()==='private';
 const ready=!!weiGuoApiBase()&&!!identity&&identity.role!=='viewer'&&!privateMode;
 async function run(){
  if(busy||!approved||!ready)return;
  setBusy(true);setResult(null);setMessage('Medusa 正在呼叫後端執行沙盒…');
  setApproved(false);
  try{
   const data=await runWeiGuoMedusaCode(language,code,stdin,true);
   setResult(data);setMessage(data.success?'程式執行完成':'已回傳編譯或執行錯誤；請檢查結果');
  }catch(e){setMessage('Medusa 未完成：'+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <section className="detroit-studio-form">
  <h2><Terminal size={22} aria-hidden="true"/> Medusa · 程式執行工廠</h2>
  <p>使用獨立部署的 Judge0 沙盒執行程式；不是手機本機運算。
    預設停用。只有受信任的管理員完成網路隔離、資源限制與後端配置後才能啟用。</p>
  <label>程式語言
   <select value={language} onChange={e=>{setLanguage(e.target.value as MedusaLanguage);setApproved(false);setResult(null);}}>
    <option value="python">Python 3</option><option value="javascript">JavaScript</option>
    <option value="cpp">C++</option>
   </select>
  </label>
  <label>原始程式碼
   <textarea rows={12} spellCheck={false} maxLength={12000} value={code}
     onChange={e=>{setCode(e.target.value);setApproved(false);setResult(null);}}/>
  </label>
  <label>標準輸入（可留空）
   <textarea rows={3} maxLength={2000} spellCheck={false} value={stdin}
     onChange={e=>{setStdin(e.target.value);setApproved(false);setResult(null);}}/>
  </label>
  <label className="detroit-consent"><input type="checkbox" checked={approved}
    onChange={e=>setApproved(e.target.checked)}/>
   我確認本次送出的程式碼不含秘密、私人資料或未授權內容，並同意傳送到獨立的 Medusa 後端執行。
  </label>
  {privateMode&&<p><ShieldAlert size={16} aria-hidden="true"/> 私人模式禁止將程式碼傳送到後端。</p>}
  {!weiGuoApiBase()&&<p>尚未設定可信任的衞國 HTTPS 伺服器。</p>}
  {!identity&&<button type="button"
     onClick={()=>window.dispatchEvent(new Event('vanilla-open-weiguo'))}>前往衞國系統登入</button>}
  {identity?.role==='viewer'&&<p>目前身分為 viewer，沒有程式執行權限。</p>}
  <button className="detroit-primary" type="button" disabled={!ready||!approved||busy||!code.trim()}
    onClick={()=>void run()}><Play size={17} aria-hidden="true"/>{busy?'執行中…':'送出至 Medusa 沙盒'}</button>
  {message&&<p role="status">{message}</p>}
  {result&&<section className="detroit-medusa-result" aria-label="Medusa 執行結果">
   <h3>執行結果 · {result.status.description}</h3>
   <p>CPU {result.time||'—'} s · Memory {result.memory||'—'} KB · Network {result.network}</p>
   {([['標準輸出',result.stdout],['標準錯誤',result.stderr],
      ['編譯結果',result.compile_output],['執行訊息',result.message]] as const)
     .filter(([,value])=>!!value).map(([title,value])=>
      <div key={title}><strong>{title}</strong><pre>{value}</pre></div>)}
   {!result.stdout&&!result.stderr&&!result.compile_output&&!result.message&&<p>無文字輸出。</p>}
  </section>}
 </section>;
}
