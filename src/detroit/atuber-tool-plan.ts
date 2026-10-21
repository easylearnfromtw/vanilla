/**
 * October / 阿土伯 Phase-2 explicit read-only tool intent.
 * No model output, untrusted document or web result can itself be a tool plan.
 * The host authorizes and executes only these bounded, deterministic inputs.
 */
export type AtuberReadOnlyPlan=
 |{policy:"atuber-receipt-v1";source:"explicit-user";capability:"cream";csv:string}
 |{policy:"atuber-receipt-v1";source:"explicit-user";capability:"detroit-status"}
 |{policy:"atuber-receipt-v1";source:"explicit-user";capability:"five-d-shadow";subject:string};

const PREFIX=/^(?:[@＠])?(?:阿土伯|Atuber|October)[\s：:,，]+([\s\S]*)$/i;
const STATS=/^(?:分析|統計|計算|驗算)\s*(?:這份|以下|這段)?\s*CSV(?:\s*資料)?\s*[:：\n\r\s]*([\s\S]*)$/i;
const STATUS=/^(?:(?:檢查|查看|查詢|列出|顯示)\s*)?(?:(?:所有|目前|現有|已連接|可用)\s*)?(?:Detroit\s*)?(?:工具|能力)(?:\s*(?:狀態|清單|列表|可用性))?$/i;
const SHADOW=/^(?:五維|5D)\s*(?:唯讀|影子)?\s*(?:評估|分析|測試|路由)\s*[:：\s]+([\s\S]*)$/i;

/** Returns null instead of guessing for unsupported, ambiguous, destructive or cloud actions. */
export function planAtuberReadOnly(question:string):AtuberReadOnlyPlan|null{
 if(typeof question!=="string"||!question||question.length>13000)return null;
 const prefix=PREFIX.exec(question.trim());
 if(!prefix)return null;
 const task=prefix[1].trim();
 if(STATUS.test(task))return {policy:"atuber-receipt-v1",source:"explicit-user",capability:"detroit-status"};
 const st=STATS.exec(task);
 if(st){
  const csv=st[1].trim();
  if(csv.length<6||csv.length>12000||!csv.includes("\n"))return null;
  return {policy:"atuber-receipt-v1",source:"explicit-user",capability:"cream",csv};
 }
 const five=SHADOW.exec(task);
 if(five){
  const subject=five[1].trim();
  if(subject.length<2||subject.length>800)return null;
  return {policy:"atuber-receipt-v1",source:"explicit-user",capability:"five-d-shadow",subject};
 }
 return null;
}
