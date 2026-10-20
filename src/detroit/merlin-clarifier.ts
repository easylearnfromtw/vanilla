/** Merlin clarification gate: no network calls, logging or speculative intent completion.
 * Only intercept clearly underspecified requests. Nuanced ambiguity belongs to the selected
 * model, which is separately instructed to ask one specific follow-up when necessary.
 */
export type MerlinClarificationReason="missing-target"|"missing-material"|"missing-reference"|"missing-action";
export type MerlinClarification={original:string;question:string;reason:MerlinClarificationReason;originId?:string};
export type MerlinClarificationContext={hasContext?:boolean;hasAttachment?:boolean};
export type MerlinClarificationReply={kind:"resolved";prompt:string}|{kind:"retry";question:string}|{kind:"cancel"};

function clarification(original:string,reason:MerlinClarificationReason,question:string):MerlinClarification{
 return {original,reason,question};
}
/** Do not intercept a usable question merely because it is short or informal. */
export function detectMerlinClarification(input:string,ctx:MerlinClarificationContext={}):MerlinClarification|null{
 const original=input.trim();
 if(!original)return null;
 const q=original.replace(/[\s。！!？?：:，,]+$/g,"").trim();
 // Mutating actions must name a concrete target. Prior chat cannot authorize guessing it.
 if(/^(?:(?:請|麻煩|可以|幫我|請幫我)\s*)?(?:(?:把|將)\s*)?(?:(?:這個|那個|它|檔案|文件|資料|專案)\s*)?(?:刪除|刪掉|移除|清空|覆蓋|重設)(?:\s*(?:這個|那個|它|檔案|文件|資料|專案))?$/.test(q)){
  return clarification(original,"missing-target","你要對哪個具體檔案、資料或項目執行這個操作？請提供名稱或位置。");
 }
 if(ctx.hasAttachment||ctx.hasContext)return null;
 if(/^(?:這個|那個|它|上面那個|剛剛那個|同上|繼續|接著做|照做|再來|看一下|看看)$/.test(q)){
  return clarification(original,"missing-reference","你指的是哪個內容或任務？請補充對象或貼上相關內容。");
 }
 if(/^(?:(?:請|麻煩|幫我|請幫我)\s*)?(?:翻譯|摘要|總結|潤稿|改寫|校對|優化(?:這段)?(?:\s*(?:prompt|提示詞))?)(?:一下|這段|這篇|這份|這個|文字|內容|文章|文件|成英文|成中文|成繁體中文)?$/i.test(q)){
  return clarification(original,"missing-material","你要處理哪段文字或文件？請貼上內容或附上檔案。");
 }
 if(/^(?:(?:請|麻煩|幫我|請幫我)\s*)?(?:分析|比較|評估|解釋|整理)(?:一下|這個|那個|這份|它)?$/.test(q)){
  return clarification(original,"missing-material","你想讓我分析或整理哪個主題、資料或文件？");
 }
 if(/^(?:(?:請|麻煩|幫我|請幫我)\s*)?(?:做|處理|看一下|看看|修改|修一下|修復|改一下|幫忙)(?:一下)?$/.test(q)){
  return clarification(original,"missing-action","你希望我具體完成什麼？請描述要處理的對象及預期結果。");
 }
 return null;
}
/** Resolve one human answer, without treating the answer as permission for dangerous writes. */
export function resolveMerlinClarification(pending:MerlinClarification,answer:string):MerlinClarificationReply{
 const reply=answer.trim();
 if(/^(?:取消|不用了|算了|停止|cancel|never mind)[。！!\s]*$/i.test(reply))return {kind:"cancel"};
 if(!reply||/^(?:不知道|不清楚|不確定|沒說|這個|那個|它|一樣|隨便|都可以|你決定|再看看)[。！!？?\s]*$/.test(reply)){
  return {kind:"retry",question:"我還缺少必要資訊。"+pending.question};
 }
 return {kind:"resolved",prompt:"原始需求：\n"+pending.original+"\n\nMerlin 追問："+pending.question+"\n使用者補充："+reply+"\n\n請以原始需求和補充資訊一起判斷下一步；不得把補充回答視為刪除、付費、上傳或修改權限的同意。"};
}
