/** Janus deterministic authority gate: policy decisions, not a hosted mailing service. */
export type JanusOperation="render-local"|"hosted-editor"|"send-email";
export type JanusDecision={engine:"janus";allow:boolean;mode:"local"|"external"|"blocked";reason:string};
export function janusPermission(operation:JanusOperation,options:{privateMode:boolean;approved:boolean}):JanusDecision{
 if(operation==="render-local")return {engine:"janus",allow:true,mode:"local",reason:"本機 Unlayer Elements 模板生成，不需第三方網路請求"};
 if(operation==="send-email")return {engine:"janus",allow:false,mode:"blocked",reason:"Janus 不提供自動寄信；需要獨立的寄送服務與使用者授權"};
 if(options.privateMode)return {engine:"janus",allow:false,mode:"blocked",reason:"私密模式禁止載入第三方 Unlayer 編輯器"};
 if(!options.approved)return {engine:"janus",allow:false,mode:"blocked",reason:"使用第三方雲端拖曳編輯前必須取得明確同意"};
 return {engine:"janus",allow:true,mode:"external",reason:"已同意載入第三方 Unlayer 託管編輯器；設計內容可能傳至該服務"};
}
