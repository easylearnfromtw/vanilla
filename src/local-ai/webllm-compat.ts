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
