/** Scouts auto-dispatch for research requests that the command router did not match.
 * A Detroit stage is a plan, never proof that the network tool has executed.
 * Only enable this fallback for a user's short, ordinary public-research question;
 * never send attachments, pasted/quoted material, private chat or local-only requests.
 */
import {merlinParse} from "../detroit/core";

export type ScoutsAutoContext={
 routeKind:string;
 autoResearchEnabled:boolean;
 privateMode:boolean;
 hasAttachment:boolean;
 hasImage:boolean;
};
export function shouldAutoRunScouts(question:string,ctx:ScoutsAutoContext):boolean{
 if(ctx.routeKind!=="continue"||!ctx.autoResearchEnabled||ctx.privateMode||ctx.hasAttachment||ctx.hasImage)return false;
 const q=question.trim();
 if(q.length<8||q.length>260||/https?:\/\//i.test(q))return false;
 if(/(?:不要上網|不需搜尋|不需要網路|不要搜尋|不需網路|僅使用附件|只根據文件|只用本地|離線回答|不要查網路|不用查網路)/.test(q))return false;
 if(/^(?:【待潤稿原文】|以下是原文|原文如下|引用：|引述：|>|\x60\x60\x60)/.test(q))return false;
 if(/(?:幫我改寫|幫我潤稿|翻譯以下|轉成繁體|請幫我翻譯|檢查語法)/.test(q))return false;
 const plan=merlinParse(q);
 // "research" requires evidence; generic "analyze this" or discussing a
 // component's name must not silently send the conversation to the web.
 return plan.intent==="research"&&plan.requiresNetwork&&plan.needsEvidence;
}
