import {useEffect,useState} from 'react';
import {RefreshCw,ShieldCheck,Activity} from 'lucide-react';
import {currentChatMode} from '../local-ai/chat-session';
import {weiGuoApiBase,weiGuoIdentity,getWeiGuoLucaSummary,type LucaSnapshot} from '../weiguo/api';
import './luca.css';

export default function LucaPanel(){
 const [report,setReport]=useState<LucaSnapshot|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const connected=Boolean(weiGuoApiBase()&&weiGuoIdentity()?.role==='owner');
 const privateMode=currentChatMode()==='private';
 async function refresh(){
  if(privateMode){setError('私人模式不連線至後端。');return;}
  if(!connected){setError('請先至衞國系統登入 owner 帳號，並部署後端。');return;}
  setBusy(true);setError('');
  try{setReport(await getWeiGuoLucaSummary());}
  catch(e){setReport(null);setError(e instanceof Error?e.message:'LUCA 讀取失敗');}
  finally{setBusy(false);}
 }
 useEffect(()=>{if(!privateMode&&connected)void refresh();},[]);
 const maxDaily=Math.max(1,...(report?.daily.map(x=>x.count)||[]));
 return <section className="detroit-studio-form luca-panel">
  <div className="luca-heading"><div><h2>LUCA <small>/ SYSTEM OBSERVABILITY</small></h2>
   <p>Detroit 後端的錯誤率、耗時與執行軌跡摘要，提供 CREAM 可分析的結構化資料。</p></div>
   <button type="button" onClick={()=>void refresh()} disabled={busy||privateMode||!connected}><RefreshCw size={16}/>{busy?'讀取中':'重新整理'}</button></div>
  <p className="luca-privacy"><ShieldCheck size={17}/>只記錄後端事件的固定名稱、狀態與耗時；不讀取對話內容、登入資訊或原始網址。</p>
  {privateMode&&<p role="status">私人模式：LUCA 遠端總覽已停用。</p>}
  {!connected&&!privateMode&&<p role="status">目前無法讀取 LUCA。請先於衞國登入家庭 owner，並確認已設定安全 HTTPS 後端。</p>}
  {error&&<p role="alert">{error}</p>}
  {report&&!report.enabled&&<p role="status">LUCA 尚未啟用。管理端設定 LUCA_ENABLED=true 並重新部署後才會開始收集後端事件。</p>}
  {report?.enabled&&<>
   <div className="luca-metrics" aria-label="LUCA 系統概況">
    <div><span>最近事件</span><strong>{report.count.toLocaleString()}</strong></div>
    <div><span>非成功回應</span><strong>{report.failures.toLocaleString()}</strong></div>
    <div><span>平均延遲</span><strong>{report.averageMs} ms</strong></div>
    <div><span>P95 延遲</span><strong>{report.p95Ms} ms</strong></div>
   </div>
   <h3><Activity size={17}/>模組效能</h3>
   {report.components.length?<div className="luca-table-wrap"><table><thead><tr><th>模組</th><th>次數</th><th>非成功</th><th>平均耗時</th></tr></thead>
    <tbody>{report.components.map(c=><tr key={c.name}><th scope="row">{c.name}</th><td>{c.count}</td><td>{c.failures}</td><td>{c.averageMs} ms</td></tr>)}</tbody></table></div>:<p>尚無後端操作紀錄。</p>}
   <h3>CREAM · 最近 14 日請求趨勢</h3>
   {report.daily.length?<div className="luca-daily">{report.daily.map(day=><div className="luca-daily-row" key={day.day}>
    <time dateTime={day.day}>{day.day}</time><div className="luca-bar-track"><div className="luca-bar" style={{width:(day.count/maxDaily*100)+'%'}}/></div>
    <span>{day.count} 次 / {day.failures} 非成功</span></div>)}</div>:<p>尚無持久化日統計；LUCA_DB 可在後端啟用本地 SQLite 彙總。</p>}
   {!!report.recommendations.length&&<div className="luca-suggestions"><h3>診斷提示</h3>{report.recommendations.map(item=><p key={item}>{item}</p>)}</div>}
   <details><summary>查看最近安全事件（最多 30 筆）</summary><div className="luca-table-wrap"><table><thead><tr><th>時間 (UTC)</th><th>元件</th><th>動作</th><th>HTTP</th><th>耗時</th></tr></thead><tbody>
    {report.events.map((item,i)=><tr key={i}><td>{item.at}</td><td>{item.component}</td><td>{item.operation}</td><td>{item.status}</td><td>{item.durationMs} ms</td></tr>)}
   </tbody></table></div></details>
   <p className="luca-footnote">最近事件僅限目前後端程序的記憶體（最多 300 筆），重啟會重設；{report.persistent?'每日彙總保留於後端 SQLite。':'未啟用 SQLite 持久化。'}不涵蓋手機端與其他尚未接入 LUCA 的服務。</p>
  </>}
 </section>;
}
