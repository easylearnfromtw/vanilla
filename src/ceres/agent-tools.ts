/** Ceres's SECOND Detroit entrypoint.
 * Strictly text and read-only foreground capabilities; no unattended privileges.
 */
import {parseDianaInvocation,chooseDianaTool,dianaCatalog} from "../detroit/diana";
import {creamInstruction,parseCreamCSV,analyzeCream,summarizeCream} from "../cream/core";
import {readPublicPage,linkReadingIntent} from "../search/web-reader";
import {inspectExternalText} from "../security/trust-boundary";
import {generateCeresDraft} from "./ai-draft";
import type {ModelCandidate} from "../ai/model-orchestrator";

export const CERES_FOREGROUND_TOOL_IDS=["diana","cream","scouts","er-ya","merlin"] as const;
export type AgentTool="diana"|"cream"|"scouts"|"erya"|"merlin"|"none";
export type AgentReply={text:string;tool:AgentTool};
function bounded(text:string):string{
 const result=text.trim();
 if(!result)throw Error("Detroit 沒有產生可回覆的文字");
 return result.slice(0,1150);
}
const actionRequest=/(?:刪除|刪掉|移除|覆寫|修改|寫入|推送|合併|部署|安裝|寄出|傳送|付款|轉帳|購買|執行程式|修改權限|重設密碼|delete|deploy|install|execute|run code|push|commit|merge|send email)/i;

export async function answerFromCeres(
 message:string,model:ModelCandidate,signal?:AbortSignal
):Promise<AgentReply>{
 if(model.source!=="local")throw Error("Ceres 前景橋接僅使用目前裝置的本地 WebLLM 模型");
 if(!message.trim()||message.length>4000)throw Error("Telegram 訊息不存在或超出限制");
 if(inspectExternalText(message,"tool").blocked)throw Error("Athena 已攔截外部訊息的提示詞注入內容");
 const invocation=parseDianaInvocation(message);
 const task=(invocation?.request||message).trim();
 const forced=invocation?.forcedTool??null;
 if(forced==="diana"||/^(?:help|工具清單|有哪些工具|所有工具|可用工具|列出工具)$/i.test(task))
  return {text:bounded(dianaCatalog()),tool:"diana"};
 // Prevent high-impact actions from being reframed as ordinary model requests.
 if(actionRequest.test(task))
  return {text:"這項任務需要在 Vanilla 的原工具中完成授權。Telegram 可以查看建議，但不能自行修改檔案、部署程式、寄信、付款或執行管理操作。",tool:"diana"};

 const plan=chooseDianaTool(task,{
  privateMode:false,hasCreamResult:false,online:navigator.onLine,hasModel:true
 },forced);
 const csv=creamInstruction(task);
 if(csv){
  const report=analyzeCream(parseCreamCSV(csv.csv,"Telegram 訊息"),csv.kind);
  return {text:bounded(summarizeCream(report)),tool:"cream"};
 }
 if(plan.tool==="scouts"||forced==="scouts"){
  const url=linkReadingIntent(task)||(/^https:\/\/\S+$/.test(task)?task:null);
  if(!url)return {text:"Scouts：請提供公開 HTTPS 網址供我唯讀分析。多網站搜尋請到 Vanilla 的 Scouts 工作台。",tool:"scouts"};
  const page=await readPublicPage(url);
  const summary=await generateCeresDraft(model,
   "請根據這份已讀取的公開網頁摘錄簡短回答。不可假裝閱讀其他來源。標題："+page.title+"；網址："+page.url+"；摘錄："+page.text.slice(0,1600),
   "natural",signal);
  return {text:bounded("Scouts｜"+page.title+"\n"+summary+"\n來源："+page.url),tool:"scouts"};
 }
 if(plan.tool==="er-ya"||forced==="er-ya"){
  const polished=await generateCeresDraft(model,"請潤飾以下文字，保留原意與數值："+task,"natural",signal);
  return {text:bounded(polished),tool:"erya"};
 }
 if(plan.kind==="open"||plan.kind==="report"&&plan.tool!=="merlin")
  return {text:bounded(plan.message||plan.label+" 需要在 Vanilla 工作台開啟或另行確認。"),tool:"diana"};
 // Merlin → Zeus: text-only local inference, no file attachments, family memory or tool privileges.
 return {text:bounded(await generateCeresDraft(model,task,"natural",signal)),tool:"merlin"};
}
