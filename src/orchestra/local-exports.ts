/** Deterministic local media fallbacks for Orchestra. No Craft binary, API request or HTML injection. */
export type PosterKind="vector"|"publication"|"slide";
const xml=(s:string)=>s.replace(/[\u0000-\u001f]/g," ").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const safeName=(s:string)=>s.replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").slice(0,70)||"Orchestra";
const palette=["#AF4634","#2956C7","#146B59","#472B75","#191919"] as const;
export function posterSvg(input:{title:string;body:string;kind:PosterKind;accent?:string}):string{
 const kind=input.kind,slide=kind==="slide",w=slide?1280:1080,h=slide?720:kind==="publication"?1350:1080;
 const accent=palette.includes(input.accent as typeof palette[number])?input.accent!:"#AF4634";
 const headline=Array.from(input.title.trim()||"ORCHESTRA").slice(0,65);
 const max=slide?28:16,maxTitleLines=slide?2:3;
 const titleLines:string[]=[];
 while(headline.length&&titleLines.length<maxTitleLines)titleLines.push(xml(headline.splice(0,max).join("")));
 if(headline.length&&titleLines.length)titleLines[titleLines.length-1]+="…";
 const lines=input.body.replace(/\r/g,"").split("\n").map(s=>s.trim()).filter(Boolean)
  .flatMap(s=>{const words=Array.from(s.slice(0,700)),out:string[]=[];while(words.length&&out.length<10)out.push(xml(words.splice(0,slide?60:33).join("")));return out;})
  .slice(0,slide?5:kind==="publication"?12:8);
 const top=slide?178:270,titleSize=slide?56:kind==="publication"?76:82;
 const titleLeading=titleSize+14;
 const topLines=titleLines.map((line,i)=>'<text x="90" y="'+(top+i*titleLeading)+'" font-family="sans-serif" font-size="'+titleSize+'" font-weight="800" fill="#24211F">'+line+'</text>').join("");
 const contentY=top+titleLines.length*titleLeading+35,step=slide?44:kind==="publication"?54:58;
 const maxBodyLines=Math.max(0,Math.floor((h-174-contentY)/step)+1);
 const content=lines.slice(0,maxBodyLines).map((line,i)=>'<text x="94" y="'+(contentY+i*step)+'" font-family="sans-serif" font-size="'+(slide?23:kind==="publication"?27:29)+'" fill="#4B4945">'+line+'</text>').join("");
 return '<?xml version="1.0" encoding="UTF-8"?>'+
 '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+
 '<rect width="'+w+'" height="'+h+'" fill="#F6F3EE"/><rect width="'+w+'" height="28" fill="'+accent+'"/>'+
 '<rect x="89" y="'+(slide?115:120)+'" width="110" height="12" fill="'+accent+'"/>'+
 '<text x="90" y="'+(slide?80:91)+'" font-family="sans-serif" font-size="25" font-weight="700" letter-spacing="4" fill="'+accent+'">ORCHESTRA / '+kind.toUpperCase()+'</text>'+
 topLines+content+
 '<rect x="90" y="'+(h-116)+'" width="'+(w-180)+'" height="2" fill="'+accent+'"/>'+
 '<text x="90" y="'+(h-70)+'" font-family="sans-serif" font-size="21" fill="#65625F">VANILLA AI · LOCAL GRAPHIC EXPORT</text></svg>';
}
export function downloadLocalBlob(blob:Blob,name:string):void{
 const a=document.createElement("a"),url=URL.createObjectURL(blob);
 a.href=url;a.download=safeName(name);document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),15000);
}
export async function svgAsBitmap(svg:string,mime:"image/png"|"image/jpeg"):Promise<Blob>{
 const source=new Blob([svg],{type:"image/svg+xml"}),url=URL.createObjectURL(source);
 try{
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error("SVG 預覽無法解碼"));image.src=url;});
  if(img.width>2048||img.height>2048)throw Error("圖片尺寸超過本機限制");
  const canvas=document.createElement("canvas");canvas.width=img.width;canvas.height=img.height;
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("此瀏覽器無法使用 Canvas");
  ctx.fillStyle="#FFFFFF";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,mime,.9));
  if(!blob)throw Error("瀏覽器沒有傳回圖片內容");return blob;
 }finally{URL.revokeObjectURL(url);}
}
export async function adjustPhoto(file:File,format:"png"|"jpeg",brightness:number,contrast:number,saturation:number):Promise<Blob>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8_000_000)throw Error("僅接受 8 MB 以下 PNG/JPEG/WebP 圖片");
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error("無法解析來源圖片"));i.src=url;});
  if(!img.naturalWidth||!img.naturalHeight)throw Error("圖片尺寸無效");
  const scale=Math.min(1,2000/Math.max(img.naturalWidth,img.naturalHeight));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=c.getContext("2d");if(!ctx)throw Error("無法啟用圖像處理器");
  ctx.fillStyle="#FFFFFF";ctx.fillRect(0,0,c.width,c.height);
  ctx.filter="brightness("+Math.max(25,Math.min(200,brightness))+"%) contrast("+Math.max(25,Math.min(200,contrast))+"%) saturate("+Math.max(0,Math.min(250,saturation))+"%)";
  ctx.drawImage(img,0,0,c.width,c.height);
  const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,"image/"+format,.91));
  if(!blob)throw Error("圖片輸出失敗");return blob;
 }finally{URL.revokeObjectURL(url);}
}
const push16=(b:number[],n:number)=>{b.push(n&255,(n>>8)&255);};
/** GIF89a encoder with literal-only LZW and frequent clear codes.
 * GIF palette and frames are bounded by the caller; every frame is independently decoded.
 */
export function encodeIndexedGif(frames:readonly Uint8Array[],width:number,height:number,delay=15):Uint8Array{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>100000||
  frames.length<2||frames.length>16||frames.some(f=>f.length!==width*height))throw Error("GIF 影格或尺寸不合法");
 const out:number[]=[71,73,70,56,57,97];push16(out,width);push16(out,height);out.push(0xF7,0,0);
 for(let i=0;i<256;i++){const r=Math.floor(i/36),g=Math.floor(i/6)%6,b=i%6;out.push(r<6?r*51:0,g*51,b*51);}
 out.push(0x21,0xFF,0x0B,...Array.from("NETSCAPE2.0").map(c=>c.charCodeAt(0)),3,1,0,0,0);
 for(const frame of frames){
  out.push(0x21,0xF9,4,0x04);push16(out,Math.max(3,Math.min(100,delay)));out.push(0,0);
  out.push(0x2C,0,0,0,0);push16(out,width);push16(out,height);out.push(0,8);
  const bytes:number[]=[];let buffer=0,bits=0;
  const code=(value:number)=>{buffer|=value<<bits;bits+=9;while(bits>=8){bytes.push(buffer&255);buffer>>>=8;bits-=8;}};
  code(256);
  let count=0;
  for(const pixel of frame){if(count===120){code(256);count=0;}code(pixel);count++;}
  code(257);if(bits)bytes.push(buffer&255);
  for(let offset=0;offset<bytes.length;offset+=255){const block=bytes.slice(offset,offset+255);out.push(block.length,...block);}
  out.push(0);
 }
 out.push(0x3B);return new Uint8Array(out);
}
export async function createMotionGif(title:string,body:string):Promise<Blob>{
 const w=320,h=180,c=document.createElement("canvas");c.width=w;c.height=h;
 const ctx=c.getContext("2d",{willReadFrequently:true});if(!ctx)throw Error("無法使用 Canvas");
 const frames:Uint8Array[]=[];
 for(let f=0;f<10;f++){
  ctx.fillStyle="#f6f3ee";ctx.fillRect(0,0,w,h);
  ctx.fillStyle="#AF4634";ctx.fillRect(0,0,w,8);
  ctx.fillStyle=f%2===0?"#2956C7":"#AF4634";ctx.fillRect(24+f*17,52,62,12);
  ctx.fillStyle="#222";ctx.font="bold 25px sans-serif";ctx.fillText(title.slice(0,17),24,103,270);
  ctx.fillStyle="#555";ctx.font="14px sans-serif";ctx.fillText(body.replace(/\s+/g," ").slice(0,32),24,140,270);
  const rgba=ctx.getImageData(0,0,w,h).data,indices=new Uint8Array(w*h);
  for(let p=0;p<indices.length;p++){const o=p*4;indices[p]=Math.round(rgba[o]/51)*36+Math.round(rgba[o+1]/51)*6+Math.round(rgba[o+2]/51);}
  frames.push(indices);
 }
 const bytes=encodeIndexedGif(frames,w,h,14);
 return new Blob([bytes.buffer as ArrayBuffer],{type:"image/gif"});
}
