import {inspectExternalText} from "../security/trust-boundary";

/** Browser-safe adapter contract. Mobilerun itself is a Python runtime, not a Safari SDK. */
export type MobilePlatform="ios"|"android";
export type MobileRisk="read-only"|"interactive"|"blocked";
export type MobilePlan={goal:string;platform:MobilePlatform;risk:MobileRisk;reason:string;maxSteps:5};
export type MobileRunResponse={summary:string;completed:boolean};

const MAX_GOAL=280;
const RESTRICTED=/(?:admin|管理員|最高權限|root|superuser|credential|credentials|密碼|憑證|金鑰|api.?key|secret|token|\.env|system prompt|系統提示|私鑰|驗證碼|一次性密碼|otp|2fa|雙重驗證|付款|刷卡|轉帳|匯款|下單|結帳|購買|支付|賭博|投注|刪除|清空|銷毀|格式化|重設|恢復原廠|解除鎖定|越獄|jailbreak|繞過權限|停用防護|禁用防護|更改權限|修改權限|傳送訊息|寄送訊息|傳簡訊|發簡訊|傳送郵件|發送郵件|上傳|外傳|外洩|匯出個資|擷取聯絡人)/i;
const READ_ONLY=/^(?:請|幫我|可以幫我|麻煩你)?\s*(?:查看|查詢|檢查|確認|辨識|告訴我|列出|截圖|擷取螢幕畫面|看看|看一下|what|check|inspect|list|show|take (?:a )?screenshot)\b?/i;
const PRIVATE_KEY="vanilla.chat.private.enabled";

export function inPrivateChat():boolean{
 try{return typeof localStorage!=="undefined"&&localStorage.getItem(PRIVATE_KEY)==="true";}catch{return true;}
}
export function planMobileTask(raw:string,platform:MobilePlatform):MobilePlan{
 const goal=raw.normalize("NFKC").trim();
 if(!goal||goal.length>MAX_GOAL)return {goal,platform,risk:"blocked",reason:"任務內容必須介於 1 到 280 字。",maxSteps:5};
 if(platform!=="ios"&&platform!=="android")return {goal,platform,risk:"blocked",reason:"不支援的裝置類型。",maxSteps:5};
 if(RESTRICTED.test(goal))return {goal,platform,risk:"blocked",reason:"涉及管理員檔案、認證資訊、付費、刪除、個資傳送或其他敏感操作，禁止交給手機代理。",maxSteps:5};
 const inspection=inspectExternalText(goal,"tool");
 if(inspection.blocked)return {goal,platform,risk:"blocked",reason:"偵測到疑似提示詞注入或權限冒用。",maxSteps:5};
 const risk=READ_ONLY.test(goal)?"read-only":"interactive";
 return {goal,platform,risk,reason:risk==="read-only"?"僅允許讀取／檢視類任務；實際執行仍須人工核准。":"可能操作裝置畫面；目前只提供人工指令，不允許透過網頁代理自動執行。",maxSteps:5};
}

/** Generates a copied desktop command, not executable JavaScript or shell invocation. */
export function mobileCliCommand(plan:MobilePlan):string{
 if(plan.risk==="blocked")throw Error("已阻止高風險任務");
 const quoted="'"+plan.goal.replace(/'/g,"'\\''")+"'";
 return "mobilerun run "+quoted+(plan.platform==="ios"?" --ios":"")+" --steps "+plan.maxSteps;
}

/** Only accept a user-operated authenticated HTTPS bridge, never raw device/ADB localhost. */
export function validateMobileBridgeUrl(raw:string):string{
 let url:URL;
 try{url=new URL(raw.trim());}catch{throw Error("請輸入完整的 HTTPS 橋接網址");}
 const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
 if(url.protocol!=="https:"||!host||url.username||url.password||url.search||url.hash)throw Error("僅允許不含帳密、參數的 HTTPS 網址");
 if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".test")||host==="::1"||host.startsWith("127.")||host.startsWith("10.")||host.startsWith("192.168.")||host.startsWith("169.254.")||host.startsWith("172.")&&Number(host.split(".")[1])>=16&&Number(host.split(".")[1])<=31)throw Error("請使用具存取控管的公有 HTTPS 代理，不允許直接連內網或本機 Portal");
 if(!url.pathname.endsWith("/api/vanilla/mobile/run"))throw Error("請使用專用的 /api/vanilla/mobile/run 代理端點，不能直連 Mobilerun Portal");
 return url.href;
}
export async function executeReadOnlyMobileTask(plan:MobilePlan,endpoint:string,sessionToken:string,fetcher:typeof fetch=fetch):Promise<MobileRunResponse>{
 if(inPrivateChat())throw Error("私密模式不可連接外部裝置控制服務");
 if(plan.risk!=="read-only")throw Error("目前僅允許讀取類任務送至橋接服務");
 const checked=planMobileTask(plan.goal,plan.platform);
 if(checked.risk!=="read-only")throw Error("任務未通過重新驗證");
 if(sessionToken.trim().length<12)throw Error("必須提供本次工作階段的橋接授權權杖");
 const url=validateMobileBridgeUrl(endpoint);
 const response=await fetcher(url,{
  method:"POST",mode:"cors",credentials:"omit",cache:"no-store",
  headers:{"Content-Type":"application/json","Authorization":"Bearer "+sessionToken.trim()},
  body:JSON.stringify({goal:checked.goal,platform:checked.platform,mode:"read-only",max_steps:checked.maxSteps}),
  signal:AbortSignal.timeout(45000)
 });
 if(!response.ok)throw Error("橋接服務拒絕請求（HTTP "+response.status+"）");
 const data:unknown=await response.json();
 if(!data||typeof data!=="object"||!("summary" in data)||typeof data.summary!=="string")throw Error("橋接服務回應格式不正確");
 const summary=data.summary.slice(0,4000);
 if(inspectExternalText(summary,"tool").blocked)throw Error("橋接回傳內容含疑似提示詞注入，已隔離");
 return {summary,completed:"completed" in data&&data.completed===true};
}
