/** UI streaming optimization. This does not overclock the device or pretend
 * to accelerate GPU kernels; it reduces main-thread rerenders on iPhones.
 */
export function streamDisplayInterval(hardwareConcurrency:number|undefined):number{
 if(typeof hardwareConcurrency!=="number"||!Number.isFinite(hardwareConcurrency))return 95;
 return hardwareConcurrency<=4?140:hardwareConcurrency<=6?115:75;
}
export function shouldPublishStream(now:number,last:number,interval:number,finished=false):boolean{
 return finished||now-last>=interval;
}
export function preferSmallModelForDevice(memoryGB:number|undefined,cores:number|undefined):boolean{
 return (typeof memoryGB==="number"&&memoryGB<6)||(typeof cores==="number"&&cores<6);
}
