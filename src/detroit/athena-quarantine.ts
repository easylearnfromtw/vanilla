/** Pure content inspection for untrusted files. Never invokes a parser that executes scripts.
 * This is NOT signature-database antivirus; unknown samples remain untrusted. */
export type ScanFinding={level:'block'|'warn';reason:string};
const suspicious=/\.(?:exe|dll|scr|bat|cmd|ps1|vbs|jar|apk|app|com|msi|sh|py|js|mjs|wasm|hta|reg|lnk)$/i;
const textDecoder=new TextDecoder('latin1');
function ascii(bytes:Uint8Array){return textDecoder.decode(bytes);}
function le16(b:Uint8Array,i:number){return (b[i]|b[i+1]<<8)>>>0;}
function le32(b:Uint8Array,i:number){return (b[i]|b[i+1]<<8|b[i+2]<<16|b[i+3]<<24)>>>0;}
/** Inspect ZIP central directory without decompressing (avoids zip bombs and macro payload extraction). */
export function inspectZipDirectory(bytes:Uint8Array,office:boolean):ScanFinding[]{
 const findings:ScanFinding[]=[];
 let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(le32(bytes,i)===0x06054b50){eocd=i;break;}}
 if(eocd<0)return [{level:'block',reason:'ZIP 中央目錄缺失或不完整'}];
 const entries=le16(bytes,eocd+10),size=le32(bytes,eocd+12),off=le32(bytes,eocd+16);
 if(entries>2000||size>8_000_000||off+size>bytes.length)return [{level:'block',reason:'ZIP 目錄異常（可能為壓縮炸彈或損壞）'}];
 let cursor=off,totalExpanded=0,wordParts=0;
 for(let i=0;i<entries;i++){
  if(cursor+46>bytes.length||le32(bytes,cursor)!==0x02014b50)return [{level:'block',reason:'ZIP 目錄項目格式異常'}];
  const filenameLen=le16(bytes,cursor+28),extraLen=le16(bytes,cursor+30),commentLen=le16(bytes,cursor+32);
  const sizeUncompressed=le32(bytes,cursor+24),sizeCompressed=le32(bytes,cursor+20);
  if(cursor+46+filenameLen>bytes.length)return [{level:'block',reason:'ZIP 檔名越界'}];
  const path=ascii(bytes.slice(cursor+46,cursor+46+filenameLen)).replace(/\\/g,'/');
  if(path.startsWith('/')||path.split('/').includes('..')||/^[a-zA-Z]:/.test(path))findings.push({level:'block',reason:'ZIP 路徑穿越'});
  if(suspicious.test(path)||/vbaProject\.bin|activex|embeddings\//i.test(path))findings.push({level:'block',reason:'ZIP/Office 含可執行程式或巨集'});
  if(/^word\//.test(path)||/^ppt\//.test(path)||/^xl\//.test(path))wordParts++;
  if(sizeCompressed>0&&sizeUncompressed>sizeCompressed*150)findings.push({level:'block',reason:'ZIP 壓縮倍率不合理'});
  totalExpanded+=sizeUncompressed;
  if(totalExpanded>80_000_000)findings.push({level:'block',reason:'ZIP 宣告解壓大小超過 80MB'});
  cursor+=46+filenameLen+extraLen+commentLen;
  if(findings.some(x=>x.level==='block'))return findings;
 }
 if(office&&wordParts===0)findings.push({level:'block',reason:'聲稱為 Office 文件，但缺少 Office 內容'});
 return findings;
}
export function athenaInspectBytes(name:string,mime:string,bytes:Uint8Array):ScanFinding[]{
 const findings:ScanFinding[]=[];
 const ext=name.toLowerCase().split('.').pop()||'';
 const magic=bytes.slice(0,8);
 const isPDF=magic[0]===37&&magic[1]===80&&magic[2]===68&&magic[3]===70&&magic[4]===45;
 const isZIP=magic[0]===80&&magic[1]===75&&magic[2]===3&&magic[3]===4;
 const isPNG=magic[0]===137&&magic[1]===80&&magic[2]===78&&magic[3]===71;
 const isJPG=magic[0]===255&&magic[1]===216&&magic[2]===255;
 const isGIF=magic[0]===71&&magic[1]===73&&magic[2]===70;
 const isWEBP=magic[0]===82&&magic[1]===73&&magic[2]===70&&magic[3]===70&&ascii(bytes.slice(8,12))==='WEBP';
 const isOffice=['docx','xlsx','pptx'].includes(ext);
 if((ext==='pdf'&&!isPDF)||(isOffice&&!isZIP)||(ext==='png'&&!isPNG)||(ext==='jpg'&&!isJPG)||(ext==='jpeg'&&!isJPG)||(ext==='gif'&&!isGIF)||(ext==='webp'&&!isWEBP))findings.push({level:'block',reason:'副檔名與檔案簽章不符（疑似偽裝檔案）'});
 if(isZIP&&!isOffice)findings.push({level:'block',reason:'不接受未知壓縮容器，需在受信任隔離掃描服務展開'});
 if(isOffice)findings.push(...inspectZipDirectory(bytes,true));
 if(isPDF){const source=ascii(bytes.slice(0,Math.min(bytes.length,300000)));if(/\/JavaScript\b|\/JS\b|\/Launch\b|\/RichMedia\b|\/OpenAction\b/i.test(source))findings.push({level:'block',reason:'PDF 包含動態指令或互動動作'});}
 if(bytes.length&&ascii(bytes.slice(0,Math.min(bytes.length,400000))).includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))findings.push({level:'block',reason:'EICAR 防毒測試字串'});
 if(/(application\/x-msdownload|application\/x-dosexec)/.test(mime))findings.push({level:'block',reason:'MIME 宣告為執行檔'});
 return findings;
}
/** Scan within a worker with a strict deadline; fallback locally *without executing* content. */
export async function scanAttachmentIsolated(file:Pick<File,'name'|'type'|'size'|'arrayBuffer'>):Promise<ScanFinding[]>{
 if(file.size>15*1024*1024)return [{level:'block',reason:'附件超過 Athena 最大掃描範圍'}];
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(typeof Worker==='undefined')return athenaInspectBytes(file.name,file.type,bytes);
 let worker:Worker|undefined;
 try{
  worker=new Worker(new URL('./athena.worker.ts',import.meta.url),{type:'module'});
  const current=worker;
  const result=await new Promise<ScanFinding[]>((resolve,reject)=>{
   const t=setTimeout(()=>{reject(new Error('Athena 檔案掃描逾時'));},6000);
   current.onmessage=(e:MessageEvent<{findings:ScanFinding[]}>)=>{clearTimeout(t);resolve(e.data.findings);};
   current.onerror=()=>{clearTimeout(t);reject(new Error('Athena Worker 失敗'));};
   current.postMessage({name:file.name,mime:file.type,bytes},[bytes.buffer]);
  });return result;
 }catch{
  // If worker already detached the bytes, reread file; never treat a scan failure as clean.
  try{return athenaInspectBytes(file.name,file.type,new Uint8Array(await file.arrayBuffer()));}catch{return [{level:'block',reason:'無法完成掃描，依安全政策拒絕此附件'}];}
 }finally{worker?.terminate();}
}