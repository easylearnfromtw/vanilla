import {useEffect,useMemo,useRef,useState} from "react";
import {getLoadedLocalModel,isLocalModelReady} from "../../local-ai/engine";
import {currentChatMode} from "../../local-ai/chat-session";
import {generateCandidate,listCandidates,type ModelCandidate} from "../../ai/model-orchestrator";
import {allowedTools,apply,grade,oracle,parseAction,replay,scenarios,start,type Grade,type Scenario,type State} from "./core";
import {challengePrompt,judgeHeadToHead,trainingFeedback} from "./contest";

/** No real tools/credentials. An explicit user action invokes one existing model at a time. */
export default function SandboxPanel(){
 const cases=useMemo(()=>scenarios(),[]);
 const [caseId,setCaseId]=useState(cases[0].id);
 const [selectedModel,setSelectedModel]=useState("");
 const [cloudConsent,setCloudConsent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [report,setReport]=useState<Grade|null>(null);
 const [batch,setBatch]=useState<Grade[]|null>(null);
 const [kind,setKind]=useState<"model"|"oracle"|null>(null);
 const [modelState,setModelState]=useState<State|null>(null);
 const [externalState,setExternalState]=useState<State|null>(null);
 const [externalAction,setExternalAction]=useState("");
 const [externalStatus,setExternalStatus]=useState("");
 const [coached,setCoached]=useState(false);
 const [baseline,setBaseline]=useState<Grade|null>(null);
 const stop=useRef<AbortController|null>(null);
 useEffect(()=>()=>stop.current?.abort(),[]);
 const chosen=cases.find(x=>x.id===caseId)||cases[0];
 const privateMode=currentChatMode()==="private";
 const models=listCandidates({localReady:isLocalModelReady(),localModel:getLoadedLocalModel()||"",
  image:false,online:typeof navigator!=="undefined"?navigator.onLine:false,privateMode});
 const active=selectedModel?models.find(x=>x.id===selectedModel):models[0];
 const extState=externalState?.id===chosen.id?externalState:start(chosen);
 const comparison=kind==="model"&&!coached&&modelState?.id===chosen.id&&externalState?.id===chosen.id?judgeHeadToHead(chosen,modelState,externalState):null;
 function saveReport(){
  if(!report&&!batch)return;
  const safe={kind,model:kind==="model"?active?.id:null,generatedAt:new Date().toISOString(),report,batch};
  const blob=new Blob([JSON.stringify(safe,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download="detroit-sandbox-report.json";a.click();URL.revokeObjectURL(url);
 }
 function testOracle(){
  if(busy)return;
  const grades=cases.map(x=>replay(x,oracle(x)));
  setKind("oracle");setModelState(null);setBatch(grades);setReport(grades.find(x=>x.id===chosen.id)||null);
  setStatus("已執行 100 筆參考腳本。這只驗證模擬器，並非 AI 模型的成績。");
 }
 async function testModel(feedback=""){
  const previous=report?.id===chosen.id&&kind==="model"?report:null;
  if(busy||!active)return;
  if(privateMode&&active.source!=="local"){setStatus("私人模式僅允許本機模型");return;}
  if(active.source!=="local"&&!cloudConsent){setStatus("遠端模型需要明確同意呼叫");return;}
  const c:Scenario=chosen;const candidate:ModelCandidate=active;
  const abort=new AbortController();stop.current=abort;
  setBusy(true);setCoached(Boolean(feedback));setBaseline(feedback?previous:null);setKind("model");setModelState(null);setBatch(null);setReport(null);setStatus("模型演練中：最多 9 次模型決策，每次只操作虛擬工具。");
  let state=start(c);
  try{
   for(let turn=0;turn<9&&!state.completed;turn++){
    if(abort.signal.aborted)throw Error("已取消演練");
    const prompt=challengePrompt(c,state)+(feedback?"\n額外練習提示（僅此輪、不可取代工具回報）："+feedback:"");
    const answer=await generateCandidate(candidate,[{role:"user",content:prompt}],undefined,undefined,
     {task:c.category==="engineering"?"code":"general",privateMode,signal:abort.signal});
    let tool:string;
    try{tool=parseAction(answer);}
    catch(error){tool="invalid_model_json";setStatus("模型輸出無效，已安全拒絕該動作："+String(error));}
    if(abort.signal.aborted)throw Error("已取消演練");
    state=apply(c,state,tool);
    setModelState(state);
    setReport(grade(c,state));
   }
   const result=grade(c,state);setReport(result);
   setStatus(result.pass?"模型完成沙盤情境；此成績只代表本情境。":"模型未通過沙盤；請檢查動作紀錄。");
  }catch(error){
   setModelState(state);
   setReport(grade(c,state));setStatus("演練中止："+String(error instanceof Error?error.message:error));
  }finally{
   if(stop.current===abort)stop.current=null;
   setBusy(false);
  }
 }
 return <section className="detroit-studio-form" aria-label="Detroit AI 沙盤">
  <h2>Simulation Lab · AI 沙盤訓練</h2>
  <p>100 筆參數化虛擬情境，涵蓋工程、協作、資安、故障恢復與決策。工具、檔案與授權均為模擬，不會存取真實 Google Drive、GitHub 或金鑰。</p>
  <p><strong>演練並非微調：</strong>模型做出工具選擇，模擬器驗證結果。此處不會修改模型權重或自動新增 NOODLES 訓練樣本。</p>
  <label>測試情境
   <select value={caseId} disabled={busy} onChange={e=>{setCaseId(e.target.value);setReport(null);setModelState(null);setCoached(false);setBaseline(null);setExternalState(null);setExternalAction("");setExternalStatus("");setBatch(null);setStatus("");}}>
    {cases.map(c=><option key={c.id} value={c.id}>{c.id} · {c.title}</option>)}
   </select>
  </label>
  <p><strong>任務：</strong>{chosen.task}</p>
  <p><strong>允許的虛擬工具：</strong>{allowedTools(chosen).join(" / ")}。故障類型不事先揭露，雙方透過工具回報判斷。</p>
  <button type="button" disabled={busy} onClick={testOracle}>執行 100 筆參考腳本（非 AI）</button>
  <hr/>
  <label>用來測試的實際模型
   <select value={active?.id||""} disabled={busy||models.length===0} onChange={e=>{setSelectedModel(e.target.value);setCloudConsent(false);}}>
    {models.length===0?<option value="">尚無可用模型</option>:models.map(m=><option key={m.id} value={m.id}>{m.label} · {m.location}</option>)}
   </select>
  </label>
  {active?.source!=="local"&&active&&<label className="detroit-consent"><input type="checkbox" checked={cloudConsent} disabled={busy} onChange={e=>setCloudConsent(e.target.checked)}/>我同意本次將純合成沙盤情境及工具軌跡傳送至選定模型，並了解可能計費。</label>}
  <p>AI 演練每次只跑 1 筆情境，最多 9 回合。需先安裝並載入本機模型，或自行設定有權使用的遠端模型。演練不是未經授權的背景訓練。</p>
  <button type="button" className="detroit-primary" disabled={busy||!active||(active.source!=="local"&&!cloudConsent)}
   onClick={()=>void testModel()}>讓 {active?.label||"AI"} 實際演練此情境</button>
  {kind==="model"&&report&&!report.pass&&<button type="button" disabled={busy||!active||(active.source!=="local"&&!cloudConsent)} onClick={()=>void testModel(trainingFeedback(chosen,report))}>依失敗回饋重試一次（本回合提示訓練）</button>}
  {busy&&<button type="button" onClick={()=>stop.current?.abort()}>停止模型演練</button>}
  <p role="status">{status}</p>
  {batch&&<p>模擬器參考腳本：{batch.filter(x=>x.pass).length}/{batch.length} 通過。<strong>不是 AI 模型成績。</strong></p>}
  {report&&<section aria-label="沙盤成績">
   <h3>{kind==="oracle"?"參考腳本驗證":"AI 沙盤結果"} · {report.id}</h3>
   <p><strong>{report.score}/100</strong> · {report.pass?"通過":"未通過"} · 步數 {report.steps} · 虛擬故障 {report.faults} · 阻擋 {report.blocked}</p>
   <ol>{report.trace.map((e,i)=><li key={i}><strong>{e.tool}</strong> · {e.status} · {e.message}</li>)}</ol>
  </section>}
  {coached&&baseline&&report&&<p><strong>同題提示重試：</strong>原分數 {baseline.score}、目前 {report.score}；這是看過回饋後的同題訓練，不算獨立泛化能力，也不列入未提示的 Claude 對照成績。</p>}
  {kind==="model"&&report&&<p><strong>本輪改善診斷：</strong>{trainingFeedback(chosen,report)}。這是工作流程回饋，不會改變模型權重。</p>}
  <section aria-label="Claude 外部對戰" className="detroit-wordcraft">
   <h3>Claude 對戰 · 相同沙盤與逐回合回饋</h3>
   <p>這裡不直接呼叫 Claude API。將下方每回合題目交給 Claude，再將它回傳的單一步驟 JSON 貼回來。外部模型身分無法驗證，分數不得視為官方認證比較。</p>
   <label>目前給 Claude 的下一回合題目
    <textarea readOnly rows={8} value={extState.completed?"情境已完成，請重置外部對戰。":challengePrompt(chosen,extState)}/>
   </label>
   <button type="button" disabled={busy||extState.completed||extState.trace.length>=12} onClick={()=>{if(!navigator.clipboard?.writeText){setExternalStatus("此瀏覽器不支援自動複製，請手動選取上方文字。");return;}void navigator.clipboard.writeText(challengePrompt(chosen,extState)).then(()=>setExternalStatus("已複製同一份沙盤題目。")).catch(()=>setExternalStatus("複製失敗，請手動選取文字。"));}}>複製題目給 Claude</button>
   <label>貼上 Claude 本回合的 JSON 工具動作
    <textarea rows={2} maxLength={20000} disabled={busy||extState.completed||extState.trace.length>=12} value={externalAction} onChange={e=>setExternalAction(e.target.value)} placeholder={'{"tool":"inspect"}'}/>
   </label>
   <button type="button" disabled={busy||extState.completed||extState.trace.length>=12||!externalAction.trim()} onClick={()=>{
    try{
     const tool=parseAction(externalAction);
     const next=apply(chosen,extState,tool);
     setExternalState(next);setExternalAction("");setExternalStatus("已模擬執行 "+tool+"；請將下一回合題目與結果交給 Claude。");
    }catch(e){setExternalStatus("JSON 無效，未執行任何工具："+String(e instanceof Error?e.message:e));}
   }}>提交此回合動作</button>
   <button type="button" disabled={busy} onClick={()=>{setExternalState(null);setExternalAction("");setExternalStatus("已重置外部對戰紀錄。");}}>重置 Claude 對戰</button>
   <p role="status">{externalStatus}</p>
   <p>外部動作：{extState.trace.length}/12；目前分數：{grade(chosen,extState).score}/100；完成：{extState.completed?"是":"否"}</p>
   {extState.trace.length>0&&<ol>{extState.trace.map((e,i)=><li key={i}><strong>{e.tool}</strong> · {e.status} · {e.message}</li>)}</ol>}
   {comparison&&<p><strong>同題比較：</strong>Vanilla {comparison.left.score} 分，外部提交 {comparison.right.score} 分；{comparison.verdict==="left"?"Vanilla 暫時領先":comparison.verdict==="right"?"外部提交暫時領先":"目前平手"}。{comparison.caveat}</p>}
  </section>
  {(report||batch)&&<button type="button" onClick={saveReport}>下載無私密內容的 JSON 成績單</button>}
  <p>安全界線：只模擬結果；工具呼叫為 TypeScript 狀態轉換，不執行 shell、網路請求或正式寫入。模型輸出只允許白名單 JSON 工具名稱。</p>
 </section>;
}
