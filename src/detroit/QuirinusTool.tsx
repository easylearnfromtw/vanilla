import {useEffect,useState} from 'react';
import {ShieldCheck,RefreshCw,Play,ExternalLink} from 'lucide-react';
import {currentChatMode} from '../local-ai/chat-session';
import {
  getQuirinusFamilyStatus,prepareQuirinusFamilyScan,executeQuirinusFamilyScan,
  getQuirinusFamilyRun,weiGuoApiBase,weiGuoIdentity,
  type QuirinusFamilyStatus,type QuirinusFamilyPlan,type QuirinusFamilyRun
} from '../weiguo/api';

/** All authority lives in WeiGuo; this PWA only asks for owner consent. */
export default function QuirinusTool(){
 const [status,setStatus]=useState<QuirinusFamilyStatus|null>(null);
 const [plan,setPlan]=useState<QuirinusFamilyPlan|null>(null);
 const [approved,setApproved]=useState(false);
 const [run,setRun]=useState<QuirinusFamilyRun|null>(null);
 const [message,setMessage]=useState('尚未檢查後端。');
 const [busy,setBusy]=useState(false);
 const person=weiGuoIdentity();
 const privateMode=currentChatMode()==='private';
 const eligible=person?.role==='owner'&&!privateMode&&!!weiGuoApiBase();
 async function refresh(){
  setStatus(null);setPlan(null);setApproved(false);
  if(!eligible){setMessage(privateMode?'私密模式禁止遠端派工':'請在衞國以家庭管理者身分登入');return;}
  try{const s=await getQuirinusFamilyStatus();setStatus(s);setMessage(s.note);}
  catch(e){setMessage(e instanceof Error?e.message:String(e));}
 }
 useEffect(()=>{void refresh();},[]);
 async function prepare(){
  if(!eligible||busy||!status?.enabled)return;
  setBusy(true);setPlan(null);setApproved(false);
  try{const next=await prepareQuirinusFamilyScan();setPlan(next);
   setMessage('Athena 已提出掃描計畫，請檢查範圍後逐次勾選同意。核准將在 '+next.expiresIn+' 秒內失效。');
  }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function submit(){
  if(!eligible||busy||!status?.enabled||!plan||!approved)return;
  setBusy(true);setApproved(false);const token=plan.approvalToken;setPlan(null);
  try{const result=await executeQuirinusFamilyScan(token,true);
   setRun({...result,conclusion:null,url:null,runId:null});
   setMessage('GitHub Actions 已接受本次掃描派工；執行成功與否須另行查詢。');
  }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 async function checkRun(){
  if(!run||busy)return;
  setBusy(true);
  try{const data=await getQuirinusFamilyRun(run.requestId);setRun(data);
   setMessage(data.status==='completed'?(data.conclusion==='success'?'離線掃描已完成。':'工作流程已結束，請查閱 GitHub 原因。'):'工作流程尚在處理中。');
  }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 return <section className="detroit-studio-form">
  <h2><ShieldCheck size={21} aria-hidden="true"/> Quirinus · 資安掃描派工</h2>
  <p>由 Athena 審核後才向 GitHub Actions 要求執行。真正的 VulnClaw L1/L2 掃描在停用網路的容器中執行；Railway 不執行掃描程式。</p>
  <p role="status">{message}</p>
  <p><strong>主動巡檢：</strong>GitHub PR、主分支更新及每日例行掃描均會自動執行。高風險警示只公布統計，不會擅自修補或部署。</p>
  <p><a href="https://github.com/easylearnfromtw/vanilla/actions/workflows/quirinus-offline-scan.yml" target="_blank" rel="noreferrer noopener">查看 Quirinus 自動巡檢紀錄 <ExternalLink size={15}/></a></p>
  {!person&&<button type="button" onClick={()=>window.dispatchEvent(new Event('vanilla-open-weiguo'))}>至衞國登入</button>}
  <button type="button" disabled={busy||!eligible} onClick={()=>void refresh()}><RefreshCw size={15}/>檢查授權狀態</button>
  {status?.enabled&&eligible&&<>
   <p><strong>固定範圍：</strong>easylearnfromtw/vanilla · main · src／services／tests（唯讀）</p>
   <p>掃描結果僅公開規則數量摘要。不執行攻擊、對外掃描、程式修復、合併 PR 或原始碼雲端上傳。</p>
   {!plan&&<button type="button" className="detroit-primary" disabled={busy} onClick={()=>void prepare()}>提出本次掃描計畫</button>}
   {plan&&<>
    <p>審核目標：<strong>{plan.repo}</strong> · {plan.ref} · {plan.scope}</p>
    <label className="detroit-consent"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
     我確認擁有 Vanilla 專案的掃描權限，已檢查此次固定掃描範圍，並明確同意啟動本次 GitHub Actions 工作。
    </label>
    <button type="button" className="detroit-primary" disabled={busy||!approved} onClick={()=>void submit()}><Play size={16}/>核准並派工（單次有效）</button>
   </>}
  </>}
  {run&&<div className="detroit-medusa-result">
   <strong>掃描派工 · {run.status}</strong>
   {run.conclusion&&<p>執行結果：{run.conclusion}</p>}
   <button type="button" onClick={()=>void checkRun()} disabled={busy}><RefreshCw size={15}/>查詢 GitHub 實際執行狀態</button>
   {run.url&&<a href={run.url} rel="noreferrer noopener" target="_blank"><ExternalLink size={15}/>開啟 GitHub Actions 統計報告</a>}
  </div>}
  <p>管理員必須先在衞國後端設定專屬 GitHub Actions 權限及家庭擁有者白名單。此介面不會要求你貼上 GitHub Token。</p>
 </section>;
}
