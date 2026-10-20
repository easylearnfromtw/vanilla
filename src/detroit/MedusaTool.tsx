import {useEffect,useState} from 'react';
import {Terminal,Play,RefreshCw} from 'lucide-react';
import {currentChatMode} from '../local-ai/chat-session';
import {getMedusaStatus,runMedusa,weiGuoApiBase,weiGuoIdentity,
  type MedusaOutput,type MedusaStatus} from '../weiguo/api';

/** Visible, individually approved, sandbox-only execution. Never use eval() in the PWA. */
export default function MedusaTool(){
 const [source,setSource]=useState('print(40 + 2)');
 const [stdin,setStdin]=useState('');
 const [consent,setConsent]=useState(false);
 const [status,setStatus]=useState<MedusaStatus|null>(null);
 const [message,setMessage]=useState('');
 const [result,setResult]=useState<MedusaOutput|null>(null);
 const [busy,setBusy]=useState(false);
 const person=weiGuoIdentity();
 const privateMode=currentChatMode()==='private';
 const eligible=person?.role==='owner'&&!privateMode&&!!weiGuoApiBase();
 async function refresh(){
  setStatus(null);
  if(!eligible){setMessage(privateMode?'私人模式不允許傳送程式碼':'需要登入受信任衞國後端的家庭管理者');return;}
  try{const next=await getMedusaStatus();setStatus(next);setMessage(next.note);}
  catch(err){setMessage(err instanceof Error?err.message:String(err));}
 }
 useEffect(()=>{void refresh();},[]);
 async function execute(){
  if(busy||!status?.enabled||!status.connected||!consent||!eligible)return;
  setBusy(true);setConsent(false);setResult(null);setMessage('Medusa 正在執行…');
  try{
   const next=await runMedusa(source,stdin,true);
   setResult(next);
   setMessage(next.accepted?'Medusa 已完成程式執行':'Medusa 已完成，程式不符合當前執行引擎的語法或限制');
  }catch(err){setMessage(err instanceof Error?err.message:String(err));}
  finally{setBusy(false);}
 }
 return <section className="detroit-studio-form">
  <h2><Terminal size={21} aria-hidden="true"/> Medusa · 程式執行</h2>
  <p>Medusa 支援 Judge0、Cloud Run 沙盒或內建的 Medusa Lite。Lite 在現有衞國雲端後端解讀受限 Python 語法，不是完整 Python，也不允許任意外部程式碼、檔案或網路操作。</p>
  <p role="status">{message||'正在查詢 Medusa 後端…'}</p>
  {eligible&&<button type="button" onClick={()=>void refresh()} disabled={busy}><RefreshCw size={15}/>重新檢查連線</button>}
  {!person&&<button type="button" onClick={()=>window.dispatchEvent(new Event('vanilla-open-weiguo'))}>前往衞國系統登入</button>}
  <label>Python 原始碼
   <textarea rows={10} maxLength={16000} value={source} spellCheck={false}
    onChange={e=>{setSource(e.target.value);setConsent(false);setResult(null);}}/>
  </label>
  <label>標準輸入（可選）
   <textarea rows={3} maxLength={2048} value={stdin} spellCheck={false}
    onChange={e=>{setStdin(e.target.value);setConsent(false);setResult(null);}}/>
  </label>
  <label className="detroit-consent"><input type="checkbox" checked={consent}
   onChange={e=>setConsent(e.target.checked)}/>
   我同意本次將程式碼與標準輸入傳送到管理員配置的 Medusa 雲端執行環境；不包含密碼、權杖、私人資料或未經授權內容。
  </label>
  <button type="button" className="detroit-primary"
    disabled={busy||!eligible||!status?.enabled||!status?.connected||!consent||!source.trim()}
    onClick={()=>void execute()}><Play size={16}/>{busy?'執行中…':'執行 Python'}</button>
  {result&&<div className="detroit-medusa-result" aria-label="Medusa 實際執行結果">
   <strong>{result.backend==='cloudrun-sandbox'?'Cloud Run Sandbox':'Judge0'} · {result.status}（狀態碼 {result.status_id}）</strong>
   <p>執行耗時 {result.time||'—'} s · Memory {result.memory??'—'} KB · Exit {result.exit_code??'—'}</p>
   {([['標準輸出',result.stdout],['錯誤輸出',result.stderr],['編譯錯誤',result.compile_output]] as const)
     .filter(([,value])=>Boolean(value)).map(([label,value])=><div key={label}>
      <strong>{label}</strong><pre>{value}</pre>
     </div>)}
   {!result.stdout&&!result.stderr&&!result.compile_output&&<p>程式已結束，沒有文字輸出。</p>}
  </div>}
 </section>;
}
