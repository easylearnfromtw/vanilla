import {useRef,useState} from "react";
import EmailEditor,{type EditorRef} from "react-email-editor";

type Props={
 design:Record<string,unknown>;
 onExport:(design:Record<string,unknown>,html:string)=>void;
 onClose:()=>void;
};
export default function EmailVisualEditor({design,onExport,onClose}:Props){
 const ref=useRef<EditorRef>(null);
 const [ready,setReady]=useState(false);
 const [notice,setNotice]=useState("正在載入 Unlayer 線上編輯器…");
 function sync(){
  const editor=ref.current?.editor;
  if(!editor){setNotice("編輯器尚未就緒");return;}
  editor.exportHtml(result=>{
   if(!result||!result.design||typeof result.html!=="string"){
    setNotice("匯出失敗，請重試");return;
   }
   onExport(result.design as Record<string,unknown>,result.html);
   setNotice("修改已同步到 Vanilla。可以下載 HTML／JSON，或儲存到本機。");
  });
 }
 return <section className="email-editor-panel" aria-label="Unlayer 視覺化編輯器">
  <div className="email-editor-toolbar">
   <strong>Unlayer · 雲端視覺編輯</strong>
   <div className="email-actions">
    <button type="button" disabled={!ready} onClick={sync}>同步編輯結果</button>
    <button type="button" onClick={onClose}>關閉編輯器</button>
   </div>
  </div>
  <p className="email-note" role="status">{notice}</p>
  <EmailEditor
   ref={ref}
   minHeight="640px"
   options={{displayMode:"email"}}
   onReady={editor=>{
    setReady(true);
    try{
     editor.loadDesign(design as Parameters<typeof editor.loadDesign>[0]);
     setNotice("編輯器已就緒。完成修改後，請按「同步編輯結果」。");
    }catch{
     setNotice("載入模板失敗，請確認 JSON 格式。");
    }
   }}
  />
 </section>;
}
