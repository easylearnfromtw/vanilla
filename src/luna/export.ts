import type {LunaDoc,LunaLayer} from "./model";
const imageFromData=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
 const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error("圖片解碼失敗"));img.src=src;
});
function lines(ctx:CanvasRenderingContext2D,text:string,width:number){
 const out:string[]=[];for(const paragraph of text.split("\n")){let row="";
  for(const char of Array.from(paragraph)){if(row&&ctx.measureText(row+char).width>width){out.push(row);row=char;}else row+=char;}
  out.push(row);
 }return out;
}
function pathRounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,radius:number){
 const r=Math.min(Math.max(0,radius),w/2,h/2);
 ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
 ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
 ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
 ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
async function paint(ctx:CanvasRenderingContext2D,doc:LunaDoc,l:LunaLayer){
 const x=l.x*doc.width,y=l.y*doc.height,w=l.w*doc.width,h=l.h*doc.height;
 ctx.save();ctx.globalAlpha=l.opacity;
 if(l.kind==="shape"){ctx.fillStyle=l.fill;pathRounded(ctx,x,y,w,h,(l.radius||0)*Math.min(w,h)/100);ctx.fill();}
 if(l.kind==="image"){
  ctx.fillStyle=l.fill;ctx.fillRect(x,y,w,h);
  if(l.image){const img=await imageFromData(l.image),scale=Math.max(w/img.width,h/img.height),iw=img.width*scale,ih=img.height*scale;
   pathRounded(ctx,x,y,w,h,(l.radius||0)*Math.min(w,h)/100);ctx.clip();ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);}
 }
 if(l.kind==="text"){
  const size=l.fontSize||65,leading=size*1.16;
  ctx.fillStyle=l.color;ctx.font=String(l.fontWeight||700)+" "+size+"px system-ui, 'Noto Sans TC', sans-serif";
  ctx.textBaseline="top";ctx.textAlign=l.align||"left";
  const xx=l.align==="center"?x+w/2:l.align==="right"?x+w:x;
  const rows=lines(ctx,l.text||"",w);
  for(let i=0;i<rows.length&&i*leading<h;i++)ctx.fillText(rows[i],xx,y+i*leading,w);
 }
 ctx.restore();
}
export async function lunaPNG(doc:LunaDoc):Promise<Blob>{
 const c=document.createElement("canvas");c.width=doc.width;c.height=doc.height;
 const ctx=c.getContext("2d");if(!ctx)throw Error("瀏覽器不支援 Canvas");
 ctx.fillStyle=doc.background;ctx.fillRect(0,0,c.width,c.height);
 for(const layer of doc.layers)await paint(ctx,doc,layer);
 const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,"image/png"));
 if(!blob)throw Error("無法輸出 PNG");return blob;
}
export function saveLunaFile(filename:string,blob:Blob){
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=filename;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export async function importLunaImage(file:File):Promise<string>{
 if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw Error("只接受 PNG、JPEG 或 WebP");
 if(file.size>8_000_000)throw Error("圖片檔案不得超過 8 MB");
 const source=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error("讀取圖片失敗"));reader.readAsDataURL(file);
 });
 const img=await imageFromData(source);
 const ratio=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
 const canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
 const ctx=canvas.getContext("2d");if(!ctx)throw Error("無法處理圖片");
 ctx.drawImage(img,0,0,canvas.width,canvas.height);
 const result=canvas.toDataURL("image/jpeg",.82);
 if(result.length>2_800_000)throw Error("圖片壓縮後仍超過限制，請縮小後匯入");
 return result;
}
