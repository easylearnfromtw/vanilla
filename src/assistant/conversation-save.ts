/** Conversational file saving: explicit writing intent, never side-effect on mere discussion. */
export type SaveRequest={scope:"last-answer"|"conversation";name:string};
function safeFilename(name:string):string{
 const cleaned=name.replace(/[\\/\x00-\x1f:*?"<>|]/g,"_").trim().slice(0,110);
 return cleaned||"Vanilla_對話紀錄.md";
}
export function planConversationSave(input:string):SaveRequest|null{
 const text=input.trim();
 const m=/^(?:(?:請|麻煩|可以|幫我|請幫我|我要|替我)\s*)?(?:把|將)?\s*(?:剛剛(?:的)?(?:回答|內容)|上一則(?:回答|訊息)|這份(?:回答|內容)|整段(?:對話|聊天)|本次(?:對話|聊天)|這個對話|目前對話)\s*(?:存(?:成|為|到)?|儲存(?:成|為|到)?|保存(?:成|為|到)?|匯出(?:成|為)?)\s*(?:一份|一個)?\s*(?:檔案|文件|筆記|Markdown|TXT|md|txt)?\s*(?:，|,|，?檔名(?:為|是)?|叫做|名稱為|名叫|：|:)?\s*([^\n]{0,100})$/i.exec(text);
 if(!m)return null;
 let name=(m[1]||"").replace(/[。！!？?]+$/,"").trim();
 const scope=/對話|聊天/.test(text.slice(0,45))?"conversation":"last-answer";
 if(!name||/^(?:檔案|文件|筆記|Markdown|TXT|md|txt)$/i.test(name))name=scope==="conversation"?"Vanilla_對話紀錄.md":"Vanilla_回答.md";
 if(!/\.(?:md|txt)$/i.test(name))name+=".md";
 return {scope,name:safeFilename(name)};
}
export function composeSavedContent(request:SaveRequest,turns:readonly {role:string;content:string}[]):string{
 const visible=turns.filter(t=>(t.role==="user"||t.role==="assistant")&&t.content.trim()!=="");
 if(!visible.length)throw Error("目前沒有可以保存的訊息內容。");
 if(request.scope==="last-answer"){
  const answer=[...visible].reverse().find(t=>t.role==="assistant");
  if(!answer)throw Error("目前沒有可保存的 AI 回答。");
  return answer.content;
 }
 return visible.map(t=>"## "+(t.role==="user"?"使用者":"Vanilla") +"\n\n"+t.content).join("\n\n---\n\n");
}
