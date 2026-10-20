import {useEffect,useState} from 'react';
import {RefreshCw,ShieldCheck,Activity} from 'lucide-react';
import {currentChatMode} from '../local-ai/chat-session';
import {CLIENT_FAULT_EVENT,readClientFaults,downloadClientFaults,clearClientFaults} from './client-diagnostics';
import {LUCA_FEEDBACK_EVENT,readLucaFeedback,summarizeLucaFeedback,downloadLucaFeedback,clearLucaFeedback} from './feedback-journal';
import {weiGuoApiBase,weiGuoIdentity,getWeiGuoLucaSummary,type LucaSnapshot} from '../weiguo/api';
import './luca.css';

export default function LucaPanel(){
 const [report,setReport]=useState<LucaSnapshot|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [localEvents,setLocalEvents]=useState(()=>readClientFaults());
 const [feedback,setFeedback]=useState(()=>readLucaFeedback());
 useEffect(()=>{const refreshLocal=()=>setLocalEvents(readClientFaults());
  window.addEventListener(CLIENT_FAULT_EVENT,refreshLocal);window.addEventListener('storage',refreshLocal);
  return()=>{window.removeEventListener(CLIENT_FAULT_EVENT,refreshLocal);window.removeEventListener('storage',refreshLocal);};
 },[]);
 useEffect(()=>{const update=()=>setFeedback(readLucaFeedback());
  window.addEventListener(LUCA_FEEDBACK_EVENT,update);window.addEventListener("storage",update);
  return()=>{window.removeEventListener(LUCA_FEEDBACK_EVENT,update);window.removeEventListener("storage",update);};
 },[]);
 const feedbackStats=summarizeLucaFeedback(feedback);
 const taskNames:Record<string,string>={casual:"日常",code:"程式",analysis:"分析",writing:"寫作",vision:"視覺",general:"一般"};
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
  <p className="luca-privacy"><ShieldCheck size={17}/>LUCA 將執行異常與人工回答回饋分開紀錄，只儲存受控分類；不蒐集提問、回答正文、模型識別碼或附件，也不自動上傳。</p>
  <section className="luca-local" aria-label="回答品質回饋紀錄">
   <div className="luca-local-heading"><h3>回答品質 · 讚、倒讚、偏好答案</h3><div className="luca-local-actions">
    <button type="button" onClick={()=>setFeedback(readLucaFeedback())} disabled={privateMode}>重新整理</button>
    <button type="button" onClick={()=>downloadLucaFeedback()} disabled={privateMode||!feedback.length}>匯出 JSON</button>
    <button type="button" onClick={()=>{if(window.confirm("確定清除目前帳號在這台裝置的 LUCA 回饋紀錄？這不會清除 NOODLES 或模型偏好。")){clearLucaFeedback();setFeedback(readLucaFeedback());}}} disabled={privateMode||!feedback.length}>清除紀錄</button>
   </div></div>
   {privateMode?<p>私人模式不記錄、讀取或匯出回答品質回饋。</p>:<>
    <p>記錄實際點選的讚、倒讚與雙答案勝出選擇；僅儲存時間、任務類型與模型來源。最近 {feedback.length} 筆，每帳號本機最多 500 筆／90 天；訪客只保留於本分頁。</p>
    <div className="luca-metrics" aria-label="人工回饋摘要">
     <div><span>喜歡</span><strong>{feedbackStats.totals.up}</strong></div>
     <div><span>需要改善</span><strong>{feedbackStats.totals.down}</strong></div>
     <div><span>選擇偏好答案</span><strong>{feedbackStats.totals.chosen}</strong></div>
    </div>
    {feedbackStats.byTask.length?<div className="luca-table-wrap"><table><thead><tr><th>任務類型</th><th>讚</th><th>倒讚</th><th>偏好答案</th></tr></thead><tbody>
     {feedbackStats.byTask.map(item=><tr key={item.task}><th scope="row">{taskNames[item.task]||item.task}</th><td>{item.up}</td><td>{item.down}</td><td>{item.chosen}</td></tr>)}
    </tbody></table></div>:<p>目前還沒有任何人工回答回饋。</p>}
    <details><summary>查看模型來源統計與最近 30 筆回饋</summary>
     <div className="luca-table-wrap"><table><thead><tr><th>模型來源</th><th>讚</th><th>倒讚</th><th>偏好答案</th></tr></thead><tbody>
      {feedbackStats.byProvider.map(item=><tr key={item.provider}><th scope="row">{item.provider}</th><td>{item.up}</td><td>{item.down}</td><td>{item.chosen}</td></tr>)}
     </tbody></table></div>
     <div className="luca-table-wrap"><table><thead><tr><th>時間 (UTC)</th><th>回饋</th><th>任務</th><th>來源</th></tr></thead><tbody>
      {[...feedback].reverse().slice(0,30).map(item=><tr key={item.id}><td>{item.at}</td><td>{item.action==="up"?"讚":item.action==="down"?"倒讚":"偏好答案"}</td><td>{taskNames[item.task]||item.task}</td><td>{item.provider}</td></tr>)}
     </tbody></table></div>
    </details>
    <p className="luca-footnote">這是品質回饋的統計紀錄，不代表模型已經重新訓練。模型偏好仍由原有 NOODLES／模型排序系統負責；不會自動同步到雲端。</p>
   </>}
  </section>
  <section className="luca-local" aria-label="本機異常紀錄">
   <div className="luca-local-heading"><h3>本機異常 · 手機與瀏覽器</h3><div className="luca-local-actions">
    <button type="button" onClick={()=>setLocalEvents(readClientFaults())} disabled={privateMode}>重新整理</button>
    <button type="button" onClick={()=>downloadClientFaults()} disabled={privateMode||!localEvents.length}>匯出 JSON</button>
    <button type="button" onClick={()=>{if(window.confirm("確定刪除目前帳號在這台裝置的 LUCA 異常紀錄？")){clearClientFaults();setLocalEvents(readClientFaults());}}} disabled={privateMode||!localEvents.length}>清除紀錄</button>
   </div></div>
   {privateMode?<p>私人模式不記錄、讀取或匯出本機異常。</p>:<>
    <p>最近 {localEvents.length} 筆 · 每個帳號獨立保留最多 120 筆／30 天；未登入時僅暫存在目前分頁。</p>
    {localEvents.length?<div className="luca-table-wrap"><table><thead><tr><th>時間 (UTC)</th><th>事件 ID</th><th>元件</th><th>操作</th><th>錯誤代碼</th></tr></thead><tbody>
     {[...localEvents].reverse().slice(0,30).map(e=><tr key={e.id}><td>{e.at}</td><td>{e.id}</td><td>{e.component}</td><td>{e.operation}</td><td>{e.code}</td></tr>)}
    </tbody></table></div>:<p>目前尚無已接入錯誤邊界的異常紀錄。</p>}
    <p className="luca-footnote">此區由瀏覽器本機儲存，與衞國的 LUCA_ENABLED 設定無關。匯出不會自動送到 GitHub 或後端。</p>
   </>}
  </section>
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
