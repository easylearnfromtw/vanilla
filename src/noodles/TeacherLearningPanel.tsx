import {useEffect,useState} from "react";
import {BrainCircuit,Download,Trash2} from "lucide-react";
import {readTeacherState,setTeacherSettings,removeTeacherExample,clearTeacherExamples,teacherExport} from "./teacher-store";
import {summarizeTeachers} from "./teacher-core";
import "./teacher.css";
function downloadJSONL(filename:string,text:string){
 if(!text.trim())throw Error("目前尚無符合格式的訓練資料");
 const uri=URL.createObjectURL(new Blob([text],{type:"application/x-ndjson;charset=utf-8"}));
 const a=document.createElement("a");a.href=uri;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(uri),1000);
}
export default function TeacherLearningPanel({privateMode}:{privateMode:boolean}){
 const [state,setState]=useState(readTeacherState),[message,setMessage]=useState("");
 useEffect(()=>{
  const update=()=>setState(readTeacherState());
  window.addEventListener("vanilla-teacher-updated",update);
  return()=>window.removeEventListener("vanilla-teacher-updated",update);
 },[]);
 const stats=summarizeTeachers(state);
 function toggle(enabled:boolean){setState(setTeacherSettings({enabled,rightsConfirmed:true}));}
 function exportFile(mode:"sft"|"dpo",split:"train"|"eval"){
  try{downloadJSONL("noodles-"+mode+"-"+split+".jsonl",teacherExport(mode,split));setMessage("已匯出資料集，模型權重尚未更新；需在 GPU 執行 LoRA 和獨立驗證。");}
  catch(e){setMessage(String(e));}
 }
 return <details className="teacher-learning" aria-label="NOODLES 個人訓練資料">
  <summary className="teacher-header"><BrainCircuit size={16}/><strong>學習</strong>
   <span>{privateMode?"私密停用":state.settings.enabled?"自動累積本地模型偏好":"已暫停"} · {stats.count} 筆</span></summary>
  <div className="teacher-body">
   <p>個人模式：預設累積你對本地 AI 明確按讚／選擇的回答，改善 NOODLES 學習資料。Gemini、DeepSeek 和 Ollama 仍只記匿名效能評價，不自動保存其完整回答。私密模式不記錄。</p>
   <label className="teacher-check"><input type="checkbox" disabled={privateMode} checked={state.settings.enabled} onChange={e=>toggle(e.target.checked)}/>自動累積我的本地模型學習範例</label>
   <div className="teacher-counts"><span><strong>{stats.count}</strong>可訓練案例</span><span><strong>{stats.comparisons}</strong>偏好配對</span><span><strong>{stats.byProvider.local}</strong>本地模型</span><span><strong>{stats.byProvider.gemini+stats.byProvider.deepseek+stats.byProvider.ollama}</strong>第三方內容</span></div>
   <details><summary>檢視與刪除案例</summary><div className="teacher-list">
    {state.examples.slice(-12).reverse().map(item=><div key={item.id} className="teacher-record"><span>{item.task} · {item.teacher.model}</span><p>{item.prompt.slice(0,95)}</p>
      <button title="刪除案例" type="button" onClick={()=>setState(removeTeacherExample(item.id))}><Trash2 size={13}/></button></div>)}
    {!stats.count&&<p>尚無經你選擇的本地模型回答。</p>}
   </div></details>
   <details><summary>GPU 訓練資料與進階設定</summary><div className="teacher-downloads">
    {(["sft","dpo"] as const).map(mode=>(["train","eval"] as const).map(split=><button key={mode+split} type="button" disabled={!stats.count||privateMode} onClick={()=>exportFile(mode,split)}>
      <Download size={13}/>{mode.toUpperCase()} {split}</button>))}
    </div><p>匯出並不等於訓練；按讚紀錄也不等於已查證的教師答案。Teacher–Student 蒸餾需經人工審核內容及來源權利，再於自己的電腦執行 LoRA/QLoRA 與獨立評測；網站不會自動將對話送出或更新權重。</p>
    <p><a href="https://github.com/easylearnfromtw/vanilla/blob/main/docs/NOODLES_TEACHER_STUDENT.md" target="_blank" rel="noopener noreferrer">查看 Teacher–Student 本機訓練與評測教學</a>。6GB 筆電顯示卡請先從 0.5B 試驗；能否完成 1.5B QLoRA 依 CUDA 與實際記憶體而定。</p>
    <button type="button" disabled={!stats.count||privateMode} onClick={()=>{if(window.confirm("確定刪除此裝置所有本地學習案例？")){clearTeacherExamples();setState(readTeacherState());}}}>清除全部學習案例</button>
   </details>
   {message&&<p role="status" className="teacher-message">{message}</p>}
  </div>
 </details>;
}
