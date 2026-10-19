/** LUNA on-device ML cutout: Apache-2.0 U²-NetP, 320px ONNX. No image upload. */
export const LUNA_CUTOUT_MODEL="https://huggingface.co/edgetools/u2netp/resolve/main/u2netp.onnx";
export const LUNA_CUTOUT_SHA256="309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8";
export const LUNA_CUTOUT_SIZE=4_574_861;
const SIDE=320;
const MEAN=[.485,.456,.406],STD=[.229,.224,.225];
export function lunaTensorPixels(rgba:Uint8ClampedArray):Float32Array{
 if(rgba.length!==SIDE*SIDE*4)throw Error("模型輸入像素大小不正確");
 const data=new Float32Array(3*SIDE*SIDE);
 for(let p=0;p<SIDE*SIDE;p++)for(let c=0;c<3;c++){
  data[c*SIDE*SIDE+p]=((rgba[p*4+c]/255)-MEAN[c])/STD[c];
 }
 return data;
}
export function lunaMaskPixels(values:Float32Array|number[]):Uint8ClampedArray{
 if(values.length!==SIDE*SIDE)throw Error("模型輸出形狀不正確");
 let min=Infinity,max=-Infinity;
 for(const n of values){if(Number.isFinite(n)){min=Math.min(min,n);max=Math.max(max,n);}}
 if(!Number.isFinite(min)||!Number.isFinite(max))throw Error("模型輸出無效");
 const diff=Math.max(1e-6,max-min),a=new Uint8ClampedArray(values.length*4);
 for(let i=0;i<values.length;i++){const alpha=Math.max(0,Math.min(255,(Number(values[i])-min)/diff*255));
  a[i*4]=255;a[i*4+1]=255;a[i*4+2]=255;a[i*4+3]=alpha;}
 return a;
}
async function verifyModel(buffer:ArrayBuffer){
 if(buffer.byteLength!==LUNA_CUTOUT_SIZE)throw Error("模型大小不符合已驗證版本");
 const digest=await crypto.subtle.digest("SHA-256",buffer);
 const hex=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
 if(hex!==LUNA_CUTOUT_SHA256)throw Error("模型雜湊不符，為安全起見停止載入");
}
const imageFrom=(src:string):Promise<HTMLImageElement>=>new Promise((resolve,reject)=>{
 const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error("圖片資料無法解碼"));img.src=src;
});
let cachedModel:Uint8Array|null=null;
async function modelBytes():Promise<Uint8Array>{
 if(cachedModel)return cachedModel;
 const r=await fetch(LUNA_CUTOUT_MODEL,{method:"GET",credentials:"omit",referrerPolicy:"no-referrer",redirect:"follow"});
 if(!r.ok)throw Error("無法下載 U²-NetP 模型（HTTP "+r.status+"）");
 const buffer=await r.arrayBuffer();
 await verifyModel(buffer);
 cachedModel=new Uint8Array(buffer);return cachedModel;
}
/** Only invoke after explicit user consent to download model + runtime (~5MB plus WASM).
 * ONNX inference and the selected image are processed entirely on the device.
 */
export async function removeLunaBackground(src:string):Promise<string>{
 if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)||src.length>2_800_000)throw Error("只能處理本機圖片圖層");
 const img=await imageFrom(src);
 const scale=Math.min(1,1200/Math.max(img.width,img.height));
 const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
 const input=document.createElement("canvas");input.width=SIDE;input.height=SIDE;
 const ictx=input.getContext("2d",{willReadFrequently:true});if(!ictx)throw Error("Canvas 不支援去背");
 ictx.drawImage(img,0,0,SIDE,SIDE);
 const rgba=ictx.getImageData(0,0,SIDE,SIDE).data;
 const tensor=lunaTensorPixels(rgba);
 const ort=await import("onnxruntime-web/wasm");
 ort.env.wasm.numThreads=1;
 ort.env.wasm.wasmPaths="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
 const bytes=await modelBytes();
 const session=await ort.InferenceSession.create(bytes,{executionProviders:["wasm"]});
 try{
  const results=await session.run({[session.inputNames[0]]:new ort.Tensor("float32",tensor,[1,3,SIDE,SIDE])});
  const raw=results[session.outputNames[0]]?.data;
  if(!(raw instanceof Float32Array))throw Error("模型未回傳有效遮罩");
  const pixels=lunaMaskPixels(raw);
  const mask=document.createElement("canvas");mask.width=SIDE;mask.height=SIDE;
  const maskData=new ImageData(SIDE,SIDE);maskData.data.set(pixels);
  mask.getContext("2d")?.putImageData(maskData,0,0);
  const out=document.createElement("canvas");out.width=w;out.height=h;
  const ctx=out.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("Canvas 不能套用遮罩");
  ctx.drawImage(img,0,0,w,h);
  const main=ctx.getImageData(0,0,w,h);
  const maskScaled=document.createElement("canvas");maskScaled.width=w;maskScaled.height=h;
  const mctx=maskScaled.getContext("2d");if(!mctx)throw Error("遮罩無法縮放");
  mctx.imageSmoothingEnabled=true;mctx.drawImage(mask,0,0,w,h);
  const a=mctx.getImageData(0,0,w,h).data;
  for(let i=0;i<main.data.length;i+=4)main.data[i+3]=Math.round(main.data[i+3]*a[i+3]/255);
  ctx.putImageData(main,0,0);
  let png=out.toDataURL("image/png");
  if(png.length>2_800_000){
   const small=document.createElement("canvas");small.width=Math.max(1,Math.floor(w*.65));small.height=Math.max(1,Math.floor(h*.65));
   small.getContext("2d")?.drawImage(out,0,0,small.width,small.height);
   png=small.toDataURL("image/png");
  }
  if(png.length>2_800_000)throw Error("去背成果超過本機圖層容量，請改用較小圖片");
  return png;
 }finally{void session.release();}
}
