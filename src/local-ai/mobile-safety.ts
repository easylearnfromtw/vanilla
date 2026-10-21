/** Keep iPhone/iPad WebGPU inference explicit and within a conservative risk budget.
 * Safari may terminate the entire WebContent process on memory pressure, which is
 * not catchable by JavaScript. These rules do not infer installed device RAM.
 */
export function isIOSWebLLMDevice(userAgent:string,platform="",maxTouchPoints=0):boolean{
 return /iPhone|iPad|iPod/i.test(userAgent)||(platform==="MacIntel"&&maxTouchPoints>1);
}
/** Never silently start a cached GPU model when an iOS PWA is reopened. */
export function shouldAutoLoadCachedModel(iosDevice:boolean):boolean{return !iosDevice;}
/** Approximate WebLLM VRAM is a warning threshold, not a device memory measurement. */
export function needsMobileMemoryConfirmation(iosDevice:boolean,vramMB:number):boolean{
 return iosDevice&&vramMB>=1400;
}
/** Only an explicit compatibility-mode choice may run WebGPU inference on the UI thread. */
export function mayFallbackToMainThread(_iosDevice:boolean,mode:"auto"|"off"|"broken"):boolean{
 return mode==="off";
}
