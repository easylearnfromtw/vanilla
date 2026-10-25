import {useState} from "react";

type ModelName="30b"|"60b";
type HostName="desktop-24"|"workstation-48"|"virtual-96"|"virtual-dual-80"|"virtual-eight-80";
type VirtualHost={gpuCount:number;perGpuVramGiB:number;ramGiB:number;diskGiB:number};
type VirtualJob={
 model:ModelName;virtualResourceScreenPass:boolean;reasons:string[];
 simulatedSteps:number;virtualGpuSlot:number|null;virtualMetadataRecovery:boolean;
 trainingDriverAvailable:boolean;largeModelWeightsTrained:false;
};
type VirtualRun={kind:"virtual-gpu-host-simulation";host:HostName;virtualHardware:VirtualHost;
 simulatedAt:string;simulatedTrainingSteps:number;faultInjected:boolean;
 jobs:VirtualJob[];cudaUsed:false;largeModelTrainingCompleted:false;noRealGPUBilled:true};

const HOSTS:Record<HostName,VirtualHost>={
 "desktop-24":{gpuCount:1,perGpuVramGiB:24,ramGiB:64,diskGiB:256},
 "workstation-48":{gpuCount:1,perGpuVramGiB:48,ramGiB:128,diskGiB:512},
 "virtual-96":{gpuCount:1,perGpuVramGiB:96,ramGiB:256,diskGiB:1024},
 "virtual-dual-80":{gpuCount:2,perGpuVramGiB:80,ramGiB:256,diskGiB:1024},
 "virtual-eight-80":{gpuCount:8,perGpuVramGiB:80,ramGiB:1024,diskGiB:4096},
};
const MODEL_SCREENS:Record<ModelName,{vram:number;ram:number;disk:number;realDriver:boolean}>={
 "30b":{vram:40,ram:64,disk:180,realDriver:true},
 "60b":{vram:96,ram:128,disk:320,realDriver:false},
};
/** Pure browser-side simulation preview. The CLI provides the detailed event log. */
export function simulateVirtualHostPreview(hostName:HostName,models:ModelName[],steps:number,fault:boolean):VirtualRun{
 const host=HOSTS[hostName],used:number[]=[];
 let faultTargetAssigned=false;
 const jobs:VirtualJob[]=models.map(model=>{
  const minimum=MODEL_SCREENS[model],reasons:string[]=[];
  if(host.perGpuVramGiB<minimum.vram)reasons.push("單張虛擬 GPU 記憶體未達沙盤篩選值");
  if(host.ramGiB<minimum.ram)reasons.push("虛擬主機 RAM 未達沙盤篩選值");
  if(host.diskGiB<minimum.disk)reasons.push("虛擬磁碟未達沙盤篩選值");
  const slot=reasons.length?null:used.length%host.gpuCount;
  if(slot!==null)used.push(slot);
  const virtualRecovery=fault&&reasons.length===0&&!faultTargetAssigned;
  if(virtualRecovery)faultTargetAssigned=true;
  return {
   model,virtualResourceScreenPass:reasons.length===0,reasons,
   simulatedSteps:reasons.length?0:steps,virtualGpuSlot:slot,
   virtualMetadataRecovery:virtualRecovery,
   trainingDriverAvailable:minimum.realDriver,largeModelWeightsTrained:false
  };
 });
 return {kind:"virtual-gpu-host-simulation",host:hostName,virtualHardware:host,
  simulatedAt:new Date().toISOString(),simulatedTrainingSteps:steps,
  faultInjected:fault,jobs,cudaUsed:false,largeModelTrainingCompleted:false,noRealGPUBilled:true};
}

export default function OctuberVirtualHostPanel(){
 const [host,setHost]=useState<HostName>("virtual-96");
 const [selected,setSelected]=useState<"all"|ModelName>("all");
 const [steps,setSteps]=useState(20);
 const [fault,setFault]=useState(true);
 const [report,setReport]=useState<VirtualRun|null>(null);
 const [message,setMessage]=useState("");
 function run(){
  const value=simulateVirtualHostPreview(host,selected==="all"?["30b","60b"]:[selected],steps,fault);
  setReport(value);
  setMessage("虛擬主機沙盤已完成。這是本機規則模擬，沒有建立雲端主機、CUDA 作業或新的大型模型權重。");
 }
 function save(){
  if(!report)return;
  const content=JSON.stringify(report,null,2)+"\n";
  const obj=URL.createObjectURL(new Blob([content],{type:"application/json"}));
  const a=document.createElement("a");
  a.href=obj;a.download="octuber-30b-60b-virtual-host-sandbox.json";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(obj),1500);
 }
 return <section className="model-connection-panel" aria-label="OCTUBER 虛擬 GPU 主機沙盤" style={{display:"grid",gap:10,marginTop:16}}>
  <h3>虛擬 GPU 主機沙盤 · 30B／60B</h3>
  <p>可以在電腦或手機上模擬 GPU 記憶體、訓練工作排程與故障復原。<strong>這是虛擬主機規則演練，不是租用 GPU，也不會讓模型權重真的更新。</strong></p>
  <label>模擬主機配置
   <select value={host} onChange={event=>{setHost(event.target.value as HostName);setReport(null);}}>
    <option value="desktop-24">桌面沙盤 · 1 × 24 GiB</option>
    <option value="workstation-48">工作站沙盤 · 1 × 48 GiB</option>
    <option value="virtual-96">大型虛擬主機 · 1 × 96 GiB</option>
    <option value="virtual-dual-80">多卡沙盤 · 2 × 80 GiB（非 160 GiB 單卡）</option>
    <option value="virtual-eight-80">機房沙盤 · 8 × 80 GiB（未實作模型分片）</option>
   </select>
  </label>
  <label>模型工作
   <select value={selected} onChange={event=>{setSelected(event.target.value as "all"|ModelName);setReport(null);}}>
    <option value="all">OCTUBER 30B + 60B</option>
    <option value="30b">僅 30B</option>
    <option value="60b">僅 60B</option>
   </select>
  </label>
  <label>模擬排程步數：{steps.toLocaleString("en-US")}
   <select value={steps} onChange={event=>{setSteps(Number(event.target.value));setReport(null);}}>
    <option value={20}>20 次（快速）</option>
    <option value={100}>100 次</option>
    <option value={1000}>1,000 次</option>
    <option value={10000}>10,000 次</option>
    <option value={100000}>100,000 次（僅排程模擬）</option>
   </select>
  </label>
  <label style={{display:"flex",alignItems:"center",gap:8}}>
   <input type="checkbox" checked={fault} onChange={event=>{setFault(event.target.checked);setReport(null);}}/>
   模擬作業中斷與中繼資料續跑（沒有真正的權重檢查點）
  </label>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <button type="button" onClick={run}>執行虛擬主機沙盤</button>
   <button type="button" disabled={!report} onClick={save}>下載模擬報告 JSON</button>
  </div>
  {report&&<div style={{display:"grid",gap:8}}>
   {report.jobs.map(job=><div key={job.model} style={{padding:10,border:"1px solid var(--border, #ddd)",borderRadius:8}}>
    <strong>OCTUBER {job.model.toUpperCase()}</strong>
    <p>{job.virtualResourceScreenPass
     ?"虛擬排程已完成："+job.simulatedSteps+" 步，放在虛擬 GPU "+String((job.virtualGpuSlot??0)+1)
     :"沙盤資源檢查未通過："+job.reasons.join("、")}</p>
    <small>{job.model==="60b"?"60B 實際微調驅動器尚未實機驗證。":"30B 有獨立微調程式，但未取得真實 GPU 訓練成功紀錄。"}{job.virtualMetadataRecovery?" 本次包含故障與中繼資料續跑情境。":""} 真正模型權重：未產生。</small>
   </div>)}
  </div>}
  <p role="status">{message}</p>
  <p><a href="https://github.com/easylearnfromtw/vanilla/blob/main/training/octuber-gpu-sandbox/core_sandbox.py" target="_blank" rel="noreferrer">查看阿土伯式核心：10 萬次真實微型 CPU 梯度測試程式</a></p>
  <small>虛擬 96 GiB 只是一個假設配置，並不是實際提供的 GPU。畫面選擇 10 萬次只表示排程計數，並不在瀏覽器執行 10 萬次神經網路梯度。另有 CLI 可實際更新 72 參數的微型替身核心；該測試不能證明 0.6B／30B／60B 訓練完成。完整故障事件、元資料檢查點與人工審核資料檢查請在電腦用 Python 沙盤執行。</small>
 </section>;
}
