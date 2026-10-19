import {CheckCircle2,Clock3,AlertCircle,ThumbsUp} from "lucide-react";
import type {ModelCandidate,TaskKind} from "./model-orchestrator";
import SwipeDeck from "../local-ai/SwipeDeck";
import ChatMarkdown from "../local-ai/ChatMarkdown";
export type ComparisonAnswer={
 candidate:ModelCandidate;
 status:"running"|"done"|"error";
 text:string;
 error?:string;
};
export type ComparisonSession={
 question:string;
 task:TaskKind;
 options:ComparisonAnswer[];
};
type Props={
 comparison:ComparisonSession;
 onChoose:(id:string)=>void;
 onCancel:()=>void;
};
export default function CompareAnswers({comparison,onChoose,onCancel}:Props){
 const done=comparison.options.filter(x=>x.status==="done"&&x.text);
 const pending=comparison.options.some(x=>x.status==="running");
 const cards=comparison.options.map((item,i)=>({
  id:item.candidate.id,label:item.candidate.label,node:
   <article className={"compare-card "+(item.status==="error"?"is-error":"")}>
    <div className="compare-card-top"><span className="compare-letter">{String.fromCharCode(65+i)}</span><div><strong>{item.candidate.label}</strong><small>{item.candidate.location} · {item.candidate.note}</small></div></div>
    <div className="compare-card-body">
     {item.status==="running"&&!item.text?<div className="compare-loading"><Clock3 size={16}/>模型正在生成…</div>:null}
     {item.status==="error"?<div className="compare-error"><AlertCircle size={16}/>{item.error||"產生失敗"}</div>:null}
     {item.text&&<div className="compare-text"><ChatMarkdown source={item.text}/></div>}
     {item.status==="done"&&<div className="compare-finished"><CheckCircle2 size={14}/>已完成回答</div>}
    </div>
    <div className="compare-card-footer">
     <button type="button" disabled={pending||item.status!=="done"} onClick={()=>onChoose(item.candidate.id)}>
      <ThumbsUp size={15}/>選擇答案 {String.fromCharCode(65+i)}
     </button>
    </div>
   </article>
 }));
 return <section className="compare-answers" aria-label="AI 雙答案比較">
  <div className="compare-heading"><div><span className="compare-eyebrow">VANILLA / MODEL DUEL</span><h3>比較兩種 AI 回答</h3><p>桌面並排、手機左右滑動切換。選擇較好的答案後，Vanilla 會調整本機模型偏好。</p></div><span className="compare-count">{done.length}/{comparison.options.length} 完成</span></div>
  <SwipeDeck items={cards} label="雙模型回答"/>
  <div className="compare-bottom">
   <p>{pending?"正在等待模型，完成後即可選擇。":done.length?"只會將選中的回答加入聊天歷史，其他候選不會保留在對話紀錄。":"兩個模型均無法回答，可取消並重新選擇模型。"}</p>
   <button type="button" disabled={pending} onClick={onCancel}>{pending?"正在生成，完成後可返回":"不選擇，返回聊天"}</button>
  </div>
 </section>;
}
