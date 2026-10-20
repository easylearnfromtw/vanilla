/** A bounded, progress-sensitive watchdog for model requests.
 * More time is allowed for deeper answers; a stalled stream must not wait forever.
 * The caller owns failure handling and may only fail over to approved models.
 */
export type GenerationLimits={firstProgressMs:number;idleMs:number;totalMs:number};
export const QUALITY_FIRST_LIMITS:GenerationLimits={
 firstProgressMs:240_000,
 idleMs:120_000,
 totalMs:600_000
};
export type GenerationWatchdog={
 signal:AbortSignal;
 progress:(text:string)=>void;
 assertCompleted:()=>void;
 dispose:()=>void;
};
export function createGenerationWatchdog(
 parent?:AbortSignal,
 limits:GenerationLimits=QUALITY_FIRST_LIMITS
):GenerationWatchdog{
 const controller=new AbortController();
 let reason:"initial"|"idle"|"total"|null=null;
 let lastLength=0;
 let idleTimer:ReturnType<typeof setTimeout>|undefined;
 let totalTimer:ReturnType<typeof setTimeout>|undefined;
 const stop=(kind:"initial"|"idle"|"total")=>{
  if(controller.signal.aborted)return;
  reason=kind;
  controller.abort();
 };
 const onParentAbort=()=>controller.abort();
 if(parent?.aborted)onParentAbort();
 else parent?.addEventListener("abort",onParentAbort,{once:true});
 const arm=(ms:number,kind:"initial"|"idle")=>{
  if(idleTimer!==undefined)clearTimeout(idleTimer);
  idleTimer=setTimeout(()=>stop(kind),Math.max(1,ms));
 };
 if(!controller.signal.aborted){
  arm(limits.firstProgressMs,"initial");
  totalTimer=setTimeout(()=>stop("total"),Math.max(1,limits.totalMs));
 }
 return {
  signal:controller.signal,
  progress(text:string){
   if(controller.signal.aborted||text.length<=lastLength)return;
   lastLength=text.length;
   arm(limits.idleMs,"idle");
  },
  assertCompleted(){
   if(reason)throw new Error(
    reason==="initial"?"模型等待太久仍未開始輸出，已安全中止並嘗試可用備援。":
    reason==="idle"?"模型輸出長時間沒有進展，已中止以免無限卡住。":
    "模型生成時間已達安全上限，已中止以免耗盡裝置資源。"
   );
   if(parent?.aborted)throw new DOMException("使用者已停止生成","AbortError");
  },
  dispose(){
   if(idleTimer!==undefined)clearTimeout(idleTimer);
   if(totalTimer!==undefined)clearTimeout(totalTimer);
   parent?.removeEventListener("abort",onParentAbort);
  }
 };
}
/** Reject a non-answer without censoring an honest "不知道" or a brief valid reply. */
export function assertUsableModelAnswer(answer:string):void{
 const cleaned=answer.replace(/<think>[\s\S]*?<\/think>/gi,"").trim();
 if(cleaned.includes("（偵測到模型重複輸出，已自動截斷。"))
  throw new Error("本地模型陷入重複輸出，已停止並嘗試其他可用模型。");
 if(!cleaned||/^[（(]?(?:正在思考|思考中|生成中|載入中|thinking|loading)[….!。！\s）)]*$/i.test(cleaned))
  throw new Error("模型未產生可用的答案，已改為嘗試允許的備援，而非顯示空白回覆。");
}
