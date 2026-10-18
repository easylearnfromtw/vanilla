export type CellStyle={bold?:boolean;align?:"left"|"center"|"right";fill?:"none"|"soft"|"accent";format?:"general"|"currency"|"percent"};
export type SheetCell={raw:string;style?:CellStyle};
export type SheetTab={id:string;name:string;cells:Record<string,SheetCell>};
export type Workbook={version:1;id:string;name:string;sheets:SheetTab[];active:string;updatedAt:string;driveFileId?:string;driveVersion?:string};
const LIMIT_COLS=26,LIMIT_ROWS=200;
export function columnName(i:number){let n=i+1,out="";while(n>0){out=String.fromCharCode(65+(n-1)%26)+out;n=Math.floor((n-1)/26);}return out;}
export function cellAddress(row:number,col:number){return columnName(col)+(row+1);}
export function decodeAddress(input:string):{row:number;col:number}|null{
 const m=/^([A-Z]{1,2})([1-9][0-9]*)$/i.exec(input.trim());
 if(!m)return null;
 let col=0;for(const c of m[1].toUpperCase())col=col*26+c.charCodeAt(0)-64;
 const row=Number(m[2])-1;col--;
 return row>=0&&row<LIMIT_ROWS&&col>=0&&col<LIMIT_COLS?{row,col}:null;
}
export function newWorkbook(name="未命名表格"):Workbook{
 const id=crypto.randomUUID();const tab=crypto.randomUUID();
 return {version:1,id,name,sheets:[{id:tab,name:"工作表 1",cells:{}}],active:tab,updatedAt:new Date().toISOString()};
}
export function parseWorkbook(value:unknown):Workbook{
 if(!value||typeof value!=="object")throw Error("表格格式錯誤");
 const data=value as Partial<Workbook>;
 if(data.version!==1||!Array.isArray(data.sheets)||!data.sheets.length||data.sheets.length>20)throw Error("工作簿格式或版本不相容");
 const sheets:SheetTab[]=data.sheets.map((x,i)=>{
  if(!x||typeof x!=="object"||!x.cells||typeof x.cells!=="object")throw Error("表格儲存格格式錯誤");
  const cells:SheetTab["cells"]={};
  for(const [address,v] of Object.entries(x.cells)){
   if(!decodeAddress(address)||!v||typeof v!=="object"||typeof v.raw!=="string")continue;
   cells[address.toUpperCase()]={raw:v.raw.slice(0,10000),style:v.style};
  }
  return {id:typeof x.id==="string"?x.id:crypto.randomUUID(),name:String(x.name||"工作表 "+(i+1)).slice(0,60),cells};
 });
 return {version:1,id:typeof data.id==="string"?data.id:crypto.randomUUID(),name:String(data.name||"未命名表格").slice(0,120),sheets,active:sheets.find(x=>x.id===data.active)?.id||sheets[0].id,updatedAt:String(data.updatedAt||new Date().toISOString()),driveFileId:data.driveFileId,driveVersion:data.driveVersion};
}
export function activeSheet(book:Workbook):SheetTab{return book.sheets.find(x=>x.id===book.active)||book.sheets[0];}
export function getCell(book:Workbook,addr:string):SheetCell{return activeSheet(book).cells[addr.toUpperCase()]||{raw:""};}
function splitArguments(source:string):string[]{
 let level=0,start=0,quote=false;const out:string[]=[];
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(ch==='"')quote=!quote;
  if(quote)continue;
  if(ch==="(")level++;
  if(ch===")")level--;
  if(ch===","&&level===0){out.push(source.slice(start,i).trim());start=i+1;}
 }
 out.push(source.slice(start).trim());return out;
}
function evaluateFormula(source:string,lookup:(ref:string)=>number|string,depth=0):number|string{
 if(depth>12)throw Error("#DEPTH");
 const value=source.trim();
 if(!value)return "";
 if(/^"[^"]*"$/.test(value))return value.slice(1,-1);
 if(/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);
 if(/^[A-Z]{1,2}\d+$/i.test(value))return lookup(value.toUpperCase());
 const f=/^([A-Z]+)\((.*)\)$/i.exec(value);
 if(f){
  const fn=f[1].toUpperCase(),args=splitArguments(f[2]);
  const numerical=(arg:string):number[]=>{
   const range=/^([A-Z]{1,2}\d+):([A-Z]{1,2}\d+)$/i.exec(arg);
   if(range){
    const a=decodeAddress(range[1]),b=decodeAddress(range[2]);if(!a||!b)throw Error("#REF!");
    const out:number[]=[];
    for(let r=Math.min(a.row,b.row);r<=Math.max(a.row,b.row);r++)for(let c=Math.min(a.col,b.col);c<=Math.max(a.col,b.col);c++){
     const v=lookup(cellAddress(r,c));if(v!==""&&Number.isFinite(Number(v)))out.push(Number(v));
    }
    return out;
   }
   const result=evaluateFormula(arg,lookup,depth+1);
   return result===""?[]:Number.isFinite(Number(result))?[Number(result)]:[];
  };
  if(fn==="ROUND"){
   const x=Number(evaluateFormula(args[0]||"0",lookup,depth+1)),digits=Number(evaluateFormula(args[1]||"0",lookup,depth+1));
   if(!Number.isFinite(x)||!Number.isInteger(digits)||Math.abs(digits)>12)throw Error("#VALUE!");
   const pow=Math.pow(10,digits);return Math.round(x*pow)/pow;
  }
  if(fn==="IF"){
   const condition=args[0]||"";
   const m=/(.*?)(>=|<=|<>|=|>|<)(.*)/.exec(condition);
   const truth=m?(()=>{
    const l=evaluateFormula(m[1],lookup,depth+1),r=evaluateFormula(m[3],lookup,depth+1);
    const a=Number(l),b=Number(r);
    const cmp=Number.isFinite(a)&&Number.isFinite(b)?Math.sign(a-b):String(l).localeCompare(String(r));
    return m[2]==">="?cmp>=0:m[2]==="<="?cmp<=0:m[2]==="<>"?cmp!==0:m[2]==="="?cmp===0:m[2]===">"?cmp>0:cmp<0;
   })():Boolean(Number(evaluateFormula(condition,lookup,depth+1)));
   return evaluateFormula(args[truth?1:2]||'""',lookup,depth+1);
  }
  const all=args.flatMap(numerical);
  if(fn==="SUM")return all.reduce((a,b)=>a+b,0);
  if(fn==="AVERAGE")return all.length?all.reduce((a,b)=>a+b,0)/all.length:0;
  if(fn==="COUNT")return all.length;
  if(fn==="MAX")return all.length?Math.max(...all):0;
  if(fn==="MIN")return all.length?Math.min(...all):0;
  throw Error("#NAME?");
 }
 // Numeric arithmetic and cell references; never use eval or Function.
 const tokens=value.match(/\s*(?:\d+(?:\.\d+)?|[A-Z]{1,2}\d+|[()+*\/-])\s*/gi);
 if(!tokens||tokens.join("").replace(/\s/g,"").toUpperCase()!==value.replace(/\s/g,"").toUpperCase())throw Error("#FORMULA!");
 const parts=tokens.map(x=>x.trim());let index=0;
 const factor=():number=>{
  const t=parts[index++];if(!t)throw Error("#FORMULA!");
  if(t==="-")return -factor();
  if(t==="+")return factor();
  if(t==="("){const n=expr();if(parts[index++]!==")")throw Error("#FORMULA!");return n;}
  if(/^\d/.test(t))return Number(t);
  if(/^[A-Z]{1,2}\d+$/i.test(t))return Number(lookup(t.toUpperCase()))||0;
  throw Error("#FORMULA!");
 };
 const term=():number=>{let n=factor();while(parts[index]==="*"||parts[index]==="/"){const op=parts[index++],other=factor();if(op==="/"&&other===0)throw Error("#DIV/0!");n=op==="*"?n*other:n/other;}return n;};
 const expr=():number=>{let n=term();while(parts[index]==="+"||parts[index]==="-"){const op=parts[index++],other=term();n=op==="+"?n+other:n-other;}return n;};
 const result=expr();if(index!==parts.length||!Number.isFinite(result))throw Error("#VALUE!");return result;
}
export function cellValue(book:Workbook,ref:string):string|number{
 const sheet=activeSheet(book),cache=new Map<string,number|string>(),active=new Set<string>();
 const read=(address:string):number|string=>{
  address=address.toUpperCase();
  if(cache.has(address))return cache.get(address)!;
  if(active.has(address))throw Error("#CYCLE!");
  active.add(address);
  const raw=sheet.cells[address]?.raw||"";
  try{
   const result=raw.startsWith("=")?evaluateFormula(raw.slice(1),read):raw.trim()!==""&&Number.isFinite(Number(raw))?Number(raw):raw;
   cache.set(address,result);return result;
  }finally{active.delete(address);}
 };
 try{return read(ref.toUpperCase());}catch(e){return e instanceof Error?e.message:"#ERROR";}
}
export function cellDisplay(book:Workbook,ref:string):string{
 const value=cellValue(book,ref),style=getCell(book,ref).style;
 if(typeof value!=="number")return value;
 if(style?.format==="currency")return new Intl.NumberFormat("zh-TW",{style:"currency",currency:"TWD",maximumFractionDigits:2}).format(value);
 if(style?.format==="percent")return (value*100).toLocaleString("zh-TW",{maximumFractionDigits:2})+"%";
 return Number.isInteger(value)?String(value):String(Math.round(value*100000)/100000);
}
export function setCell(book:Workbook,address:string,raw:string,style?:CellStyle):Workbook{
 if(!decodeAddress(address))throw Error("儲存格位址超出範圍");
 const cells={...activeSheet(book).cells};
 const current=cells[address.toUpperCase()];
 if(raw===""&&!style&&!current?.style)delete cells[address.toUpperCase()];
 else cells[address.toUpperCase()]={raw:raw.slice(0,10000),style:style||current?.style};
 return {...book,updatedAt:new Date().toISOString(),sheets:book.sheets.map(x=>x.id===book.active?{...x,cells}:x)};
}
export function importRows(book:Workbook,rows:string[][]):Workbook{
 let next=book;
 for(let r=0;r<Math.min(rows.length,LIMIT_ROWS);r++)for(let c=0;c<Math.min(rows[r]?.length||0,LIMIT_COLS);c++)next=setCell(next,cellAddress(r,c),String(rows[r][c]??""));
 return next;
}
export function toRows(book:Workbook,values=true):string[][]{
 const sheet=activeSheet(book),positions=Object.keys(sheet.cells).map(decodeAddress).filter((x):x is {row:number;col:number}=>Boolean(x));
 const endRow=Math.min(200,Math.max(10,1+Math.max(-1,...positions.map(x=>x.row))));
 const endCol=Math.min(26,Math.max(6,1+Math.max(-1,...positions.map(x=>x.col))));
 return Array.from({length:endRow},(_,r)=>Array.from({length:endCol},(_,c)=>values?cellDisplay(book,cellAddress(r,c)):getCell(book,cellAddress(r,c)).raw));
}
export function parseCSV(csv:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],value="",quoted=false;
 for(let i=0;i<csv.length;i++){
  const char=csv[i];
  if(quoted){if(char==='"'&&csv[i+1]==='"'){value+='"';i++;}else if(char==='"')quoted=false;else value+=char;}
  else if(char==='"')quoted=true;
  else if(char===","){row.push(value);value="";}
  else if(char==="\n"){row.push(value);rows.push(row);row=[];value="";}
  else if(char!=="\r")value+=char;
 }
 row.push(value);rows.push(row);
 return rows;
}
export function toCSV(book:Workbook):string{
 const csvSafe=(value:string)=>{
  // CSV should be safe to open in Excel: neutralize values that may be interpreted as formulas.
  const safe=/^[\s\t\r]*[=+@-]/.test(value)?"'"+value:value;
  return '"'+safe.replace(/"/g,'""')+'"';
 };
 return "\uFEFF"+toRows(book).map(row=>row.map(csvSafe).join(",")).join("\r\n");
}
