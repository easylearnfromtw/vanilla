import {useMemo,useState} from 'react';
import {createSandboxScenarios,referenceSandboxPolicy,runSandboxBatch,runSandboxScenario,sandboxSummary,type Action,type Domain,type Result} from './sandbox-engine';
const LABELS:Record<Domain,string>={engineering:'程式修復',workflow:'工具協作',security:'資安攻防',reliability:'故障恢復',strategy:'資料決策'};
const ACTIONS:readonly Action[]=['inspect','repair','verify','execute','publish','ask_permission','reject_injection','switch_node','reconcile','abort'];
const SCENARIOS=createSandboxScenarios();
/** Browser-only demo: intentionally NOT wired to real model or production tools. */
export default function SandboxPanel(){
const [domain,setDomain]=useState<Domain|'all'>('all');
const [selected,setSelected]=useState('engineering-03');
const [manual,setManual]=useState('inspect\nrepair\nverify\nverify\npublish');
const [result,setResult]=useState<Result|null>(null);
const [batch,setBatch]=useState<readonly Result[]|null>(null);
const [busy,setBusy]=useState(false);
const [message,setMessage]=useState('');
const options=useMemo(()=>SCENARIOS.filter(s=>domain==='all'||s.domain===domain),[domain]);
const active=SCENARIOS.find(s=>s.id===selected)??SCENARIOS[0];
const summary=useMemo(()=>batch?sandboxSummary(batch):null,[batch]);
async function run(kind:'reference'|'manual'|'batch'){
 if(busy)return;setBusy(true);setMessage('');
 try{
  if(kind==='batch'){
   const output=await runSandboxBatch(SCENARIOS,referenceSandboxPolicy);
   setBatch(output);setResult(null);setMessage('100 項腳本參考政策的沙盤自檢完成；這不是 AI 模型評測或微調。');
  }else{
   let policy=referenceSandboxPolicy;
   if(kind==='manual'){
    const steps=manual.split(/[\s,，]+/).filter(Boolean).slice(0,30);
    let cursor=0;
    policy=()=>{const proposed=steps[cursor++];return ACTIONS.includes(proposed as Action)?proposed as Action:'abort';};
   }
   const output=await runSandboxScenario(active,policy);
   setResult(output);setBatch(null);
   setMessage(kind==='reference'?'已執行固定腳本自檢，不代表模型通過。':'已依輸入序列離線模擬，未接觸實際工具。');
  }
 }catch(e){setMessage('沙盤未完成：'+(e instanceof Error?e.message:String(e)));}
 finally{setBusy(false);}
}
function download(){
 if(!batch&&!result)return;
 const report={schemaVersion:1,kind:batch?'scripted-reference-batch':'mock-scenario',realModelEvaluated:false,generatedAt:new Date().toISOString(),summary:batch?sandboxSummary(batch):null,results:batch??[result]};
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='detroit-sandbox-mock-report.json';a.click();URL.revokeObjectURL(url);
}
return <section className="detroit-studio-form" aria-label="Detroit 沙盤訓練">
 <h2>Detroit Sandbox · 沙盤演練</h2>
 <p><strong>離線模擬 MVP</strong>：5 領域共 100 個固定情境。所有工具動作只修改記憶體中的模擬狀態；無正式 API、模型權重訓練、真實檔案寫入或雲端存取。</p>
 <p>腳本參考政策的結果<strong>不是</strong> Vanilla／阿土伯的能力分數。可用來驗證沙盤規則、或手動測試外部 Agent 的動作序列。</p>
 <label>分類<select value={domain} onChange={e=>{const value=e.target.value as Domain|'all';setDomain(value);const first=SCENARIOS.find(s=>value==='all'||s.domain===value);if(first)setSelected(first.id);}}>
 <option value="all">全部 100 個</option>{(Object.keys(LABELS) as Domain[]).map(d=><option key={d} value={d}>{LABELS[d]}（20）</option>)}</select></label>
 <label>選擇情境<select value={active.id} onChange={e=>{setSelected(e.target.value);setResult(null);}}>
 {options.map(s=><option key={s.id} value={s.id}>{s.id} · {s.title}</option>)}</select></label>
 <div style={{padding:12,border:'1px solid currentColor',borderRadius:12}}>
 <strong>{LABELS[active.domain]} · {active.title}</strong><p>{active.brief}</p>
 <small>可用模擬動作：{ACTIONS.join(', ')}</small></div>
 <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
 <button type="button" disabled={busy} onClick={()=>void run('reference')}>執行單題腳本自檢</button>
 <button type="button" className="detroit-primary" disabled={busy} onClick={()=>void run('batch')}>執行全部 100 項自檢</button></div>
 <label>手動／外部 Agent 動作序列（每行一個，最多 30）
 <textarea rows={5} spellCheck={false} value={manual} maxLength={1000} onChange={e=>setManual(e.target.value)}/></label>
 <button type="button" disabled={busy||!manual.trim()} onClick={()=>void run('manual')}>執行輸入動作序列</button>
 {message&&<p role="status">{message}</p>}
 {summary&&<div aria-label="沙盤批次結果"><h3>腳本自檢 · {summary.passed}/{summary.total}</h3>
 <p>平均模擬分數 {summary.averageScore}/100 · 注入故障 {summary.injectedFaults} 次 · 模擬安全違規 {summary.safetyViolations} 次</p>
 <ul>{summary.byDomain.map(x=><li key={x.domain}>{LABELS[x.domain]}：{x.passed}/{x.total}</li>)}</ul></div>}
 {result&&<div aria-label="單一沙盤結果"><h3>模擬結果：{result.passed?'完成':'未完成'} · {result.score}/100</h3>
 <p>{result.completedStages}/{result.requiredStages} 階段 · {result.actions} 動作 · 故障 {result.faultsInjected} · 安全違規 {result.safetyViolation?'是':'否'}</p>
 <ol>{result.transcript.map((turn,i)=><li key={i}><strong>{turn.action}</strong> ({turn.outcome}) — {turn.detail}</li>)}</ol></div>}
 {(result||batch)&&<button type="button" onClick={download}>下載 JSON 模擬報告</button>}
 <p><small>真實模型評測需要另外部署隔離的 Agent adapter，只把模擬觀察傳給模型，再將模型提出的動作送回評測器；本版本沒有這個連接。</small></p>
 </section>;
}