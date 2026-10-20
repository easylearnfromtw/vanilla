/** Only increasing numeric WebLLM progress proves that a download moved forward.
 * Some WebLLM builds repeatedly report "Start to fetch params" without fetching shards.
 * Never reset the watchdog merely because a progress message repeats.
 */
export const DOWNLOAD_STALL_MS=180_000;
export const DOWNLOAD_NOTICE_MS=30_000;
export type DownloadProgress={highest:number;lastAdvancedAt:number;lastReportedAt:number};
export function firstDownloadProgress(now:number):DownloadProgress{
 return {highest:0,lastAdvancedAt:now,lastReportedAt:now};
}
export function noteDownloadProgress(state:DownloadProgress,value:number,now:number):DownloadProgress{
 const progress=Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
 return progress>state.highest+0.000001?{highest:progress,lastAdvancedAt:now,lastReportedAt:now}:{...state,lastReportedAt:now};
}
export function downloadHasStalled(state:DownloadProgress,now:number,threshold=DOWNLOAD_STALL_MS):boolean{
 return now-state.lastAdvancedAt>=threshold;
}
export function downloadNeedsNotice(state:DownloadProgress,now:number):boolean{
 return now-state.lastAdvancedAt>=DOWNLOAD_NOTICE_MS;
}
export function isDownloadStallError(error:unknown):boolean{
 return error instanceof Error&&error.message.includes("model-download-stalled");
}
export function stalledDownloadError():Error{
 return new Error("model-download-stalled：模型權重連續 3 分鐘沒有新增下載進度。請先檢查網路能否連到 Hugging Face，然後重試；如仍卡住，可在模型面板清除『此模型』的快取再下載。");
}
