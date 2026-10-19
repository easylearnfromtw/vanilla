/** Zeus enforces Single Model Runtime on mobile. Tools may run concurrently,
 * but only one on-device LLM inference can own the local GPU at any time.
 */
export class SingleInferenceQueue{
 private tail:Promise<void>=Promise.resolve();
 private queued=0;
 get length():number{return this.queued;}
 async run<T>(task:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  if(signal?.aborted)throw new DOMException("任務已取消","AbortError");
  this.queued++;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const previous=this.tail;this.tail=gate;
  try{
   await previous;
   if(signal?.aborted)throw new DOMException("任務已取消","AbortError");
   return await task();
  }finally{this.queued--;release();}
 }
}
export const localInferenceQueue=new SingleInferenceQueue();
export async function parallelLightTools<T>(operations:readonly (()=>Promise<T>)[],limit=3):Promise<PromiseSettledResult<T>[]> {
 const results:PromiseSettledResult<T>[]=[];
 let index=0;
 const count=Math.min(Math.max(1,Math.floor(limit)),operations.length);
 await Promise.all(Array.from({length:count},async()=>{
  while(index<operations.length){
   const at=index++;
   try{results[at]={status:"fulfilled",value:await operations[at]()};}
   catch(reason){results[at]={status:"rejected",reason};}
  }
 }));
 return results;
}

/** Read-only Zeus metadata suggestions: never invokes an external API. */
import {searchApiCandidates,type ApiCandidate} from "./api-registry";
export function zeusSuggestApiCandidates(query:string,candidates:readonly ApiCandidate[]):ApiCandidate[]{
 return searchApiCandidates(candidates,query,30);
}
