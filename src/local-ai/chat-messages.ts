/**
 * Build a single valid chat transcript for the on-device WebLLM engine.
 * WebLLM requires the system instruction only once and only at index zero.
 * Keep style guidance in that same first message.
 */
export type LocalPromptTurn={role:"user"|"assistant";content:string};
export type LocalChatMessage={role:"system"|"user"|"assistant";content:string};
export const LOCAL_SYSTEM_PROMPT="你是 Vanilla 的 iPhone 裝置端 AI。請用自然、直接的臺灣繁體中文回答。一般資訊、第三方服務、API 與開發問題請正常提供具體協助，不要產生無關的制式拒絕。你本身不能執行即時網路搜尋、讀取其他網站或辨識未提供的圖片；這些事情需要 Vanilla 外部工具。若工具未執行，不應聲稱已經完成。短題簡答，複雜題坦承小模型能力限制。";
export function buildLocalChatMessages(history:LocalPromptTurn[],styleInstruction:string):LocalChatMessage[]{
 const recent=history.slice(-20).map(turn=>({
  role:turn.role,
  content:turn.content.length>2200?turn.content.slice(-2200):turn.content
 }));
 return [
  {role:"system",content:LOCAL_SYSTEM_PROMPT+"\n\n"+styleInstruction},
  ...recent
 ];
}
