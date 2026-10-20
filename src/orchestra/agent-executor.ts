/** Browser-local artifact executor. Never calls remote Craft engines or uploads files. */
import {createRetinaDocument,downloadRetina} from "../detroit/retina";
import {createMotionGif,downloadLocalBlob,posterSvg,svgAsBitmap} from "./local-exports";
import {canExecuteOrchestraHandoff,type OrchestraHandoff} from "./ai-handoff";
export async function executeOrchestraHandoff(plan:OrchestraHandoff):Promise<string>{
 if(!canExecuteOrchestraHandoff(plan))throw Error("沒有符合條件的 AI 文字或本機輸出器");
 const {format,title,body}=plan;
 if(format==="pdf"||format==="docx"||format==="pptx"){
  const file=await createRetinaDocument({title,body,format});
  downloadRetina(file);
  return file.name;
 }
 let blob:Blob;
 if(format==="gif")blob=await createMotionGif(title,body);
 else{
  const kind=plan.tool==="deckcraft"?"slide":plan.tool==="vectorcraft"?"vector":"publication";
  const svg=posterSvg({title,body,kind});
  if(format==="svg")blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});
  else if(format==="png"||format==="jpeg")blob=await svgAsBitmap(svg,format==="png"?"image/png":"image/jpeg");
  else throw Error("尚無可用本機輸出器");
 }
 const filename="Orchestra_AI_Export."+(format==="jpeg"?"jpg":format);
 downloadLocalBlob(blob,filename);
 return filename;
}
