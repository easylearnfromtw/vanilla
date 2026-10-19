/** Native iPhone browser document extraction. No document content leaves device here.
 * PPTX/DOCX use ZIP + OOXML; PDF uses PDF.js text layer (not OCR).
 */
import {unzipSync,strFromU8} from "fflate";
import {inspectExternalText,wrapExternalText} from "../security/trust-boundary";
import {parseCreamCSV} from "../cream/core";
export type ExtractedDocument={name:string;kind:"text"|"pdf"|"docx"|"pptx"|"xlsx";
 text:string;pages:number;tables:string[][][];truncated:boolean;warnings:string[]};
const MAX_UPLOAD=15*1024*1024, MAX_UNZIPPED=14*1024*1024, MAX_TEXT=28000;
const clean=(s:string)=>s.replace(/\u0000/g,"").replace(/[\t ]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
function parseXML(source:string):Document{
 const xml=new DOMParser().parseFromString(source,"application/xml");
 if(xml.querySelector("parsererror"))throw Error("文件 XML 格式損壞");
 return xml;
}
const nodeText=(el:Element)=>Array.from(el.getElementsByTagName("*")).filter(x=>x.localName==="t").map(x=>x.textContent||"").join("");
function detectTable(text:string):string[][][]{
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const datasets:string[][][]=[],parts:string[][]=[];
 let current:string[][]=[];
 const finish=()=>{if(current.length>=2&&current[0].length>=2)datasets.push(current);current=[];};
 for(const line of lines){
  const cols=line.includes("\t")?line.split("\t"):line.includes("|")?line.replace(/^\|/,"").replace(/\|$/,"").split("|"):null;
  if(!cols||cols.length<2||cols.length>12){finish();continue;}
  const row=cols.map(v=>v.trim());
  if(row.every(v=>/^:?-{3,}:?$/.test(v)))continue;
  if(current.length&&row.length!==current[0].length)finish();
  current.push(row);
  if(current.length>=3001){finish();}
 }
 finish();return datasets.slice(0,4);
}
export function extractDocxXML(xml:string):{text:string;tables:string[][][]}{
 const doc=parseXML(xml), paragraphs:Array<string>=[],tables:string[][][]=[];
 for(const table of Array.from(doc.getElementsByTagName("*")).filter(n=>n.localName==="tbl")){
  const rows=Array.from(table.children).filter(n=>n.localName==="tr").map(row=>
   Array.from(row.children).filter(n=>n.localName==="tc").map(nodeText));
  if(rows.length>=2&&rows[0]?.length>=2)tables.push(rows);
 }
 for(const p of Array.from(doc.getElementsByTagName("*")).filter(n=>n.localName==="p")){
  // Table paragraphs may also appear in the overall document text; never duplicate
  // the complete table in the model prompt when a native CREAM table exists.
  const text=nodeText(p).trim();if(text)paragraphs.push(text);
 }
 return {text:clean(paragraphs.join("\n")),tables:tables.slice(0,4)};
}
export function extractPptxXML(xml:string):string{
 const doc=parseXML(xml);
 const lines=Array.from(doc.getElementsByTagName("*")).filter(n=>n.localName==="p").map(nodeText).filter(Boolean);
 return clean(lines.join("\n"));
}
export function documentSummary(doc:ExtractedDocument):string{
 return "已讀取「"+doc.name+"」；格式 "+doc.kind.toUpperCase()+"、"+doc.pages+" 頁／段，"+
  doc.text.length+" 字元，偵測 "+doc.tables.length+" 個可分析表格。"+
  (doc.truncated?"文字過長，僅保留前 "+MAX_TEXT+" 字元。":"")+
  (doc.warnings.length?"\n限制："+doc.warnings.join("；"):"");
}
export function documentContext(doc:ExtractedDocument):string{
 if(!doc.text)return "";
 return wrapExternalText(("來源文件："+doc.name+"\n實際擷取文字（不是推測）：\n"+doc.text).slice(0,MAX_TEXT+120),"document");
}
export async function extractBrowserDocument(file:File):Promise<ExtractedDocument>{
 if(file.size>MAX_UPLOAD)throw Error("附件超過 15 MB，請先縮小檔案");
 const name=file.name,lower=name.toLowerCase(),warnings:string[]=[];
 let text="",pages=1,tables:string[][][]=[],kind:ExtractedDocument["kind"]="text";
 if(/\.(?:txt|md|csv|json|tsv|html)$/i.test(lower)||/^(text\/|application\/json)/.test(file.type)){
  text=await file.text();kind="text";
  tables=detectTable(text);
  if(/\.csv$/i.test(lower)){
   try{const dataset=parseCreamCSV(text,name);tables=[[dataset.columns,...dataset.rows]];}catch{/* Non-tabular CSV still retains extracted plain text. */}
  }
 }else if(/\.docx$/i.test(lower)){
  kind="docx";
  const archive=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:x=>x.name==="word/document.xml"});
  const xml=archive["word/document.xml"];
  if(!xml||xml.length>MAX_UNZIPPED)throw Error("Word 文件缺少正文或正文太大");
  const result=extractDocxXML(strFromU8(xml));
  text=result.text;tables=result.tables;
 }else if(/\.pptx$/i.test(lower)){
  kind="pptx";
  const archive=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:x=>/^ppt\/slides\/slide\d+\.xml$/.test(x.name)});
  const files=Object.keys(archive).sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1]||0)-Number(b.match(/slide(\d+)/)?.[1]||0)).slice(0,80);
  if(!files.length)throw Error("PowerPoint 找不到簡報頁面");
  pages=files.length;
  for(const filePath of files){
   if(archive[filePath].length>MAX_UNZIPPED)throw Error("簡報內容解壓超出容量上限");
   text+="\n[投影片 "+(Number(filePath.match(/slide(\d+)/)?.[1])||"?")+"]\n"+extractPptxXML(strFromU8(archive[filePath]));
  }
 }else if(/\.pdf$/i.test(lower)){
  kind="pdf";
  const pdfjs=await import("pdfjs-dist/build/pdf.mjs");
  const worker=(await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc=worker;
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),useSystemFonts:true}).promise;
  pages=pdf.numPages;const pageCount=Math.min(pdf.numPages,60);
  for(let i=1;i<=pageCount;i++){
   const page=await pdf.getPage(i);
   const content=await page.getTextContent();
   const words=content.items.filter((x):x is typeof content.items[number]&{str:string}=>"str" in x);
   const lines:string[]=[];let row="",prevY:number|null=null;
   for(const item of words){
    const y=("transform" in item&&Array.isArray(item.transform))?Math.round(item.transform[5]):0;
    if(prevY!==null&&Math.abs(y-prevY)>3){if(row.trim())lines.push(row);row="";}
    row+=(row?" ":"")+item.str;prevY=y;
   }
   if(row.trim())lines.push(row);
   text+="\n[PDF 第 "+i+" 頁]\n"+lines.join("\n");
   if(text.length>MAX_TEXT*2){warnings.push("PDF 文字過長，後段未讀取");break;}
  }
  if(pdf.numPages>pageCount)warnings.push("僅處理前 "+pageCount+" 頁");
  if(!clean(text.replace(/\[PDF 第 \d+ 頁\]/g,"")))warnings.push("此 PDF 可能是掃描影像，尚無 OCR，不能冒稱讀取內容");
 }else if(/\.xlsx$/i.test(lower)){
  kind="xlsx";
  const {readSheet}=await import("read-excel-file/browser");
  const sheet=await readSheet(file);
  const rows=sheet.slice(0,3001).map(row=>row.map(cell=>String(cell??"")));
  if(rows.length>1)tables=[rows];
  text=rows.slice(0,30).map(r=>r.join("\t")).join("\n");pages=1;
 }else throw Error("不支援此檔案；目前支援 PDF、DOCX、PPTX、XLSX、CSV、TXT、Markdown、JSON");
 text=clean(text);if(!text&&!tables.length)throw Error("文件未取得可閱讀文字；掃描版 PDF 尚需要 OCR");
 const check=inspectExternalText(text,"document");
 if(check.blocked)throw Error("文件內含疑似提示詞注入，已隔離此文件內容："+check.signals.join("、"));
 const truncated=text.length>MAX_TEXT;
 if(truncated)text=text.slice(0,MAX_TEXT);
 if(!tables.length)tables=detectTable(text);
 return {name,kind,text,pages,tables,truncated,warnings};
}
