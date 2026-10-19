/**
 * Normalize local WebLLM messages from stored conversation data.
 * The system instruction must occur exactly once at index zero.
 * Older browser histories or imported snapshots may contain invalid roles.
 */
export type LocalPromptTurn={role:"user"|"assistant";content:string};
export type LocalChatMessage={role:"system"|"user"|"assistant";content:string};
export const LOCAL_SYSTEM_PROMPT="你是 Vanilla 的 iPhone 裝置端 AI。請用自然、直接的臺灣繁體中文回答。一般資訊、第三方服務、API 與開發問題請正常提供具體協助，不要產生無關的制式拒絕。你本身不能執行即時網路搜尋、讀取其他網站或辨識未提供的圖片；這些事情需要 Vanilla 外部工具。若工具未執行，不應聲稱已經完成。短題簡答，複雜題坦承小模型能力限制。";

export type LocalMessageOptions={
 /** Replace the default local system prompt (model-size aware prompts from ai/prompts.ts). */
 system?:string;
 /** Per-turn character cap. Default 2,200 for legacy callers; the tuned engine budgets by tokens instead. */
 maxTurnChars?:number;
};
function recentUserTurns(history:readonly LocalPromptTurn[],maxTurnChars=2200):LocalPromptTurn[]{
 const recent=history.slice(-20).filter(turn=>turn&&
  (turn.role==="user"||turn.role==="assistant")&&typeof turn.content==="string"
 ).map(turn=>({role:turn.role,content:Number.isFinite(maxTurnChars)?turn.content.slice(0,maxTurnChars):turn.content}));
 // A stored assistant response should never begin a reconstructed conversation.
 const firstUser=recent.findIndex(turn=>turn.role==="user");
 return firstUser<0?[]:recent.slice(firstUser);
}

export function buildLocalChatMessages(history:readonly LocalPromptTurn[],styleInstruction:string,options:LocalMessageOptions={}):LocalChatMessage[]{
 const system=((options.system??LOCAL_SYSTEM_PROMPT)+"\n\n"+styleInstruction).trim();
 return [{role:"system",content:system},...recentUserTurns(history,options.maxTurnChars)];
}

/** WebLLM versions/models can reject a valid top-level system message after
 * their internal chat state became inconsistent. Retry ONLY that specific error
 * with a fresh context and a user-only transcript, preserving local privacy.
 */
export function isSystemPromptOrderError(error:unknown):boolean{
 return /System prompt should always be the first message in [`'"]?messages/i.test(String(error));
}
export function buildSystemlessRecoveryMessages(history:readonly LocalPromptTurn[],styleInstruction:string,options:LocalMessageOptions={}):LocalChatMessage[]{
 const recent=recentUserTurns(history,options.maxTurnChars);
 if(!recent.length)throw Error("找不到可供恢復的使用者訊息");
 const [first,...rest]=recent;
 // This is a local fallback, never a remote/cloud message.
 return [
  {role:"user",content:(options.system??LOCAL_SYSTEM_PROMPT)+"\n"+styleInstruction+"\n\n使用者訊息：\n"+first.content},
  ...rest
 ];
}
export function assertLocalMessages(messages:readonly LocalChatMessage[]):void{
 if(messages[0]?.role!=="system"||
    messages.slice(1).some(message=>message.role!=="user"&&message.role!=="assistant")||
    messages.some(message=>typeof message.content!=="string")){
  throw Error("Vanilla 訊息序列驗證失敗：System Prompt 必須且只能放在第一筆");
 }
}

/** Exactly one fallback attempt for this specific WebLLM prompt ordering error. */
export async function retryOnSystemPromptError<T>(run:()=>Promise<T>,recover:()=>Promise<T>):Promise<T>{
 try{return await run();}
 catch(error){
  if(!isSystemPromptOrderError(error))throw error;
  return await recover();
 }
}
