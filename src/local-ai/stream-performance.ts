/** UI streaming optimization. This does not overclock the device or pretend
 * to accelerate GPU kernels; it reduces main-thread rerenders on iPhones.
 */
export function streamDisplayInterval(hardwareConcurrency:number|undefined,frameP95Ms:number|null=null):number{
 const base=typeof hardwareConcurrency!=="number"||!Number.isFinite(hardwareConcurrency)?95:
  hardwareConcurrency<=4?140:hardwareConcurrency<=6?115:75;
 // Fewer React commits when frame pacing is already poor. This does not
 // throttle GPU kernels or replace a proper OS-level resource limit.
 if(frameP95Ms===null||!Number.isFinite(frameP95Ms))return base;
 if(frameP95Ms>=50)return Math.max(base,280);
 if(frameP95Ms>=28)return Math.max(base,180);
 return base;
}
export function shouldPublishStream(now:number,last:number,interval:number,finished=false):boolean{
 return finished||now-last>=interval;
}
export function preferSmallModelForDevice(memoryGB:number|undefined,cores:number|undefined):boolean{
 return (typeof memoryGB==="number"&&memoryGB<6)||(typeof cores==="number"&&cores<6);
}
