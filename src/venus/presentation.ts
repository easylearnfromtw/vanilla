/** Venus 2.0 presentation protocol.
 * Model output is untrusted. Only allowlisted JSON data becomes native React elements.
 * Invalid or unfinished blocks are retained as ordinary Markdown/code for transparency.
 * No eval, remote scripts, HTML injection, or external network requests.
 */
export type VenusBlock=
 |{kind:"metrics";title:string;items:{label:string;value:string;note:string}[]}
 |{kind:"cards";title:string;items:{title:string;body:string;url:string|null}[]}
 |{kind:"timeline";title:string;items:{label:string;description:string;date:string}[]}
 |{kind:"tabs";title:string;items:{label:string;content:string}[]}
 |{kind:"checklist";title:string;items:{text:string}[]}
 |{kind:"quiz";title:string;question:string;options:string[];correctIndex:number;explanation:string}
 |{kind:"chart";title:string;chartType:"bar"|"line";labels:string[];values:number[];unit:string;source:string}
 |{kind:"gallery";title:string;items:{url:string;alt:string;caption:string}[]};

const record=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const text=(value:unknown,max=240):string=>typeof value==="string"?value.trim().slice(0,max):"";
const arr=(x:unknown,min:number,max:number):unknown[]|null=>Array.isArray(x)&&x.length>=min&&x.length<=max?x:null;
export function venusSafeUrl(raw:string):string|null{
 try{const u=new URL(raw);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname?u.href:null;}
 catch{return null;}
}
function parseOne(raw:unknown):VenusBlock|null{
 if(!record(raw))return null;
 const title=text(raw.title,100);
 switch(raw.kind){
 case "metrics":{
  const inputs=arr(raw.items,1,6);if(!inputs)return null;
  const items=inputs.map(x=>record(x)?{label:text(x.label,80),value:text(x.value,60),note:text(x.note,140)}:null);
  if(items.some(x=>!x?.label||!x.value))return null;
  return {kind:"metrics",title,items:items as {label:string;value:string;note:string}[]};
 }
 case "cards":{
  const inputs=arr(raw.items,2,6);if(!inputs)return null;
  const items=inputs.map(x=>record(x)?{title:text(x.title,90),body:text(x.body,450),url:venusSafeUrl(text(x.url,2048))}:null);
  if(items.some(x=>!x?.title||!x.body))return null;
  return {kind:"cards",title,items:items as {title:string;body:string;url:string|null}[]};
 }
 case "timeline":{
  const inputs=arr(raw.items,2,10);if(!inputs)return null;
  const items=inputs.map(x=>record(x)?{label:text(x.label,90),description:text(x.description,400),date:text(x.date,55)}:null);
  if(items.some(x=>!x?.label||!x.description))return null;
  return {kind:"timeline",title,items:items as {label:string;description:string;date:string}[]};
 }
 case "tabs":{
  const inputs=arr(raw.items,2,6);if(!inputs)return null;
  const items=inputs.map(x=>record(x)?{label:text(x.label,65),content:text(x.content,1500)}:null);
  if(items.some(x=>!x?.label||!x.content))return null;
  return {kind:"tabs",title,items:items as {label:string;content:string}[]};
 }
 case "checklist":{
  const inputs=arr(raw.items,2,12);if(!inputs)return null;
  const items=inputs.map(x=>record(x)?{text:text(x.text,260)}:null);
  if(items.some(x=>!x?.text))return null;
  return {kind:"checklist",title,items:items as {text:string}[]};
 }
 case "quiz":{
  const question=text(raw.question,420),options=arr(raw.options,2,5);
  const correctIndex=raw.correctIndex;
  if(!question||!options||!options.every(x=>typeof x==="string"&&text(x,200).length)||typeof correctIndex!=="number"||!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=options.length)return null;
  return {kind:"quiz",title,question,options:options.map(x=>text(x,200)),correctIndex,explanation:text(raw.explanation,700)};
 }
 case "chart":{
  if(raw.chartType!=="bar"&&raw.chartType!=="line")return null;
  const labels=arr(raw.labels,2,12),values=arr(raw.values,2,12);
  if(!labels||!values||labels.length!==values.length||!labels.every(x=>typeof x==="string"&&text(x,55))||
     !values.every(x=>typeof x==="number"&&Number.isFinite(x)&&Math.abs(x)<=1e12))return null;
  const source=text(raw.source,220);
  // A chart must carry a clear source label. The label is model-provided, NOT verified.
  if(!source||!title)return null;
  return {kind:"chart",title,chartType:raw.chartType,labels:labels.map(x=>text(x,55)),values:values as number[],unit:text(raw.unit,35),source};
 }
 case "gallery":{
  const inputs=arr(raw.items,1,6);if(!inputs)return null;
  const items=inputs.map(x=>record(x)?{url:venusSafeUrl(text(x.url,2048))||"",alt:text(x.alt,170),caption:text(x.caption,170)}:null);
  if(items.some(x=>!x?.url||!x.alt))return null;
  return {kind:"gallery",title,items:items as {url:string;alt:string;caption:string}[]};
 }
 default:return null;
 }
}
export function parseVenusMessage(source:string):{text:string;blocks:VenusBlock[]}{
 if(!source.includes("venus")||source.length>180000)return {text:source,blocks:[]};
 const blocks:VenusBlock[]=[];
 const fence=/(^|\n)\x60{3}venus[ \t]*\r?\n([\s\S]*?)\r?\n\x60{3}(?=\n|$)/gi;
 const visible=source.replace(fence,(full:string,prefix:string,body:string)=>{
  if(body.length>14000||blocks.length>=3)return full;
  try{
   const parsed:unknown=JSON.parse(body);
   const input=Array.isArray(parsed)?parsed:[parsed];
   if(!input.length||input.length>3||blocks.length+input.length>3)return full;
   const next=input.map(parseOne);
   if(next.some(x=>x===null))return full;
   blocks.push(...(next as VenusBlock[]));
   return prefix;
  }catch{return full;}
 });
 return {text:visible.trim()|| (blocks.length?"":"\u00a0"),blocks};
}
/** Request an optional Venus block only where it can add information, never as decoration.
 * Small on-device models keep the fast Markdown path instead of wasting context on JSON.
 */
export function venusPresentationGuidance(question:string,task:string,compact:boolean):string{
 if(compact||task==="casual"||task==="code"||task==="writing"||question.length<8||
    !/(?:圖表|長條|折線|趨勢|統計|數據|比較|流程|時間軸|里程碑|階段|步驟|卡片|圖庫|照片|圖片|問答|測驗|選項|清單|互動|dashboard|chart|timeline|quiz)/i.test(question))return "";
 return "\n\n[Venus 2.0 可選呈現協議]\n"+
 "只在確實有幫助且資料已提供時，於正常文字答案結尾追加一個 fenced venus JSON 物件（程式碼圍欄語言 venus）。有效 kind："+
 "metrics(items:[{label,value,note}])、cards(items:[{title,body,url}])、timeline(items:[{label,description,date}])、tabs(items:[{label,content}])、checklist(items:[{text}])、"+
 "chart(chartType:'bar'或'line',title,labels,values,unit,source)、gallery(items:[{url,alt,caption}])、quiz(question,options,correctIndex,explanation)。"+
 "需要的欄位 title 可用簡短標題。輸出必須是合法 JSON（雙引號、無註解），同一個區塊最多 3 個元件；不確定就不輸出 venus 區塊，維持 Markdown。"+
 "數字、圖表、答案和 URL 只能取自已確認資料，不可捏造。chart 必須標明資料來源，gallery 只能使用已取得的 HTTPS 圖片網址。"+
 "不要把完整答案複製到元件裡；不要輸出 HTML、JS 或要求自動執行動作。";
}
