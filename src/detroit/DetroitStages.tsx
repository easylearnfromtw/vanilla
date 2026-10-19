import type {DetroitPlan} from "./core";
import "./detroit.css";
/** Shows observable work phases, not hidden model tokens or private reasoning. */
export default function DetroitStages({plan}:{plan:DetroitPlan|null}){
 if(!plan||plan.depth==="quick")return null;
 const done=plan.stages.filter(x=>x.state==="done"||x.state==="skipped").length;
 const active=plan.stages.find(x=>x.state==="running");
 return <details className="detroit-stages" open>
  <summary><strong>DETROIT · {plan.depth==="deep"?"深度分析":"協作處理"}</strong><span>{active?active.label+"："+active.detail:done+" / "+plan.stages.length+" 階段"}</span></summary>
  <ol aria-label="Vanilla Detroit 任務階段">{plan.stages.map(s=><li key={s.engine} className={"phase-"+s.state}><span className="phase-symbol" aria-hidden="true">{s.state==="done"?"✓":s.state==="running"?"◉":s.state==="error"?"!":"·"}</span><strong>{s.label}</strong><span>{s.detail}</span></li>)}</ol>
  <p>僅顯示可查核的操作階段與結果，不顯示模型私有思考內容。未執行的工具不算完成。</p>
 </details>;
}
