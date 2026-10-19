/** Regression guard for TVM ShapeTuple lifetime bug in WebLLM 0.2.83+ (#844).
 * The pinned 0.2.82 build has been reported working under the same workloads.
 * A newer runtime needs separate mobile/GPU validation before changing this pin.
 */
export const PINNED_WEBLLM_VERSION="0.2.82";
export function isPinnedWebLLMModelSupported(model:string):boolean{
 // Qwen3.5 model ids were introduced after the known-stable runtime.
 return !/^Qwen3\.5-/i.test(model);
}
export function isDisposedWebLLMFailure(error:unknown):boolean{
 const message=error instanceof Error?error.message:String(error);
 return /(?:Object|Module) has already been disposed/i.test(message);
}

/** A disposed TVM handle cannot be reused. Rebuild the engine outside the inference
 * queue, then replay the same request once. Other errors and cancellations are not retried.
 * Keeping the retry bounded prevents an invalid GPU runtime from looping forever.
 */
export async function retryDisposedLocalInference<T>(
 attempt:()=>Promise<T>,
 recover:()=>Promise<void>,
 resetPartial:()=>void=()=>{},
 signal?:AbortSignal,
):Promise<T>{
 try{return await attempt();}
 catch(error){
  if(!isDisposedWebLLMFailure(error)||signal?.aborted)throw error;
  await recover();
  if(signal?.aborted)throw new DOMException("任務已取消","AbortError");
  resetPartial();
  return attempt();
 }
}
