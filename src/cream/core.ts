/** CREAM P0: deterministic, local-only tabular analysis.
 * Never execute spreadsheet formulas, arbitrary JavaScript, or model-generated code.
 */
export type CreamChartKind="bar"|"line"|"scatter";
export type CreamDataset={source:string;columns:string[];rows:string[][];rowNumbers:number[];importedAt:string};
export type CreamPoint={row:number;label:string;value:number};
export type CreamMetric={
 key:string;column:number;n:number;missing:number;sum:number;mean:number;median:number;
 min:number;max:number;sampleStdDev:number|null;points:CreamPoint[];
};
export type CreamResult={
 version:1;source:string;importedAt:string;rowCount:number;columns:string[];
 previewRows:string[][];metrics:CreamMetric[];chartKind:CreamChartKind;warnings:string[];
};
const MAX_BYTES=2_000_000,MAX_ROWS=3000,MAX_COLS=12,PREVIEW_ROWS=12,MAX_POINTS=48;
const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
function safeText(value:unknown):string{
 if(value===null||value===undefined)return "";
 if(value instanceof Date)return Number.isNaN(value.getTime())?"":value.toISOString().slice(0,10);
 return String(value).trim().slice(0,400);
}
export function fromCreamRows(rows:readonly (readonly unknown[])[],source:string):CreamDataset{
 if(!Array.isArray(rows)||rows.length<2)throw Error("CREAM：資料至少需要標題列及一列資料。");
 if(rows.length-1>MAX_ROWS)throw Error("CREAM：手機版最多處理 3,000 筆；較大型資料請使用進階分析後端。");
 if(rows.some(row=>!Array.isArray(row)))throw Error("CREAM：表格列的格式不正確。");
 const width=rows[0].length;
 if(width<2||width>MAX_COLS)throw Error("CREAM：資料應有 2–12 個欄位。");
 if(rows.slice(1).some((row:readonly unknown[])=>row.length>width))throw Error("CREAM：某些資料列的欄位數超過標題列，請修正多餘分隔符號。");
 const headers=rows[0].map((v:unknown,i:number)=>safeText(v)||"欄位 "+(i+1));
 const used=new Set<string>();
 for(const header of headers){if(used.has(header))throw Error("CREAM：欄位名稱必須唯一，請先重新命名重複欄位："+header);used.add(header);}
 const nonempty=rows.slice(1).map((row,i)=>({values:row,sourceRow:i+2})).filter(x=>x.values.some((cell:unknown)=>safeText(cell)!==""));
 const records=nonempty.map(x=>Array.from({length:width},(_,i)=>safeText(x.values[i])));
 if(!records.length)throw Error("CREAM：沒有可分析的資料列。");
 return {source:source.trim().slice(0,120)||"未命名資料",columns:headers,rows:records,rowNumbers:nonempty.map(x=>x.sourceRow),importedAt:new Date().toISOString()};
}
export function parseCreamCSV(text:string,source="貼上 CSV"):CreamDataset{
 if(text.length>MAX_BYTES)throw Error("CREAM：CSV 文字超過 2 MB，上傳大資料請使用後端分析。");
 let data=text.charCodeAt(0)===0xfeff?text.slice(1):text;
 const firstLine=data.split(/\r?\n/,1)[0]||"";
 const delimiter=firstLine.includes("\t")&&!firstLine.includes(",")?"\t":",";
 const rows:string[][]=[],row:string[]=[];let field="",quoted=false,closed=false;
 for(let i=0;i<data.length;i++){
  const c=data[i];
  if(quoted){
   if(c==='"'&&data[i+1]==='"'){field+='"';i++;}
   else if(c==='"')quoted=false;
   else field+=c;
  }else if(c==='"'&&field===""){quoted=true;}
  else if(c===delimiter){row.push(field);field="";closed=false;}
  else if(c==="\n"){row.push(field);rows.push([...row]);row.length=0;field="";closed=false;if(rows.length>MAX_ROWS+1)throw Error("CREAM：資料超過 3,000 列。");}
  else if(c==="\r"&&(data[i+1]==="\n"||i===data.length-1)){}
  else if(c==='"'){throw Error("CREAM：CSV 引號格式不正確。");}
  else{field+=c;closed=false;}
 }
 if(quoted)throw Error("CREAM：CSV 引號未關閉。");
 if(field!==""||row.length){row.push(field);rows.push(row);}
 return fromCreamRows(rows,source);
}
function toNumber(value:string):number|null{
 const s=value.trim();
 if(!numeric.test(s)||(/^0\d/.test(s)&&!/^0\./.test(s))||/^-0\d/.test(s))return null;
 const n=Number(s);return Number.isFinite(n)?n:null;
}
export function analyzeCream(dataset:CreamDataset,kind:CreamChartKind="bar"):CreamResult{
 const warnings:string[]=[];
 const metrics:CreamMetric[]=[];
 for(let col=0;col<dataset.columns.length;col++){
  const entries=dataset.rows.map((r,i)=>({row:dataset.rowNumbers[i]??i+2,index:i,label:col!==0?r[0]||"":"",raw:r[col]||""})).filter(x=>x.raw.trim()!=="");
  const parsed=entries.map(x=>({...x,value:toNumber(x.raw)}));
  if(!parsed.length)continue;
  if(parsed.some(x=>x.value===null)){
   if(parsed.some(x=>x.value!==null))warnings.push("「"+dataset.columns[col]+"」包含非數值資料，未將它視為數值欄位；請先清理資料。");
   continue;
  }
  const values=parsed.map(x=>x.value as number);
  const n=values.length,sum=values.reduce((a,b)=>a+b,0),mean=sum/n;
  const ordered=[...values].sort((a,b)=>a-b);
  const median=n%2?ordered[(n-1)/2]:(ordered[n/2-1]+ordered[n/2])/2;
  const min=ordered[0],max=ordered[n-1];
  const sampleStdDev=n<2?null:Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(n-1));
  const points:CreamPoint[]=parsed.slice(0,MAX_POINTS).map(x=>({
   row:x.row,label:x.label||"第 "+(x.index+1)+" 筆",
   value:x.value as number
  }));
  metrics.push({key:dataset.columns[col],column:col,n,missing:dataset.rows.length-n,sum,mean,median,min,max,sampleStdDev,points});
  if(n>MAX_POINTS)warnings.push("圖表「"+dataset.columns[col]+"」僅顯示前 "+MAX_POINTS+" 筆有效數據，統計仍以全部 "+n+" 筆計算。");
 }
 if(!metrics.length)warnings.push("沒有可以計算描述統計的純數值欄位；請提供至少一欄有效數值。");
 return {version:1,source:dataset.source,importedAt:dataset.importedAt,rowCount:dataset.rows.length,
  columns:[...dataset.columns],previewRows:dataset.rows.slice(0,PREVIEW_ROWS).map(x=>[...x]),metrics,chartKind:kind,warnings};
}
export function summarizeCream(result:CreamResult):string{
 const head="CREAM 已分析「"+result.source+"」："+result.rowCount+" 筆資料，"+result.columns.length+" 欄。";
 return result.metrics.length?head+" 已完成 "+result.metrics.length+" 個數值欄位的描述統計，圖表、樣本數、缺失值與資料來源如下。":head+" 目前無純數值欄位可繪圖；請檢查資料格式。";
}
export function creamInstruction(text:string):{kind:CreamChartKind;csv:string}|null{
 const m=/^(?:CREAM|分析資料|繪製圖表)\s*[：:]\s*([\s\S]+)$/i.exec(text.trim());
 if(!m)return null;
 const raw=m[1].trim();
 if(!raw.includes("\n")&&!raw.includes("\t"))return null;
 const kind:CreamChartKind=/折線|line/i.test(text.slice(0,50))?"line":/散佈|scatter/i.test(text.slice(0,50))?"scatter":"bar";
 return {kind,csv:raw};
}
export function creamChartFollowup(text:string):CreamChartKind|null{
 if(!/(?:改成|切換|換成|畫成|變成)/.test(text))return null;
 if(/折線圖/.test(text))return "line";
 if(/長條圖|柱狀圖/.test(text))return "bar";
 if(/散佈圖|散點圖/.test(text))return "scatter";
 return null;
}
