/** Retina image ingestion and vision availability checks.
 * Ingestion runs on-device. Recognition is performed only by an explicitly
 * approved image-capable model; never fall back to a text-only model.
 */
export type RetinaImageInput={mimeType:string;data:string};
export const RETINA_MAX_IMAGE_BYTES=8*1024*1024;
const DIRECT=new Set(["image/jpeg","image/png","image/webp"]);
const CONVERT=new Set(["image/heic","image/heif","image/gif","image/bmp","image/avif"]);
const EXTENSION:Record<string,string>={
 jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",
 heic:"image/heic",heif:"image/heif",gif:"image/gif",bmp:"image/bmp",avif:"image/avif"
};
export function isRetinaImageFile(file:Pick<File,"name"|"type">):boolean{
 const type=(file.type||"").toLowerCase().split(";")[0];
 if(type.startsWith("image/"))return true;
 const ext=file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]||"";
 return Boolean(EXTENSION[ext])&&(type===""||type==="application/octet-stream");
}
export function retinaImageType(file:Pick<File,"name"|"type"|"size">):{mimeType:string;convert:boolean}{
 if(!file.size)throw new Error("Retina：圖片是空白檔案，請重新選擇。");
 if(file.size>RETINA_MAX_IMAGE_BYTES)throw new Error("Retina：圖片超過 8 MB，請先壓縮或縮小圖片。");
 const reported=(file.type||"").toLowerCase().split(";")[0];
 const ext=file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]||"";
 const mimeType=reported&&reported!=="application/octet-stream"?reported:EXTENSION[ext]||"";
 if(DIRECT.has(mimeType))return {mimeType,convert:false};
 if(CONVERT.has(mimeType))return {mimeType,convert:true};
 throw new Error("Retina：尚未支援這種圖片格式。請使用 JPEG、PNG、WebP，或可由瀏覽器開啟的 HEIC、HEIF、GIF、BMP、AVIF。");
}
function readBase64(blob:Blob):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>{const data=String(reader.result||"").split(",")[1];data?resolve(data):reject(new Error("Retina：圖片內容讀取失敗。"));};
  reader.onerror=()=>reject(new Error("Retina：圖片讀取失敗。"));
  reader.readAsDataURL(blob);
 });
}
async function browserConvertToJpeg(file:File):Promise<RetinaImageInput>{
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{
   const element=new Image();
   element.onload=()=>resolve(element);
   element.onerror=()=>reject(new Error("Retina：這種圖片格式無法在目前瀏覽器解碼。請先轉成 JPEG 或 PNG。"));
   element.src=url;
  });
  const width=img.naturalWidth,height=img.naturalHeight;
  if(width<1||height<1)throw new Error("Retina：圖片尺寸不正確。");
  const scale=Math.min(1,2048/Math.max(width,height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(width*scale));
  canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Retina：裝置無法啟用圖片轉檔 Canvas。");
  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const jpeg=await new Promise<Blob>((resolve,reject)=>{
   canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Retina：圖片轉檔失敗。")),"image/jpeg",0.85);
  });
  if(jpeg.size>RETINA_MAX_IMAGE_BYTES)throw new Error("Retina：轉檔後的圖片仍太大。");
  return {mimeType:"image/jpeg",data:await readBase64(jpeg)};
 }finally{URL.revokeObjectURL(url);}
}
/** Canvas decoding for iPhone HEIC and other non-Gemini input formats happens locally. */
export async function readRetinaVisionImage(file:File):Promise<RetinaImageInput>{
 const type=retinaImageType(file);
 return type.convert?browserConvertToJpeg(file):{mimeType:type.mimeType,data:await readBase64(file)};
}
export function retinaUnavailableMessage(context:{
 privateMode:boolean;localOnly:boolean;online:boolean;geminiConfigured:boolean;cloudAllowed:boolean;
}):string{
 if(context.privateMode||context.localOnly)return "Retina 目前沒有可用的裝置端視覺模型；私密／僅本地模式不會傳送圖片到雲端。請使用一般模式並明確授權 Gemini，或日後安裝真正支援圖片的本地模型。";
 if(!context.online)return "Retina 無法離線辨識圖片：目前沒有可用的裝置端視覺模型。請連線後再試，圖片尚未傳送。";
 if(!context.geminiConfigured)return "Retina 已接收圖片，但尚未連接支援圖片的 Gemini API。請到模型與工具設定連接 Gemini；文字版 WebLLM／DeepSeek 無法讀取圖片。";
 if(!context.cloudAllowed)return "Retina 需要你在模型與工具中開啟雲端模型，並同意圖片傳送到 Gemini；在核准前圖片不會上傳。";
 return "Retina 目前找不到可用的圖片模型。請檢查 Gemini 設定、網路與模型額度。";
}
