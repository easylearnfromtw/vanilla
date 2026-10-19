import {useRef,useState,type ChangeEvent} from "react";
import {Layers,Scissors,Sparkles,Upload,Download} from "lucide-react";
import type {LunaDoc,LunaLayer} from "./model";
import {availableLunaLayoutProviders,generateLunaLayout,type LunaLayoutProvider} from "./ai-layout";
import {currentChatMode} from "../local-ai/chat-session";
import {saveLunaFile} from "./export";

type Props={doc:LunaDoc;selected:LunaLayer|null;onCreate:(d:LunaDoc)=>void;
 onReplaceImage:(id:string,image:string)=>void;onNotice:(notice:string)=>void};
const safeName=(x:string)=>x.replace(/[\\/:*?"<>|]/g,"_").slice(0,70)||"LUNA";
export default function LunaAdvancedTools({doc,selected,onCreate,onReplaceImage,onNotice}:Props){
 const [prompt,setPrompt]=useState("");
 const [provider,setProvider]=useState<LunaLayoutProvider>("gemini");
 const [remoteApproved,setRemoteApproved]=useState(false),[modelApproved,setModelApproved]=useState(false);
 const [loading,setLoading]=useState<""|"layout"|"psd"|"cutout">("");
 const fileInput=useRef<HTMLInputElement|null>(null);
 const providers=availableLunaLayoutProviders();
 async function makeAI(){
  if(loading)return;setLoading("layout");
  try{
   const next=await generateLunaLayout(prompt,provider,remoteApproved);
   onCreate(next);onNotice("AI 已產生可逐層編輯的文字與形狀排版。請檢查文字、位置及醫療宣傳內容。");
  }catch(e){onNotice("AI 排版失敗："+String(e instanceof Error?e.message:e));}
  finally{setLoading("");}
 }
 async function openPSD(event:ChangeEvent<HTMLInputElement>){
  const file=event.currentTarget.files?.[0];event.currentTarget.value="";if(!file||loading)return;
  setLoading("psd");
  try{
   const {importLunaPSD}=await import("./psd");
   const result=await importLunaPSD(file);onCreate(result.doc);
   onNotice("PSD 已匯入。"+result.warnings.join(" "));
  }catch(e){onNotice("PSD 匯入失敗："+String(e instanceof Error?e.message:e));}
  finally{setLoading("");}
 }
 async function savePSD(){
  if(loading)return;setLoading("psd");
  try{
   const {exportLunaPSD}=await import("./psd");
   const blob=await exportLunaPSD(doc);
   saveLunaFile(safeName(doc.name)+".psd",blob);
   onNotice("已輸出 PSD；各圖層可獨立編輯像素，文字與效果已點陣化。");
  }catch(e){onNotice("PSD 輸出失敗："+String(e instanceof Error?e.message:e));}
  finally{setLoading("");}
 }
 async function cutout(){
  if(!selected?.image||selected.kind!=="image"||loading)return;
  if(!modelApproved)return onNotice("請先同意下載模型與 ONNX 執行元件。");
  const id=selected.id,original=selected.image;
  setLoading("cutout");onNotice("正在本機載入 U²-NetP 模型並執行去背，圖片不會上傳。");
  try{
   const {removeLunaBackground}=await import("./background-removal");
   const result=await removeLunaBackground(original);
   onReplaceImage(id,result);onNotice("本機 AI 去背完成。可復原；細髮絲與透明物件可能需要額外修圖。");
  }catch(e){onNotice("去背失敗："+String(e instanceof Error?e.message:e));}
  finally{setLoading("");}
 }
 return <>
  <section className="luna-panel luna-advanced"><h2><Sparkles size={17}/>AI 自動排版</h2>
   <textarea rows={4} value={prompt} maxLength={600} onChange={e=>setPrompt(e.target.value)} placeholder="例如：米白配色的皮膚保養講座海報，含主標、副標、日期，文字留白…"/>
   <label>使用已連接的模型
    <select value={provider} onChange={e=>setProvider(e.target.value as LunaLayoutProvider)}>
     {(["gemini","deepseek","ollama"] as const).map(p=><option key={p} value={p} disabled={!providers.includes(p)}>{p}{providers.includes(p)?"":"（未連接）"}</option>)}
    </select>
   </label>
   <label className="luna-confirm"><input type="checkbox" checked={remoteApproved} onChange={e=>setRemoteApproved(e.target.checked)}/>
    我同意將本次設計需求送至所選模型服務，可能產生 API 費用。</label>
   {currentChatMode()==="private"&&<small>私人模式不呼叫外部模型；仍可使用上方離線模板。</small>}
   <button className="luna-primary" disabled={!!loading||!providers.includes(provider)||prompt.trim().length<8||!remoteApproved||currentChatMode()==="private"} onClick={()=>void makeAI()}>
    {loading==="layout"?"AI 排版中…":"生成可編輯排版"}</button>
  </section>
  <section className="luna-panel luna-advanced"><h2><Layers size={17}/>Photoshop PSD</h2>
   <div className="luna-advanced-actions">
    <button disabled={!!loading} onClick={()=>fileInput.current?.click()}><Upload size={16}/>匯入 PSD</button>
    <button disabled={!!loading} onClick={()=>void savePSD()}><Download size={16}/>匯出 PSD</button>
   </div>
   <input type="file" hidden accept=".psd,image/vnd.adobe.photoshop" ref={fileInput} onChange={e=>void openPSD(e)}/>
   <small>圖層保留為可移動的點陣圖；文字、群組效果及智慧物件不保證原樣可編輯。僅本機解析，不傳送檔案。</small>
  </section>
  <section className="luna-panel luna-advanced"><h2><Scissors size={17}/>AI 自動去背</h2>
   <p className="luna-hint">{selected?.kind==="image"&&selected.image?"目前選取圖片："+selected.label:"請先選取含照片的圖片圖層。"}</p>
   <label className="luna-confirm"><input type="checkbox" checked={modelApproved} onChange={e=>setModelApproved(e.target.checked)}/>
    我同意首次下載 U²-NetP 模型（約 4.6 MB）與 ONNX/WASM 元件；圖片只在本機運算。</label>
   <button className="luna-primary" disabled={!!loading||!modelApproved||selected?.kind!=="image"||!selected.image||!navigator.onLine}
    onClick={()=>void cutout()}>{loading==="cutout"?"正在本機去背…":"移除所選圖片背景"}</button>
   <small>採用 Apache-2.0 U²-NetP；需要網路下載模型（快取後可再次使用），不使用第三方管理員帳號。部分 iPhone 記憶體不足時可能失敗。</small>
  </section>
 </>;
}
