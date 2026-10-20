import {useEffect,useMemo,useState} from "react";
import {orchestraLocalAvailable,type OrchestraFormat,type OrchestraToolId} from "./core";
import {adjustPhoto,createMotionGif,downloadLocalBlob,posterSvg,svgAsBitmap,type PosterKind} from "./local-exports";

const accentOptions=["#AF4634","#2956C7","#146B59","#472B75","#191919"] as const;
export const supportsLocalCraft=orchestraLocalAvailable;
/** Honest browser fallback. It never calls the native Craft binaries. */
export default function LocalCraftPanel({tool,format,title,body,privateMode}:{tool:OrchestraToolId;format:OrchestraFormat;title:string;body:string;privateMode:boolean}){
 const [accent,setAccent]=useState<string>(accentOptions[0]),[photo,setPhoto]=useState<File|null>(null);
 const [photoUrl,setPhotoUrl]=useState(""),[brightness,setBrightness]=useState(100);
 const [contrast,setContrast]=useState(100),[saturation,setSaturation]=useState(100);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const photoMode=tool==="photocraft",motion=format==="gif";
 const kind:PosterKind=tool==="designcraft"?"publication":tool==="deckcraft"?"slide":"vector";
 const svg=useMemo(()=>posterSvg({title,body,kind,accent}),[title,body,kind,accent]);
 useEffect(()=>{if(!photo){setPhotoUrl("");return;}const url=URL.createObjectURL(photo);setPhotoUrl(url);return()=>URL.revokeObjectURL(url);},[photo]);
 function selectPhoto(file:File|null){
  if(file&&(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>8_000_000)){setPhoto(null);setNotice("檔案必須是 8 MB 以下 PNG/JPEG/WebP");return;}
  setPhoto(file);setNotice("");
 }
 async function create(){
  if(busy)return;
  setBusy(true);setNotice("正在本機處理檔案…");
  try{
   let blob:Blob;
   if(photoMode){
    if(!photo)throw Error("請先選擇來源圖片");
    if(format!=="png"&&format!=="jpeg")throw Error("尚未支援此輸出格式");
    blob=await adjustPhoto(photo,format,brightness,contrast,saturation);
   }else if(motion){blob=await createMotionGif(title,body);}
   else if(format==="svg"){blob=new Blob([svg],{type:"image/svg+xml;charset=utf-8"});}
   else if(format==="png"||format==="jpeg"){blob=await svgAsBitmap(svg,format==="png"?"image/png":"image/jpeg");}
   else throw Error("尚未實作此格式的本機輸出器");
   downloadLocalBlob(blob,(title.trim()||"Orchestra")+"."+format);
   setNotice("已完成本機 "+format.toUpperCase()+" 匯出；未連線原生 Craft 引擎，也沒有上傳。");
  }catch(e){setNotice("無法輸出："+String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 return <section className="orchestra-local-media" aria-label="本機製作器">
  <h3>本機可執行製作器 <small>非 Craft 原生引擎</small></h3>
  {photoMode?<div>
    <label className="orchestra-file-label">上傳來源圖片（僅在目前裝置處理）
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{selectPhoto(e.target.files?.[0]||null);e.target.value="";}}/>
    </label>
    {photoUrl&&<img className="orchestra-photo-preview" alt="照片調整預覽" src={photoUrl} style={{filter:"brightness("+brightness+"%) contrast("+contrast+"%) saturate("+saturation+"%)"}}/>}
    <div className="orchestra-sliders">
     <label>亮度 {brightness}%<input type="range" min="25" max="200" value={brightness} onChange={e=>setBrightness(Number(e.target.value))}/></label>
     <label>對比 {contrast}%<input type="range" min="25" max="200" value={contrast} onChange={e=>setContrast(Number(e.target.value))}/></label>
     <label>飽和度 {saturation}%<input type="range" min="0" max="250" value={saturation} onChange={e=>setSaturation(Number(e.target.value))}/></label>
    </div>
   </div>:motion?<div className="orchestra-motion-preview"><span>ORCHESTRA / MOTION</span><strong>{title.slice(0,35)}</strong><p>{body.slice(0,80)}</p></div>
   :<div><div className="orchestra-color-picker"><span>主色</span>{accentOptions.map(c=><button type="button" key={c} className={accent===c?"chosen":""} style={{background:c}} aria-label={"主色 "+c} aria-pressed={accent===c} onClick={()=>setAccent(c)}/>)}</div>
    <img className="orchestra-graphic-preview" alt="本機向量排版預覽" src={"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)}/>
   </div>}
  <button type="button" className="orchestra-export" disabled={busy||(photoMode&&!photo)} onClick={()=>void create()}>
   {busy?"製作中…":"下載本機 "+format.toUpperCase()}
  </button>
  {tool==="designcraft"&&<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("vanilla-open-luna"))}>在 LUNA 編輯圖層與海報</button>}
  {privateMode&&<small>私人模式：僅於此裝置處理，不向衞國後端傳送檔案。</small>}
  <p className="orchestra-feedback" role="status">{notice}</p>
 </section>;
}
