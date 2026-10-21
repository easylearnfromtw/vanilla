/** Explicit user-facing failure when no eligible model can answer.
 * This message is a local diagnostic, not an LLM response or tool execution proof.
 * A configured endpoint/model is not necessarily online or healthy.
 */
export type ModelAvailability={
  privateMode:boolean;
  online:boolean;
  localReady:boolean;
  ollamaConfigured:boolean;
  cloudConfigured:boolean;
  allowMetered:boolean;
  loadingLocal:boolean;
};
export function modelUnavailableReply(state:ModelAvailability):string{
  if(state.loadingLocal)return "無法回覆：本地模型還在載入，尚未取得任何生成結果。請到「模型與工具」確認是否載入完成；若下載停住，查看模型錯誤提示或重新檢查快取。";
  if(state.privateMode)return "無法回覆：私密模式只允許本機模型，但目前沒有已就緒的本機 AI。請打開「模型與工具」→「下載／載入」啟用支援的本地模型；不會為了回覆而擅自傳送內容至雲端或其他電腦。";
  if(!state.online&&!state.localReady&&!state.ollamaConfigured)return "無法回覆：目前離線，且沒有已載入的本機模型。請先連線或在「模型與工具」載入本機模型。";
  if(state.cloudConfigured&&!state.allowMetered&&!state.localReady&&!state.ollamaConfigured)return "無法回覆：目前只有雲端模型配置，但「允許計費雲端 API」未啟用。可在「模型與工具」自行確認 API 使用授權，或先載入本地模型／連接已授權的 Ollama；不會擅自發送付費請求。";
  if(state.ollamaConfigured)return "無法回覆：本次沒有符合任務及授權條件的可用模型。設定 Ollama 不等於模型已在線或已載入。請在「模型與工具」核對主機連線、實際模型名稱及授權；若使用 October（阿土伯），須先在主機建立 october:0.3 並把 Vanilla 的 Ollama 模型設定為該名稱。iPhone 的 localhost 並不是桌上型電腦，遠端主機需要可由手機連接的安全端點。";
  return "無法回覆：目前沒有符合此問題及授權條件的 AI 模型。請在「模型與工具」確認本機模型已載入，或連接並授權自架 Ollama／雲端模型。如使用 October（阿土伯），先在執行 Ollama 的主機建立 october:0.3，再於 Vanilla 選擇該模型；建立模型配置不代表 October 的全部 Detroit Agent 能力已部署。";
}
