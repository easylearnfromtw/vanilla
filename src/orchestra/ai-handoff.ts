/** Detroit AI -> Orchestra: deterministic, privilege-free artifact plan.
 * A new user request is never treated as finished document content.
 */
import {orchestraLocalAvailable,type OrchestraToolId,type OrchestraFormat} from "./core";
export type OrchestraHandoff={
 request:string;tool:OrchestraToolId;format:OrchestraFormat;title:string;body:string;
 source:"ai";provenance:"assistant-answer"|"brief-only"
};
const reference=/(?:剛才|剛剛|上一則|上面|前面|上述|先前|那份|這份|這篇|這段|這個回答|你的回答|回答內容|前一個回答|剛寫的|剛整理的)/;
const action=/(?:製作|生成|產生|建立|設計|匯出|下載|輸出|轉成|做成|製成|存成|轉為)/;
function selectFormat(q:string):{tool:OrchestraToolId;format:OrchestraFormat}{
 if(/(?:\bPPTX\b|PowerPoint|投影片|簡報)/i.test(q))return {tool:"deckcraft",format:"pptx"};
 if(/(?:\bDOCX\b|\bWord\b|文字文件)/i.test(q))return {tool:"wordcraft",format:"docx"};
 if(/\bSVG\b|向量圖/i.test(q))return {tool:"vectorcraft",format:"svg"};
 if(/\bGIF\b|動圖|動畫圖/i.test(q))return {tool:"effectcraft",format:"gif"};
 if(/(?:照片調整|調整照片|修圖|PhotoCraft)/i.test(q))return {tool:"photocraft",format:"png"};
 if(/(?:\bPNG\b|海報|視覺版面|資訊圖|圖卡|JPE?G)/i.test(q))return {tool:"designcraft",format:"png"};
 if(/\bPDF\b|報告書|正式報告/i.test(q))return {tool:"wordcraft",format:"pdf"};
 return {tool:"wordcraft",format:"docx"};
}
export function orchestraHandoff(request:string,previousAssistant=""):OrchestraHandoff{
 const brief=request.trim().slice(0,8000);
 const {tool,format}=selectFormat(brief);
 const reuse=reference.test(brief)&&action.test(brief)&&previousAssistant.trim().length>0&&
  !/^(?:【待潤稿原文】|以下是原文|原文如下|引用：|引述：|>)/.test(brief);
 return {request:brief,tool,format,title:reuse?"AI 對話內容":"Orchestra AI 製作草稿",
  body:reuse?previousAssistant.slice(0,50000):"",source:"ai",
  provenance:reuse?"assistant-answer":"brief-only"};
}
export function canExecuteOrchestraHandoff(p:OrchestraHandoff):boolean{
 return p.provenance==="assistant-answer"&&p.body.trim().length>0&&
  (["docx","pdf","pptx"].includes(p.format)||orchestraLocalAvailable(p.tool,p.format))&&p.tool!=="photocraft";
}
export function orchestraComposePrompt(p:OrchestraHandoff):string{
 return "請根據下列使用者需求，撰寫完整、適合 "+p.format.toUpperCase()+
  " 製作的繁體中文 Markdown 草稿。缺乏證據的數字與來源不得虛構。"+
  "請先生成實際內容，不得聲稱已製成檔案。生成後使用者可要求把這則回答轉成 "+p.format.toUpperCase()+
  "。\n\n使用者需求：\n"+p.request.slice(0,6000);
}

/** New locally supported media requests can be fully drafted and rendered in chat.
 * They cannot grant native Craft, network, photo edits or cloud service permissions.
 */
export function planOrchestraAutoDraft(request:string):OrchestraHandoff|null{
 const q=request.trim();
 if(!q||q.length>1600||reference.test(q)||
  /^(?:請問|如何|怎麼|什麼是|為什麼|解釋|比較|引用：|引述：|原文如下|以下是原文|>)/.test(q)||
  /(?:Canva|修圖|照片調整|PhotoCraft)/i.test(q)||
  /(?:不要|不必|無需|不需要).{0,12}(?:匯出|下載|製作|生成|輸出)/.test(q))return null;
 if(!action.test(q)||!/(?:\bSVG\b|\bPNG\b|\bGIF\b|向量圖|資訊圖|圖卡)/i.test(q))return null;
 const plan=orchestraHandoff(q);
 return plan.provenance==="brief-only"&&plan.tool!=="photocraft"&&
  orchestraLocalAvailable(plan.tool,plan.format)?plan:null;
}
/** Only bind a real completed model answer to the approved local renderer. */
export function bindOrchestraDraft(plan:OrchestraHandoff,completedText:string):OrchestraHandoff{
 if(plan.provenance!=="brief-only"||!completedText.trim())throw Error("尚無完成的 AI 草稿可匯出");
 const name=plan.format==="png"?"PNG 圖卡":plan.format.toUpperCase();
 const ready=orchestraHandoff("把剛剛的回答製作成 "+name,completedText);
 if(!canExecuteOrchestraHandoff(ready)||ready.tool!==plan.tool||ready.format!==plan.format)
  throw Error("Orchestra 製作格式或執行器不一致");
 return {...ready,title:plan.request.replace(/[\\/:*?"<>|]/g," ").slice(0,60)||"Orchestra AI"};
}
