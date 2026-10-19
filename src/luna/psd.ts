/** PSD interoperability: rasterized editable pixel layers, no imported scripts or network. */
import {readPsd,writePsd} from "ag-psd";
import {createLuna,parseLuna,type LunaDoc,type LunaLayer} from "./model";
import {lunaPNG} from "./export";
const MAX_PSD_BYTES=24_000_000,MAX_SIDE=4096,MAX_LAYERS=60;
export const validatePsdSize=(size:number)=>{
 if(!Number.isFinite(size)||size<1||size>MAX_PSD_BYTES)throw Error("PSD 必須小於 24 MB");
};
export function psdPosition(left:number,top:number,width:number,height:number,docWidth:number,docHeight:number){
 if(![left,top,width,height,docWidth,docHeight].every(Number.isFinite)||width<1||height<1||docWidth<1||docHeight<1)throw Error("PSD 圖層尺寸無效");
 const x=Math.max(0,left/docWidth),y=Math.max(0,top/docHeight);
 return {x:Math.min(.998,x),y:Math.min(.998,y),w:Math.min(1-Math.min(.998,x),width/docWidth),h:Math.min(1-Math.min(.998,y),height/docHeight)};
}
const waitImage=(source:string):Promise<HTMLImageElement>=>new Promise((resolve,reject)=>{
 const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error("圖片無法解碼"));img.src=source;
});
async function canvasFromLayer(doc:LunaDoc,l:LunaLayer):Promise<HTMLCanvasElement>{
 const w=Math.max(1,Math.round(l.w*doc.width)),h=Math.max(1,Math.round(l.h*doc.height));
 const c=document.createElement("canvas");c.width=w;c.height=h;
 const ctx=c.getContext("2d");if(!ctx)throw Error("無法建立 PSD 圖層");
 ctx.globalAlpha=l.opacity;
 if(l.kind==="shape"){ctx.fillStyle=l.fill;ctx.fillRect(0,0,w,h);}
 if(l.kind==="text"){
  ctx.fillStyle=l.color;const fs=l.fontSize||65;
  ctx.font=String(l.fontWeight||700)+" "+fs+"px system-ui, sans-serif";ctx.textBaseline="top";
  ctx.textAlign=l.align||"left";const x=l.align==="center"?w/2:l.align==="right"?w:0;
  let y=0;
  for(const paragraph of (l.text||"").split("\n")){
   let line="";for(const ch of Array.from(paragraph)){if(line&&ctx.measureText(line+ch).width>w){ctx.fillText(line,x,y,w);y+=fs*1.16;line=ch;}else line+=ch;}
   if(y<h)ctx.fillText(line,x,y,w);y+=fs*1.16;if(y>=h)break;
  }
 }
 if(l.kind==="image"&&l.image){
  const image=await waitImage(l.image),scale=Math.max(w/image.width,h/image.height),dw=image.width*scale,dh=image.height*scale;
  ctx.drawImage(image,(w-dw)/2,(h-dh)/2,dw,dh);
 }
 return c;
}
export async function exportLunaPSD(doc:LunaDoc):Promise<Blob>{
 if(doc.width>MAX_SIDE||doc.height>MAX_SIDE||doc.layers.length>MAX_LAYERS)throw Error("PSD 畫布或圖層超出限制");
 const children:Array<{name:string;top:number;left:number;canvas:HTMLCanvasElement}>=[];
 const base=document.createElement("canvas");base.width=doc.width;base.height=doc.height;
 const b=base.getContext("2d");if(!b)throw Error("無法建立背景");
 b.fillStyle=doc.background;b.fillRect(0,0,doc.width,doc.height);
 children.push({name:"LUNA Background",top:0,left:0,canvas:base});
 for(const layer of doc.layers){
  const canvas=await canvasFromLayer(doc,layer);
  children.unshift({name:layer.label.slice(0,70),left:Math.round(layer.x*doc.width),top:Math.round(layer.y*doc.height),canvas});
 }
 const composite=await lunaPNG(doc),img=await createImageBitmap(composite);
 const flattened=document.createElement("canvas");flattened.width=doc.width;flattened.height=doc.height;
 flattened.getContext("2d")?.drawImage(img,0,0);img.close();
 const output=writePsd({width:doc.width,height:doc.height,canvas:flattened,children});
 return new Blob([output],{type:"image/vnd.adobe.photoshop"});
}
export async function importLunaPSD(file:File):Promise<{doc:LunaDoc;warnings:string[]}>{
 validatePsdSize(file.size);
 const bytes=await file.arrayBuffer();
 if(new TextDecoder().decode(bytes.slice(0,4))!=="8BPS")throw Error("非 PSD 格式或檔案受損");
 const psd=readPsd(bytes,{skipThumbnail:true});
 if(psd.width<1||psd.height<1||psd.width>MAX_SIDE||psd.height>MAX_SIDE)throw Error("PSD 解析度需介於 1–4096");
 const doc=createLuna("minimal");
 const layers:LunaLayer[]=[];
 let skipped=0;const warnings:string[]=[];
 function walk(items:typeof psd.children,depth:number){
  if(depth>6||!items)return;
  for(const item of items){
   if(layers.length>=MAX_LAYERS){skipped++;continue;}
   if(item.children?.length){walk(item.children,depth+1);continue;}
   if(item.hidden)continue;
   const canvas=item.canvas;
   if(!canvas||!canvas.width||!canvas.height){skipped++;continue;}
   const imageCanvas=document.createElement("canvas");
   const max=Math.max(canvas.width,canvas.height),scale=Math.min(1,1500/max);
   imageCanvas.width=Math.max(1,Math.round(canvas.width*scale));imageCanvas.height=Math.max(1,Math.round(canvas.height*scale));
   imageCanvas.getContext("2d")?.drawImage(canvas,0,0,imageCanvas.width,imageCanvas.height);
   let image=imageCanvas.toDataURL("image/png");
   if(image.length>2_800_000){skipped++;continue;}
   const p=psdPosition(item.left||0,item.top||0,canvas.width,canvas.height,psd.width,psd.height);
   layers.push({id:"luna-psd-"+layers.length+"-"+Math.random().toString(36).slice(2),kind:"image",
    label:String(item.name||"PSD 圖層").slice(0,70),x:p.x,y:p.y,w:Math.max(.002,p.w),h:Math.max(.002,p.h),
    color:"#202020",fill:"#FFFFFF",opacity:typeof item.opacity==="number"?Math.min(1,Math.max(0,item.opacity/255)):1,
    image,radius:0});
  }
 }
 walk(psd.children,0);
 if(!layers.length){
  const canvas=psd.canvas;if(!canvas)throw Error("此 PSD 無法轉為可讀圖層");
  const img=canvas.toDataURL("image/png");
  if(img.length>2_800_000)throw Error("合成圖過大，請縮小 PSD 後匯入");
  layers.push({id:"luna-psd-flattened",kind:"image",label:"PSD 合成圖",x:0,y:0,w:1,h:1,color:"#202020",fill:"#FFFFFF",opacity:1,image:img});
  warnings.push("僅能匯入合成畫面，原圖層無法分離。");
 }
 if(skipped)warnings.push("略過 "+skipped+" 個不支援或過大的圖層。");
 warnings.push("PSD 文字、智慧物件與特殊效果會轉為點陣圖層，不保留 Photoshop 文字編輯資訊。");
 layers.reverse();
 return {doc:parseLuna({...doc,width:psd.width,height:psd.height,name:file.name.replace(/\.psd$/i,"").slice(0,80),background:"#FFFFFF",layers}),warnings};
}
