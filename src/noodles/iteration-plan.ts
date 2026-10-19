import type {NoodlesState,NoodlesTask,NoodlesIssue} from "./core.ts";
export type IterationPlan={task:NoodlesTask;issue:NoodlesIssue;count:number;path:string;idea:string;reason:string};
/** Convert repeated, user-confirmed failures to concrete reviewable code proposals.
 * This does not execute or merge code, and never includes private chat content.
 */
const mapping:Record<NoodlesIssue,{path:string;idea:string}>={
 incorrect:{path:"src/ai/model-orchestrator.ts",idea:"Improve cross-model reliability/accuracy routing using confidence-shrunk feedback, without altering consent and private mode."},
 no_sources:{path:"src/search/live-search.ts",idea:"Improve sourced web research and reference quality checks without inventing citations or bypassing web permissions."},
 too_long:{path:"src/noodles/core.ts",idea:"Improve feedback-guided concise answer instructions, preserving user-requested detail and evidence."},
 too_short:{path:"src/noodles/core.ts",idea:"Improve answer completeness guidance based on explicit user feedback, without sacrificing precision."},
 bad_format:{path:"src/local-ai/ChatMarkdown.tsx",idea:"Improve safe chat formatting and accessibility; prevent duplicated Markdown tables and unsupported raw HTML."},
 tool_failure:{path:"src/assistant/intent-router.ts",idea:"Improve deterministic tool-intent routing and realistic tool success messages while retaining consent boundaries."}
};
export function noodlesIterationPlans(state:NoodlesState):IterationPlan[]{
 if(!state.enabled)return [];
 const map=new Map<string,{task:NoodlesTask;issue:NoodlesIssue;count:number}>();
 for(const o of state.observations){
  if(o.kind!=="issue"||!o.issue)continue;
  const key=o.task+":"+o.issue,old=map.get(key);
  map.set(key,{task:o.task,issue:o.issue,count:(old?.count||0)+1});
 }
 return [...map.values()].filter(x=>x.count>=2).sort((a,b)=>b.count-a.count).slice(0,4).map(x=>({
  ...x,path:mapping[x.issue].path,
  idea:mapping[x.issue].idea,
  reason:x.count+" 次同類任務的明確使用者問題標記（"+x.task+"／"+x.issue+"）"
 }));
}
