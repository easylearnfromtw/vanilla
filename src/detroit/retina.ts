/** Retina deterministic document export. Deliberately no model code or arbitrary HTML/script execution.
 * Output is generated in the browser, keeping the source data on-device.
 */
import {zipSync,strToU8} from 'fflate';
export type RetinaFormat='pdf'|'docx'|'pptx';
export type RetinaRequest={title:string;body:string;format:RetinaFormat};
export type RetinaExport={name:string;mime:string;bytes:Uint8Array;sections:number};
type Block={kind:'heading'|'subheading'|'paragraph'|'bullet';text:string};
const ns='http://schemas.openxmlformats.org/';
const xml=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const safeName=(s:string)=>s.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,70)||'Detroit_Report';
export function retinaParse(body:string):Block[]{
 if(body.length>160000)throw Error('Retina 最多接受 160,000 字元');
 return body.replace(/\r\n?/g,'\n').split('\n').flatMap(line=>{
  const t=line.trim();if(!t)return [];
  if(/^#{1,2}\s/.test(t))return [{kind:'heading' as const,text:t.replace(/^#{1,2}\s/,'').slice(0,500)}];
  if(/^#{3,6}\s/.test(t))return [{kind:'subheading' as const,text:t.replace(/^#{3,6}\s/,'').slice(0,500)}];
  if(/^(?:[-*•]|\d+[.)])\s/.test(t))return [{kind:'bullet' as const,text:t.replace(/^(?:[-*•]|\d+[.)])\s/,'').slice(0,2000)}];
  return [{kind:'paragraph' as const,text:t.slice(0,4000)}];
 });
}
function docx(title:string,blocks:Block[]):Uint8Array{
 const para=(text:string,kind:Block['kind'])=>{
  const style=kind==='heading'?'Heading1':kind==='subheading'?'Heading2':'Normal';
  const bullet=kind==='bullet'?'•  ':'';
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:spacing w:after="160"/></w:pPr><w:r><w:t xml:space="preserve">${xml(bullet+text)}</w:t></w:r></w:p>`;
 };
 const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${ns}wordprocessingml/2006/main"><w:body>${para(title,'heading')}${blocks.map(b=>para(b.text,b.kind)).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
 const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${ns}wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsia="Microsoft JhengHei" w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:color w:val="242424"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="A94435"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`;
 return zipSync({
  '[Content_Types].xml':strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
  '_rels/.rels':strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
  'word/_rels/document.xml.rels':strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
  'word/document.xml':strToU8(document),'word/styles.xml':strToU8(styles)
 },{level:6});
}
const slideNs='http://schemas.openxmlformats.org/presentationml/2006/main';
const drawNs='http://schemas.openxmlformats.org/drawingml/2006/main';
const relNs='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function slideShape(id:number,caption:string,x:number,y:number,w:number,h:number,fontSize=2200,heading=false):string{
 const paragraphs=caption.split('\n').map(t=>`<a:p><a:pPr algn="l"/><a:r><a:rPr lang="zh-TW" sz="${fontSize}"${heading?' b="1"':''}/><a:t>${xml(t)}</a:t></a:r><a:endParaRPr lang="zh-TW"/></a:p>`).join('');
 return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}
function pptx(title:string,blocks:Block[]):Uint8Array{
 const slides:{title:string;lines:string[]}[]=[];
 let current={title,lines:[] as string[]};
 for(const b of blocks){
  if(b.kind==='heading'&&(current.lines.length||current.title!==title)){slides.push(current);current={title:b.text,lines:[]};continue;}
  if(b.kind==='heading'&&current.title===title&&current.lines.length===0){current.title=b.text;continue;}
  const content=(b.kind==='bullet'?'•  ':'')+b.text;
  if(current.lines.length>=6||current.lines.reduce((a,s)=>a+s.length,0)+content.length>410){slides.push(current);current={title:b.kind==='heading'?b.text:current.title+' · 續',lines:[]};}
  current.lines.push(content.slice(0,450));
 }
 slides.push(current);if(slides.length>75)throw Error('Retina PPTX 最多 75 頁，請精簡內容');
 const types=[`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,`<Default Extension="xml" ContentType="application/xml"/>`,`<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`];
 const zipped:Record<string,Uint8Array>={};
 zipped['_rels/.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
 const masterRel=`<Relationship Id="rId${slides.length+1}" Type="${relNs}/slideMaster" Target="slideMasters/slideMaster1.xml"/>`;
 zipped['ppt/_rels/presentation.xml.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${relNs}/slide" Target="slides/slide${i+1}.xml"/>`).join('')}${masterRel}</Relationships>`);
 zipped['ppt/presentation.xml']=strToU8(`<p:presentation xmlns:p="${slideNs}" xmlns:a="${drawNs}" xmlns:r="${relNs}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId${slides.length+1}"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_,i)=>`<p:sldId id="${256+i}" r:id="rId${i+1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
 for(let i=0;i<slides.length;i++){
  const slide=slides[i];types.push(`<Override PartName="/ppt/slides/slide${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
  const bg=`<p:bg><p:bgPr><a:solidFill><a:srgbClr val="F7F4EE"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
  const titleText=slideShape(2,slide.title,650000,530000,11000000,1000000,3600,true);
  const lines=slide.lines.map((l,j)=>slideShape(j+3,l,720000,1900000+j*715000,10800000,690000,2000)).join('');
  zipped[`ppt/slides/slide${i+1}.xml`]=strToU8(`<p:sld xmlns:p="${slideNs}" xmlns:a="${drawNs}" xmlns:r="${relNs}"><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${titleText}${lines}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
  zipped[`ppt/slides/_rels/slide${i+1}.xml.rels`]=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relNs}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
 }
 types.push(`<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,`<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,`<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`);
 zipped['ppt/slideMasters/slideMaster1.xml']=strToU8(`<p:sldMaster xmlns:p="${slideNs}" xmlns:a="${drawNs}" xmlns:r="${relNs}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`);
 zipped['ppt/slideMasters/_rels/slideMaster1.xml.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relNs}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${relNs}/theme" Target="../theme/theme1.xml"/></Relationships>`);
 zipped['ppt/slideLayouts/slideLayout1.xml']=strToU8(`<p:sldLayout xmlns:p="${slideNs}" xmlns:a="${drawNs}" xmlns:r="${relNs}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
 zipped['ppt/slideLayouts/_rels/slideLayout1.xml.rels']=strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relNs}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
 zipped['ppt/theme/theme1.xml']=strToU8(`<a:theme xmlns:a="${drawNs}" name="Detroit"><a:themeElements><a:clrScheme name="Detroit"><a:dk1><a:srgbClr val="1F1E1C"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="343434"/></a:dk2><a:lt2><a:srgbClr val="F7F4EE"/></a:lt2>${['A94435','193F59','D2AF63','656F53','827BA1','4C92A5'].map((x,i)=>`<a:accent${i+1}><a:srgbClr val="${x}"/></a:accent${i+1}>`).join('')}<a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Detroit"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="Microsoft JhengHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="Microsoft JhengHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Detroit"><a:fillStyleLst><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);
 zipped['[Content_Types].xml']=strToU8(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${types.join('')}</Types>`);
 return zipSync(zipped,{level:6});
}
function concat(parts:Uint8Array[]):Uint8Array{const len=parts.reduce((n,p)=>n+p.length,0),r=new Uint8Array(len);let offset=0;for(const p of parts){r.set(p,offset);offset+=p.length;}return r;}
function pdfMake(jpgs:Uint8Array[],pageWidth:number,pageHeight:number):Uint8Array{
 const te=new TextEncoder(),objs:Uint8Array[]=[];
 const put=(s:string)=>objs.push(te.encode(s));
 const add=(s:string)=>{put(s);return objs.length;};
 add('<< /Type /Catalog /Pages 2 0 R >>');
 add('<< /Type /Pages /Kids ['+jpgs.map((_,i)=>`${3+i*3} 0 R`).join(' ')+`] /Count ${jpgs.length} >>`);
 for(let i=0;i<jpgs.length;i++){
  const j=jpgs[i],page=3+i*3,img=page+1,contents=page+2;
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${i} ${img} 0 R >> >> /Contents ${contents} 0 R >>`);
  objs.push(concat([te.encode(`<< /Type /XObject /Subtype /Image /Width ${pageWidth*2} /Height ${pageHeight*2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.length} >>\nstream\n`),j,te.encode('\nendstream')]));
  const stream=`q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im${i} Do Q`;
  add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 }
 const out:Uint8Array[]=[te.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')],offsets=[0];
 let pos=out[0].length;
 for(let i=0;i<objs.length;i++){
  offsets.push(pos);
  const chunk=concat([te.encode(`${i+1} 0 obj\n`),objs[i],te.encode('\nendobj\n')]);out.push(chunk);pos+=chunk.length;
 }
 const xref=pos;
 const x=te.encode(`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(i=>String(i).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
 out.push(x);return concat(out);
}
async function pdf(title:string,blocks:Block[]):Promise<Uint8Array>{
 if(typeof document==='undefined')throw Error('PDF 需要有 Canvas 的瀏覽器執行環境');
 const w=595,h=842,scale=2,jpgs:Uint8Array[]=[];
 const canvas=document.createElement('canvas');canvas.width=w*scale;canvas.height=h*scale;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas 不可用');ctx.scale(scale,scale);
 const drawStart=()=>{ctx.fillStyle='#f9f7f2';ctx.fillRect(0,0,w,h);ctx.fillStyle='#a94435';ctx.fillRect(64,94,46,5);ctx.fillStyle='#21211f';ctx.font='bold 22px sans-serif';ctx.fillText('DETROIT / RETINA',64,66);};
 const jpeg=async()=>{
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PDF page conversion failed')),'image/jpeg',0.88));
  jpgs.push(new Uint8Array(await blob.arrayBuffer()));
 };
 const wrap=(str:string,size:number,maxWidth=460):string[]=>{
  ctx.font=`${size}px sans-serif`;
  const lines:string[]=[];let line='';
  for(const char of str){if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}
  if(line)lines.push(line);return lines;
 };
 drawStart();let y=132;
 for(const b of [{kind:'heading',text:title} as Block,...blocks]){
  const size=b.kind==='heading'?22:b.kind==='subheading'?17:13;
  const lineHeight=size*1.7;
  const lines=wrap((b.kind==='bullet'?'•  ':'')+b.text,size);
  if(lines.length>200)throw Error('單一段落過長');
  for(let i=0;i<lines.length;i++){
   if(y+lineHeight>782){await jpeg();drawStart();y=132;}
   ctx.fillStyle=b.kind==='heading'?'#a94435':'#222222';ctx.font=`${b.kind==='heading'||b.kind==='subheading'?'bold ':''}${size}px sans-serif`;
   ctx.fillText(lines[i],64,y);y+=lineHeight;
  }
  y+=b.kind==='heading'?16:9;
  if(jpgs.length>120)throw Error('PDF 超過 120 頁');
 }
 await jpeg();return pdfMake(jpgs,w,h);
}
export async function createRetinaDocument(req:RetinaRequest):Promise<RetinaExport>{
 const title=req.title.trim().slice(0,120);if(!title)throw Error('請輸入文件標題');
 const blocks=retinaParse(req.body);if(blocks.length===0)throw Error('請輸入文件內容');
 const [bytes,mime]=req.format==='docx'?[docx(title,blocks),'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] as const:req.format==='pptx'?[pptx(title,blocks),'application/vnd.openxmlformats-officedocument.presentationml.presentation'] as const:[await pdf(title,blocks),'application/pdf'] as const;
 return {bytes,mime,name:safeName(title)+'.'+req.format,sections:blocks.length};
}
export function downloadRetina(result:RetinaExport){
 const data=new Uint8Array(result.bytes.length);data.set(result.bytes);
 const blob=new Blob([data.buffer],{type:result.mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=result.name;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),15000);
}