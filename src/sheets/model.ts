export type CellFormat="plain"|"number"|"currency"|"percent";
export type CellAlign="left"|"center"|"right";
export type CellStyle={bold?:boolean;fill?:string;color?:string;align?:CellAlign;format?:CellFormat};
export type SheetCell={value:string;style?:CellStyle};
export type Sheet={id:string;name:string;cells:Record<string,SheetCell>};
export type Workbook={version:1;title:string;sheets:Sheet[];updatedAt:string};
export const LIMIT_ROWS=200;
export const LIMIT_COLS=26;
const STORAGE_KEY="vanilla.sheets.workbook.v1";
const ADDR=/^([A-Z]{1,2})([1-9]\d{0,2})$/;
export const COLORS=["#ffffff","#f3f4f6","#e8edfa","#e3f4ec","#fff0d6","#fce8e6","#171717","#286ed8","#138354","#b45309"];
export const now=()=>new Date().toISOString();
export function colName(index:number):string{let n=index+1,s="";do{s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)-1;}while(n>=0);return s;}
export function parseAddress(address:string):{row:number;col:number}|null{
 const m=ADDR.exec(address.trim().toUpperCase());if(!m)return null;
 let col=0;for(const char of m[1])col=col*26+char.charCodeAt(0)-64;
 const row=Number(m[2])-1;if(row<0||row>=LIMIT_ROWS||col<1||col>LIMIT_COLS)return null;
 return {row,col:col-1};
}
export function addressOf(row:number,col:number){return colName(col)+(row+1);}
export function rect(range:string):string[]{
 const parts=range.toUpperCase().replace(/\$/g,"").split(":");
 if(parts.length>2)return [];
 const a=parseAddress(parts[0]),b=parseAddress(parts[1]||parts[0]);
 if(!a||!b)return [];
 const result:string[]=[];
 for(let row=Math.min(a.row,b.row);row<=Math.max(a.row,b.row);row++)
  for(let col=Math.min(a.col,b.col);col<=Math.max(a.col,b.col);col++)result.push(addressOf(row,col));
 return result;
}
export function makeSheet(name="工作表 1"):Sheet{return {id:crypto.randomUUID(),name,cells:{}};}
export function emptyWorkbook():Workbook{return {version:1,title:"未命名試算表",sheets:[makeSheet()],updatedAt:now()};}
export function isWorkbook(data:unknown):data is Workbook{
 if(!data||typeof data!=="object")return false;
 const d=data as Partial<Workbook>;
 return d.version===1&&typeof d.title==="string"&&d.title.length<=160&&Array.isArray(d.sheets)&&d.sheets.length>0&&d.sheets.length<=24&&d.sheets.every(s=>s&&typeof s.id==="string"&&typeof s.name==="string"&&s.name.length<=80&&s.cells&&typeof s.cells==="object"&&!Array.isArray(s.cells)&&Object.keys(s.cells).length<=5200&&Object.entries(s.cells).every(([addr,cell])=>Boolean(parseAddress(addr))&&cell&&typeof cell.value==="string"&&cell.value.length<=8000));
}
export function loadWorkbook():Workbook{
 try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null") as unknown;if(isWorkbook(value))return value;}catch{}
 return emptyWorkbook();
}
export function saveWorkbook(book:Workbook){localStorage.setItem(STORAGE_KEY,JSON.stringify(book));}
export function getCell(sheet:Sheet,addr:string){return sheet.cells[addr.toUpperCase()];}
export function setCell(sheet:Sheet,addr:string,value:string,style?:CellStyle){
 const key=addr.toUpperCase();if(!parseAddress(key))throw new Error("超出表格範圍："+addr);
 if(value.length>8000)throw new Error("儲存格內容太長");
 const old=sheet.cells[key],merged=style?{...(old?.style||{}),...style}:old?.style;
 if(!value&&!merged)delete sheet.cells[key];else sheet.cells[key]={value,style:merged};
}
export function setCellStyle(sheet:Sheet,addr:string,style:CellStyle){
 const old=sheet.cells[addr]||{value:""};
 sheet.cells[addr]={value:old.value,style:{...old.style,...style}};
}
function numeric(value:unknown){if(typeof value==="number")return value;if(value==null||value==="")return 0;const n=Number(String(value).replaceAll(",",""));return Number.isFinite(n)?n:0;}
type Token={type:"number"|"word"|"symbol"|"string";value:string};
function lex(formula:string):Token[]{
 const tokens:Token[]=[];let i=0;
 while(i<formula.length){
  const s=formula.slice(i);if(/^\s/.test(s)){i++;continue;}
  let m=/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s);if(m){tokens.push({type:"number",value:m[0]});i+=m[0].length;continue;}
  m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(s);if(m){tokens.push({type:"word",value:m[0].toUpperCase()});i+=m[0].length;continue;}
  if(s[0]==='"'){let j=i+1,value="";while(j<formula.length){if(formula[j]==='"'){if(formula[j+1]==='"'){value+='"';j+=2;continue;}break;}value+=formula[j++];}if(j>=formula.length)throw new Error("#ERROR!");tokens.push({type:"string",value});i=j+1;continue;}
  if("+-*/^(),:<>=".includes(s[0])){tokens.push({type:"symbol",value:s[0]});i++;continue;}
  throw new Error("#ERROR!");
 }
 return tokens;
}
export function evaluateCell(sheet:Sheet,address:string,seen=new Set<string>()):string|number{
 const addr=address.toUpperCase(),entry=sheet.cells[addr];if(!entry)return "";
 if(!entry.value.startsWith("="))return entry.value;
 if(seen.has(addr))return "#CYCLE!";
 if(seen.size>70)return "#CYCLE!";
 const next=new Set(seen);next.add(addr);
 try{
  const tokens=lex(entry.value.slice(1));let pos=0;
  const peek=()=>tokens[pos],take=()=>tokens[pos++];
  const consume=(s:string)=>{if(peek()?.value===s){pos++;return true;}return false;};
  const expect=(s:string)=>{if(!consume(s))throw new Error("#ERROR!");};
  const refValue=(ref:string)=>{const address=ref.replaceAll("$","");if(!parseAddress(address))throw new Error("#REF!");const result=evaluateCell(sheet,address,next);if(typeof result==="string"&&result.startsWith("#"))throw new Error(result);return result;};
  function atom():number|string{
   const t=take();if(!t)throw new Error("#ERROR!");
   if(t.value==="("){const v=comparison();expect(")");return v;}
   if(t.type==="number")return Number(t.value);
   if(t.type==="string")return t.value;
   if(t.type==="word"){
    if(consume("(")){
     const args:(number|string|Array<number|string>)[]=[];
     if(!consume(")")){do{
      if(peek()?.type==="word"&&tokens[pos+1]?.value===":"&&tokens[pos+2]?.type==="word"){
       const start=take().value;take();const end=take().value;const range=rect(start+":"+end);
       if(!range.length||range.length>5200)throw new Error("#REF!");
       args.push(range.map(refValue));
      }else args.push(comparison());
     }while(consume(","));expect(")");}
     const flat=args.flatMap(a=>Array.isArray(a)?a:[a]);
     const nums=flat.filter(x=>x!==""&&Number.isFinite(Number(x))).map(Number);
     switch(t.value){
      case "SUM":return nums.reduce((a,b)=>a+b,0);
      case "AVERAGE":case "AVG":return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;
      case "MIN":return nums.length?Math.min(...nums):0;
      case "MAX":return nums.length?Math.max(...nums):0;
      case "COUNT":return nums.length;
      case "COUNTA":return flat.filter(x=>x!=="").length;
      case "ROUND":return Math.round(numeric(args[0])*10**numeric(args[1]))/10**numeric(args[1]);
      case "ABS":return Math.abs(numeric(args[0]));
      case "IF":return numeric(args[0])?String(args[1]??""):String(args[2]??"");
      default:throw new Error("#NAME?");
     }
    }
    if(t.value==="TRUE")return 1;if(t.value==="FALSE")return 0;
    return refValue(t.value);
   }
   throw new Error("#ERROR!");
  }
  function unary():number|string{if(consume("-"))return -numeric(unary());if(consume("+"))return numeric(unary());return atom();}
  function power():number|string{let x=unary();if(consume("^"))x=numeric(x)**numeric(power());return x;}
  function mul():number|string{let x=power();while(peek()&&["*","/"].includes(peek().value)){const op=take().value,y=numeric(power());if(op==="/"&&y===0)throw new Error("#DIV/0!");x=op==="*"?numeric(x)*y:numeric(x)/y;}return x;}
  function add():number|string{let x=mul();while(peek()&&["+","-"].includes(peek().value)){const op=take().value,y=mul();x=op==="+"?numeric(x)+numeric(y):numeric(x)-numeric(y);}return x;}
  function comparison():number|string{let x=add();while(peek()&&["=",">","<"].includes(peek().value)){const op=take().value,y=add();x=op==="="?Number(String(x)===String(y)):op===">"?Number(numeric(x)>numeric(y)):Number(numeric(x)<numeric(y));}return x;}
  const result=comparison();if(pos!==tokens.length)throw new Error("#ERROR!");
  return typeof result==="number"&&!Number.isFinite(result)?"#NUM!":result;
 }catch(error){return error instanceof Error&&error.message.startsWith("#")?error.message:"#ERROR!";}
}
export function displayValue(sheet:Sheet,address:string):string{
 const cell=sheet.cells[address],value=evaluateCell(sheet,address);
 if(value==="")return "";
 const format=cell?.style?.format;
 if(typeof value==="number"){
  if(format==="currency")return new Intl.NumberFormat("zh-TW",{style:"currency",currency:"TWD",maximumFractionDigits:2}).format(value);
  if(format==="percent")return new Intl.NumberFormat("zh-TW",{style:"percent",maximumFractionDigits:2}).format(value);
  if(format==="number")return new Intl.NumberFormat("zh-TW",{maximumFractionDigits:6}).format(value);
  return String(Math.round(value*1e8)/1e8);
 }
 return String(value);
}
export function uniqueSheetName(book:Workbook,base:string):string{let name=base.slice(0,64)||"工作表";let n=2;while(book.sheets.some(s=>s.name===name))name=base.slice(0,55)+" "+n++;return name;}
export function cloneBook(book:Workbook):Workbook{return structuredClone(book);}
export function parseDelimited(text:string,delimiter?:string):string[][]{
 const sep=delimiter||(text.includes("\t")?"\t":",");const rows:string[][]=[];let row:string[]=[],value="",quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=false;else value+=c;}else if(c==='"')quoted=true;else if(c===sep){row.push(value);value="";}else if(c==="\n"){row.push(value.replace(/\r$/,""));rows.push(row);row=[];value="";}else value+=c;}
 if(value!==""||row.length){row.push(value.replace(/\r$/,""));rows.push(row);}return rows;
}
export function rowsToSheet(sheet:Sheet,rows:string[][]){
 rows.slice(0,LIMIT_ROWS).forEach((cells,row)=>cells.slice(0,LIMIT_COLS).forEach((value,col)=>setCell(sheet,addressOf(row,col),value)));
}
export function csvForSheet(sheet:Sheet):string{
 const entries=Object.keys(sheet.cells).map(parseAddress).filter((x):x is {row:number;col:number}=>Boolean(x));
 const maxRow=entries.length?Math.max(...entries.map(x=>x.row)):0;
 const maxCol=entries.length?Math.max(...entries.map(x=>x.col)):0;
 return Array.from({length:maxRow+1},(_,r)=>Array.from({length:maxCol+1},(_,c)=>{
  let value=displayValue(sheet,addressOf(r,c));
  if(/^[=+\-@\t\r]/.test(value))value="'"+value; // CSV formula-injection protection in Excel
  return '"'+value.replaceAll('"','""')+'"';
 }).join(",")).join("\r\n");
}
export function download(content:string,name:string,type:string){
 const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
