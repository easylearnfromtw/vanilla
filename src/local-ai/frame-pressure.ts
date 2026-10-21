/**
 * Local-only LUCA sampling while an on-device model is generating.
 * No prompt, response, device ID or identifying content is ever recorded.
 * requestAnimationFrame is sampled only during active inference.
 * This observes UI frame pacing; it cannot measure OS/GPU utilization.
 */
export function p95FrameTimeMs(frames:readonly number[]):number|null{
 const valid=frames.filter(x=>Number.isFinite(x)&&x>0&&x<=1000);
 if(valid.length<8)return null;
 const ordered=[...valid].sort((a,b)=>a-b);
 return ordered[Math.ceil(ordered.length*.95)-1];
}
export type FrameMonitor={p95FrameMs:()=>number|null;stop:()=>void};
export function startInferenceFrameMonitor():FrameMonitor{
 if(typeof window==="undefined"||typeof document==="undefined"||typeof window.requestAnimationFrame!=="function")
  return {p95FrameMs:()=>null,stop:()=>{}};
 const samples:number[]=[];
 let pending=0,lastTime=0,stopped=false;
 const tick=(now:number):void=>{
  if(stopped)return;
  if(document.hidden){lastTime=0;}
  else if(lastTime>0){
   const ms=now-lastTime;
   // A background-tab suspension is not a slow foreground frame.
   if(Number.isFinite(ms)&&ms>0&&ms<=1000){
    samples.push(ms);
    if(samples.length>120)samples.shift();
   }
   lastTime=now;
  }else lastTime=now;
  pending=window.requestAnimationFrame(tick);
 };
 pending=window.requestAnimationFrame(tick);
 return {
  p95FrameMs:()=>p95FrameTimeMs(samples),
  stop:()=>{
   if(stopped)return;
   stopped=true;
   window.cancelAnimationFrame(pending);
  }
 };
}

export type LocalInferenceMetric={
 model:string;elapsedMs:number;ttftMs:number|null;
 frameP95Ms:number|null;completed:boolean;at:number;
};
const MAX_SAMPLES=24;
const observations:LocalInferenceMetric[]=[];
/** Ephemeral operational data only; intentionally not persisted to localStorage. */
export function recordLocalInferenceMetric(metric:LocalInferenceMetric):void{
 if(!Number.isFinite(metric.elapsedMs)||metric.elapsedMs<0||!metric.model)return;
 observations.push({...metric,elapsedMs:Math.round(metric.elapsedMs),ttftMs:metric.ttftMs===null?null:Math.round(metric.ttftMs)});
 if(observations.length>MAX_SAMPLES)observations.shift();
}
export function getLocalInferenceMetrics():LocalInferenceMetric[]{return observations.map(x=>({...x}));}
export function clearLocalInferenceMetrics():void{observations.length=0;}
