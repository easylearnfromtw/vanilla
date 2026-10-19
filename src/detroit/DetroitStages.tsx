import type {DetroitPlan} from "./core";
import "./detroit.css";
/** Compact, expandable execution receipt shown beneath the assistant reply.
 * This displays tool outcomes / phases, not private reasoning tokens.
 */
export default function DetroitStages({plan}:{plan:DetroitPlan|null}){
 if(!plan||plan.depth==="quick")return null;
 const done=plan.stages.filter(x=>x.state==="done"||x.state==="skipped").length;
 const active=plan.stages.find(x=>x.state==="running");
 const error=plan.stages.some(x=>x.state==="error");
 const finished=!active&&plan.stages.every(x=>x.state!=="waiting"&&x.state!=="running");
 return <details className="detroit-stages" aria-label="Detroit 分工進度與操作細節">
  <summary>
   <span className={"detroit-mini-dot"+(active?" is-running":error?" is-error":"")} aria-hidden="true"/>
   <span className="detroit-stage-title">{active?"正在處理："+active.label:error?"部分階段失敗":finished?"已完成任務階段":"執行階段"}</span>
   <small>{done}/{plan.stages.length} · {plan.depth==="deep"?"深入分析":"協作"}</small><span className="detroit-stage-arrow" aria-hidden="true">⌄</span>
  </summary>
  <ol aria-label="實際任務階段">{plan.stages.map(s=><li key={s.engine} className={"phase-"+s.state}><span aria-hidden="true">{s.state==="done"?"✓":s.state==="running"?"◉":s.state==="error"?"!":s.state==="skipped"?"–":"·"}</span><strong>{s.label}</strong><span>{s.detail}</span></li>)}</ol>
  <p>這裡是實際工具與檢查紀錄，不是模型內部思考文字；未執行的階段不算完成。</p>
 </details>;
}
