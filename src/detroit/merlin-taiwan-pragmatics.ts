/**
 * Merlin Taiwan pragmatic cues: deterministic, local, low-confidence guidance.
 * This is NOT a trained emotion recognizer or a diagnosis. User wording is
 * never rewritten and no result can grant tool permissions.
 */
export type TaiwanPragmaticsContext={
 hasConversation?:boolean;
 previousAssistantOffered?:boolean;
};
export type TaiwanPragmatics={
 intent:"follow-up"|"revision"|"question"|"request"|"social"|"undetermined";
 alignment:"conversation"|"needs-context"|"independent";
 affect:"frustration"|"concern"|"appreciation"|"playfulness"|"ambiguous"|"unmarked";
 confidence:"low"|"medium";
 guidance:string;
};

const SHORT_ACCEPT=/^(?:可以|好|好啊|好喔|好唷|嗯嗯|沒問題|行|ok|okay|就這樣|麻煩你了)[！!。.　\s]*$/i;
const SHORT_FOLLOW=/^(?:繼續|接著|再來|照做|照剛剛的|跟上面一樣|那個|這個|再改一下)[！!。.　\s]*$/;
const REVISION=/(?:不是這樣|我指的是|我的意思是|不對|應該是|改成|不要這樣|重做|再修|還是沒有|沒有改善|這版不行|先前那個)/;
const SOFT_REQUEST=/(?:可不可以|能不能|方便.{0,10}嗎|是不是可以|麻煩.{0,10}(?:幫|做)|可以幫我|能幫我)/;
const WORRY=/(?:我(?:很|有點|真的)?(?:擔心|緊張|害怕|焦慮|不安)|怕會|我不太放心|好怕)/;
const FRUSTRATION=/(?:我(?:真的|超級|很)?(?:不爽|生氣|煩)|有夠(?:扯|煩|爛)|傻眼|超扯|無言|搞什麼|一直失敗|又出錯|怎麼又|根本沒用|卡死|煩死)/;
const THANKS=/(?:感謝|謝謝|謝啦|辛苦了|太讚了|很讚欸|超棒)/;
const LAUGH=/(?:笑死|哈哈哈?|ㄏㄏ|XDD?|哭啊|QQ)/i;
const AMBIGUOUS=/^(?:還好啦?|沒差(?:啦)?|隨便(?:啦)?|都可以|算了(?:啦)?|好喔|可以吧|應該吧|ㄏㄏ)[。！!？?\s]*$/;
const QUOTE_OR_META=/^(?:翻譯|請翻譯|改寫|潤稿|分析(?:這句|這段|這篇)|解釋(?:這句|這段)|引用|他說|她說|原文|逐字稿|prompt|提示詞)/i;
const REFERENCE=/(?:上面|剛剛|那個|這個|原本|之前|延續|繼續|接著|上一版|再來|再改|再優化)/;
const ASK=/[？?]$|^(?:為什麼|怎麼|如何|什麼|是否|請問|有沒有)/;

/**
 * Emotion cues are possible *communication signals*, not statements about
 * identity, mental health, or the user's underlying psychological state.
 * Do not scan quoted source text or code as if it is the user's feeling.
 */
export function inferTaiwanPragmatics(message:string,ctx:TaiwanPragmaticsContext={}):TaiwanPragmatics{
 const q=message.trim().slice(0,600);
 if(!q||QUOTE_OR_META.test(q)||q.startsWith("```")){
  return {intent:"undetermined",alignment:"independent",affect:"unmarked",confidence:"low",guidance:""};
 }
 const shortAccept=SHORT_ACCEPT.test(q);
 const shortFollow=SHORT_FOLLOW.test(q);
 const isFollow=shortFollow||(ctx.hasConversation&&REFERENCE.test(q));
 const alignment=isFollow?(ctx.hasConversation?"conversation":"needs-context"):"independent";
 const revision=REVISION.test(q);
 let intent:TaiwanPragmatics["intent"]=revision?"revision":
  (shortAccept&&ctx.previousAssistantOffered)||(isFollow&&ctx.hasConversation)?"follow-up":
  SOFT_REQUEST.test(q)?"request":
  ASK.test(q)?"question":
  /^(?:你好|嗨|早安|晚安|哈囉|謝謝|感謝|辛苦了)[！!。\s]*$/.test(q)?"social":"undetermined";
 let affect:TaiwanPragmatics["affect"]="unmarked";
 const worry=WORRY.test(q),frustration=FRUSTRATION.test(q);
 const thanks=THANKS.test(q),laugh=LAUGH.test(q);
 const ambiguous=AMBIGUOUS.test(q)||((thanks||laugh)&&(worry||frustration));
 if(ambiguous)affect="ambiguous";
 else if(frustration)affect="frustration";
 else if(worry)affect="concern";
 else if(thanks)affect="appreciation";
 else if(laugh)affect="playfulness";
 const hints:string[]=[];
 if(intent==="revision")hints.push("使用者在更正或不滿意前一版；先核對更正的內容，直接修正，不辯解。");
 else if(intent==="follow-up")hints.push("依同一段對話既有目標與限制續做；短句認可不等於同意付款、刪除或外傳資料。");
 else if(alignment==="needs-context")hints.push("指涉前文但目前缺乏可核對對象；必要時只問一個關鍵問題。");
 else if(intent==="request")hints.push("台灣常見委婉問句可能是實際請求；清楚且安全就直接處理，不必只回答能不能。");
 if(affect==="frustration")hints.push("字面有不耐或抱怨線索；優先給可驗證的修正步驟，語氣克制、不說教。");
 else if(affect==="concern")hints.push("字面有擔心線索；溫和、具體回應疑慮，避免保證結果。");
 else if(affect==="ambiguous")hints.push("「還好啦／沒差／笑死／ㄏㄏ」等語氣可能反諷、保留或玩笑；不可強判滿意、憤怒或諷刺。");
 else if(affect==="appreciation")hints.push("可簡短自然回應感謝，勿過度熱情或奉承。");
 else if(affect==="playfulness")hints.push("可用自然臺灣口吻，仍以任務成果優先，不模仿或放大使用者情緒。");
 if(hints.length===0)return {intent,alignment,affect,confidence:"low",guidance:""};
 const guidance="[Merlin 台灣語用｜非心理診斷] "+hints.join(" ").slice(0,235)+
 " 只視為低信心的語境線索；使用者原話優先，不貼情緒標籤、不猜性格或身份。";
 return {intent,alignment,affect,confidence:(worry||frustration)&&!ambiguous?"medium":"low",guidance};
}
