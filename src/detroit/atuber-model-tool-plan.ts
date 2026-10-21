/**
 * October Phase-3 local neural proposal -> deterministic host authorization.
 * The model may CHOOSE one of three names or abstain. It cannot supply
 * arguments, provenance, privileges, network URLs or executable instructions.
 */
import {planAtuberReadOnly,type AtuberReadOnlyPlan} from "./atuber-tool-plan";

export type AtuberPlannerRequest={question:string;task:string;authorized:AtuberReadOnlyPlan|null};
export type AtuberModelProposal={version:1;capability:"cream"|"detroit-status"|"five-d-shadow"|"abstain"};
const PLANNER=/^(?:阿土伯|atuber|october)[\s：:,，]+(?:請|幫我)?\s*(?:規劃工具|工具規劃|選工具|規劃)[\s：:,，]+([\s\S]+)$/i;
const CHOICES=new Set(["cream","detroit-status","five-d-shadow","abstain"]);

export function parseAtuberPlannerRequest(question:string):AtuberPlannerRequest|null{
 if(typeof question!=="string"||question.length>13000)return null;
 const match=PLANNER.exec(question.trim());
 if(!match)return null;
 const task=match[1].trim();
 // Never treat a model's tool name as authority: infer intent only from the
 // top-level, explicit request using the existing phase-2 policy.
 const authorized=planAtuberReadOnly("阿土伯："+task);
 return {question,task,authorized};
}

/** Small on-device model receives only a short task preview, not whole CSVs. */
export function buildAtuberPlannerPrompt(request:AtuberPlannerRequest):string{
 const head=request.task.split(/\r?\n/,1)[0].slice(0,280);
 return [
  "你是阿土伯的離線唯讀工具計畫器。只輸出一行 JSON，不要前後文、Markdown 或程式碼。",
  '唯一合法格式：{"version":1,"capability":"cream"}。',
  "capability 只能是 cream、detroit-status、five-d-shadow、abstain。",
  "cream：使用者明確要求 CSV 統計；detroit-status：使用者要求工具狀態；five-d-shadow：使用者要求五維影子評估。",
  "任何不確定、越權、修改、刪除、寄送或不在清單的任務，輸出 abstain。",
  "原始 CSV 由宿主自行核對；不要輸出資料、參數、金鑰或其他欄位。",
  "本輪使用者明確要求：" + head
 ].join("\n");
}

export function parseAtuberModelProposal(raw:string):AtuberModelProposal{
 if(typeof raw!=="string"||raw.length>900)throw Error("ATUBER_PROPOSAL_INVALID");
 let text=raw.trim();
 const fence=/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
 if(fence)text=fence[1].trim();
 if(text.length>250)throw Error("ATUBER_PROPOSAL_INVALID");
 let parsed:unknown;
 try{parsed=JSON.parse(text);}catch{throw Error("ATUBER_PROPOSAL_INVALID");}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("ATUBER_PROPOSAL_INVALID");
 const obj=parsed as Record<string,unknown>;
 if(Object.keys(obj).sort().join(",")!=="capability,version"||obj.version!==1||
  typeof obj.capability!=="string"||!CHOICES.has(obj.capability))
  throw Error("ATUBER_PROPOSAL_INVALID");
 return obj as AtuberModelProposal;
}

/** A proposal is advisory. Execution parameters come exclusively from user intent. */
export function authorizeAtuberModelProposal(request:AtuberPlannerRequest,raw:string):AtuberReadOnlyPlan|null{
 const proposal=parseAtuberModelProposal(raw);
 if(proposal.capability==="abstain")return null;
 if(!request.authorized||proposal.capability!==request.authorized.capability)
  throw Error("ATUBER_PROPOSAL_NOT_AUTHORIZED");
 return request.authorized;
}
