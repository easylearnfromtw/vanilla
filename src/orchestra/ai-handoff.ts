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
