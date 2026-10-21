/** Venus 3.0 presentation protocol.
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
 |{kind:"gallery";title:string;items:{url:string;alt:string;caption:string;source:string}[]}
 |{kind:"map";title:string;points:{label:string;lat:number;lon:number;description:string}[]}
 |{kind:"video";title:string;provider:"youtube"|"vimeo";videoId:string;caption:string}
 |{kind:"math";title:string;expression:string}
 |{kind:"live";title:string;mode:"clock"|"countdown";timezone:string;targetISO:string};

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
  const items=inputs.map(x=>record(x)?{url:venusSafeUrl(text(x.url,2048))||"",alt:text(x.alt,170),caption:text(x.caption,170),source:venusSafeUrl(text(x.source,2048))||""}:null);
  if(items.some(x=>!x?.url||!x.alt))return null;
  return {kind:"gallery",title,items:items as {url:string;alt:string;caption:string;source:string}[]};
 }
 case "map":{
  const points=arr(raw.points,1,8);if(!points)return null;
  const mapped=points.map(p=>{
   if(!record(p)||typeof p.lat!=="number"||typeof p.lon!=="number"||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||
      p.lat>85||p.lat< -85||p.lon>180||p.lon< -180)return null;
   return {label:text(p.label,90),lat:p.lat,lon:p.lon,description:text(p.description,260)};
  });
  if(mapped.some(p=>!p?.label))return null;
  return {kind:"map",title,points:mapped as {label:string;lat:number;lon:number;description:string}[]};
 }
 case "video":{
  const provider=raw.provider;
  const videoId=text(raw.videoId,80);
  if(provider==="youtube"&&!/^[a-zA-Z0-9_-]{11}$/.test(videoId))return null;
  if(provider==="vimeo"&&!/^\d{6,12}$/.test(videoId))return null;
  if(provider!=="youtube"&&provider!=="vimeo")return null;
  if(!title)return null;
  return {kind:"video",title,provider,videoId,caption:text(raw.caption,300)};
 }
 case "math":{
  const expression=text(raw.expression,600);
  if(!expression||/[<>]/.test(expression))return null;
  return {kind:"math",title,expression};
 }
 case "live":{
  if(raw.mode!=="clock"&&raw.mode!=="countdown")return null;
  const timezone=text(raw.timezone,60)||"Asia/Taipei";
  if(!["Asia/Taipei","UTC"].includes(timezone))return null;
  const targetISO=text(raw.targetISO,50);
  if(raw.mode==="countdown"){
   if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(targetISO)||!Number.isFinite(Date.parse(targetISO)))return null;
  }
  return {kind:"live",title,mode:raw.mode,timezone,targetISO:raw.mode==="clock"?"":targetISO};
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
/** Diana/Zeus presentation routing is deterministic. This selects allowed native renderers,
 * not credentials, geocoding, third-party media data or tool execution permissions.
 */
export type VenusIntent="map"|"video"|"math"|"live"|"gallery"|"standard";
export function chooseVenusIntent(question:string):VenusIntent{
 if(/(?:地圖|地點標示|map|座標|路線圖)/i.test(question))return "map";
 if(/(?:影片|youtube|vimeo|video|影片播放器)/i.test(question))return "video";
 if(/(?:數學公式|數學式|方程式|LaTeX|mathml|公式排版)/i.test(question))return "math";
 if(/(?:倒數計時|倒數時鐘|即時時鐘|現在時間|clock|countdown)/i.test(question))return "live";
 if(/(?:圖庫|照片|圖片集合|多張圖片|相片|image gallery)/i.test(question))return "gallery";
 return "standard";
}
export function venusPresentationGuidance(question:string,task:string,compact:boolean):string{
 if(compact||task==="casual"||task==="code"||task==="writing"||question.length<8)return "";
 const intent=chooseVenusIntent(question);
 if(intent==="standard"&&!/(?:圖表|長條|折線|趨勢|統計|數據|比較|流程|時間軸|里程碑|階段|步驟|卡片|問答|測驗|選項|清單|互動|dashboard|chart|timeline|quiz)/i.test(question))return "";
 return "\n\n[Venus 3.0 · Diana 自動選擇呈現形式："+intent+"]\n"+
 "在文字回答後，僅當資料來源充分、視覺形式能改善理解時，才可以附加一個 fenced venus JSON（最多三個資料物件），否則保持正常 Markdown。"+
 "可用 kind：metrics、cards、timeline、tabs、checklist、quiz、chart、gallery，格式沿用既有 Venus。"+
 "另支援：map(title,points:[{label,lat,lon,description}])，座標僅能使用已提供或已核對的實際座標，不可臆測；"+
 "video(title,provider:'youtube'|'vimeo',videoId,caption)，videoId 必須來自已確認的來源，禁止虛構；"+
 "math(title,expression)，expression 使用 LaTeX 基本數學語法；"+
 "live(title,mode:'clock'|'countdown',timezone:'Asia/Taipei'|'UTC',targetISO)，倒數日期需有明確時區。"+
 "gallery(items:[{url,alt,caption,source}]) 只使用明確取得的 HTTPS 圖片 URL，來源務必可追溯。"+
 "維納斯（Venus）是虛構角色創意總監，UCL／東京大學美術研究所是人物故事背景，不代表真實可驗證學歷。她與阿土伯在故事中為夫妻，實際協作遵守獨立的創意驗收規範。視覺採包豪斯理性網格、iOS 克制的黑白極簡、低強度毛玻璃；以資訊階層、留白、對齊、字級、動線、資料語意、無障礙與專業圖表為先，不使用廉價漸層、假 3D、過量陰影、滿版彩虹色及模板式 AI 科技視覺。"+
 "遇到量化資料，圖表不得假造刻度或從一個樣本宣稱趨勢；如來源不可靠，寧可清楚呈現文字、表格或資料缺口。不同圖表應使用一致單位、色彩與標註，指明日期、指標、來源與限制。視覺元件必須支援窄螢幕、鍵盤、焦點與低動態偏好。"+
 "所有輸出必須是標準雙引號 JSON；不能加入 HTML／JavaScript。圖表數據必須是真實提供的數據且標示來源；未讀取資料時不要自稱即時。"+
 "外部影音、地圖、圖片要由使用者點擊才載入，模型不可要求自動開啟。";
}
