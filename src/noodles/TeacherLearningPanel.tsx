import {useEffect,useState} from "react";
import {BrainCircuit,Download,Trash2,ShieldCheck} from "lucide-react";
import {readTeacherState,setTeacherSettings,removeTeacherExample,clearTeacherExamples,teacherExport,teacherScope} from "./teacher-store";
import {summarizeTeachers} from "./teacher-core";
import "./teacher.css";

function saveJSONL(filename:string,text:string){
 if(!text.trim())throw Error("目前沒有符合這種資料格式的已審核訓練案例");
 const url=URL.createObjectURL(new Blob([text],{type:"application/x-ndjson;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download=filename;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function TeacherLearningPanel({privateMode}:{privateMode:boolean}){
 const [open,setOpen]=useState(false);
 const [state,setState]=useState(readTeacherState);
 const [message,setMessage]=useState("");
 useEffect(()=>{
  const update=()=>setState(readTeacherState());
  window.addEventListener("vanilla-teacher-updated",update);
  window.addEventListener("vanilla-drive-connected",update);
  window.addEventListener("vanilla-drive-disconnected",update);
  return()=>{window.removeEventListener("vanilla-teacher-updated",update);
   window.removeEventListener("vanilla-drive-connected",update);window.removeEventListener("vanilla-drive-disconnected",update);};
 },[]);
 const stats=summarizeTeachers(state);
 function change(patch:Partial<typeof state.settings>){
  if(privateMode)return;
  try{setState(setTeacherSettings(patch));setMessage("NOODLES 學習設定已更新。尚未執行模型權重訓練。");}
  catch(e){setMessage("設定失敗："+String(e));}
 }
 function download(mode:"sft"|"dpo",split:"train"|"eval"){
  try{
   const content=teacherExport(mode,split);
   saveJSONL("noodles-"+mode+"-"+split+".jsonl",content);
   setMessage("已匯出 "+mode.toUpperCase()+"／"+split+" 訓練資料；須在具備 GPU 的訓練環境另行執行 LoRA，不能視為模型已更新。");
  }catch(e){setMessage("匯出失敗："+String(e));}
 }
 return <section className="teacher-learning" aria-label="NOODLES 跨模型知識蒸餾與資料訓練">
  <button className="teacher-header" type="button" aria-expanded={open} onClick={()=>setOpen(x=>!x)}>
   <BrainCircuit size={17}/><strong>NOODLES TEACHER</strong>
   <span>跨模型學習 · {stats.count} 筆案例 · {privateMode?"私密模式停用":state.settings.enabled?"已啟用":"需手動啟用"}</span>
   <span aria-hidden="true">{open?"−":"＋"}</span>
  </button>
  {open&&<div className="teacher-body">
   <p>將你在雙模型比較中選出的較佳回答、或主動按讚的答案，整理為可審核的 SFT／DPO 資料。不會自動將所有 AI 回答當作正確標準，也不會未經授權上傳原始對話。</p>
   <small><ShieldCheck size={13}/>資料位置：{teacherScope()}。明文僅保存在此裝置；請勿用來收錄私人／醫療／財務資料。私密模式永不收錄。</small>
   <label className="teacher-check"><input type="checkbox" disabled={privateMode} checked={state.settings.rightsConfirmed} onChange={e=>{
    if(e.target.checked&&!window.confirm("確認：我對提供給 NOODLES 的文字擁有合法的訓練使用權，已理解其他 AI 的使用條款可能限制輸出再訓練，且不包含私人資料或未授權內容。\n\n僅用於此裝置受控訓練資料集；不會自動上傳或訓練。"))return;
    change({rightsConfirmed:e.target.checked});
   }}/>我已確認可合法使用所選回答作為個人訓練資料</label>
   <label className="teacher-check"><input type="checkbox" disabled={privateMode||!state.settings.rightsConfirmed} checked={state.settings.enabled} onChange={e=>change({enabled:e.target.checked})}/>自動收錄我主動選擇／按讚且通過隱私檢查的回答（預設關閉）</label>
   <label className="teacher-check"><input type="checkbox" disabled={privateMode||!state.settings.enabled} checked={state.settings.allowCrossModelHints} onChange={e=>change({allowCrossModelHints:e.target.checked})}/>允許各模型參考少量已選定的回答風格（不作為事實或證據；可能傳給已同意使用的外部模型）</label>
   <div className="teacher-counts">
    <span><strong>{stats.count}</strong>已收錄案例</span>
    <span><strong>{stats.comparisons}</strong>完整偏好組</span>
    <span><strong>{stats.byProvider.local+stats.byProvider.ollama}</strong>本地／Ollama 來源</span>
    <span><strong>{stats.byProvider.gemini+stats.byProvider.deepseek}</strong>外部 AI 來源</span>
   </div>
   <strong className="teacher-subtitle">已保存訓練案例（可個別刪除）</strong>
   {state.examples.length?<div className="teacher-list">{[...state.examples].reverse().slice(0,15).map(sample=>
    <div className="teacher-record" key={sample.id}>
     <span>{sample.teacher.provider} · {sample.task} · {sample.rejected?"DPO 偏好對":"SFT 範例"}</span>
     <p>{sample.prompt.slice(0,110)}{sample.prompt.length>110?"…":""}</p>
     <button type="button" disabled={privateMode} title="刪除該訓練案例" onClick={()=>setState(removeTeacherExample(sample.id))}><Trash2 size={14}/></button>
    </div>)}</div>:<p className="teacher-empty">目前沒有資料。啟用後，請使用雙模型比較並明確選擇較佳回答，或對模型回答按讚。</p>}
   <strong className="teacher-subtitle">匯出可供 LoRA 訓練的標準 JSONL</strong>
   <div className="teacher-downloads">
    {(["sft","dpo"] as const).map(mode=>(["train","eval"] as const).map(split=>
      <button key={mode+"-"+split} type="button" disabled={privateMode||!stats.count} onClick={()=>download(mode,split)}><Download size={13}/>{mode.toUpperCase()} · {split}</button>))}
   </div>
   <small>以同一問題的固定雜湊分隔訓練／評估集，避免完全相同的問題出現在兩邊。只有獨立評估、明確訓練授權與可用 GPU，才可能更新本地模型權重。其他公司的 API 模型權重不會被這份檔案改變。</small>
   <div className="teacher-bottom">
    <button type="button" disabled={privateMode||!stats.count} onClick={()=>{if(window.confirm("確定永久刪除這個帳戶在此裝置的所有 NOODLES Teacher 案例？")){clearTeacherExamples();setState(readTeacherState());setMessage("已刪除本裝置的 Teacher 資料集。");}}}>清除所有訓練範例</button>
    <a href="https://github.com/easylearnfromtw/vanilla/blob/main/docs/NOODLES_TEACHER_TRAINING.md" target="_blank" rel="noopener noreferrer">GPU LoRA 訓練說明 ↗</a>
   </div>
   {message&&<p role="status" className="teacher-message">{message}</p>}
  </div>}
 </section>;
}
