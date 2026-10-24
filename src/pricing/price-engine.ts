/**
 * OCTUBER price intelligence. Pure calculations over owner-supplied, licensed
 * feeds or manually observed prices. No crawler, scraping, third-party requests
 * or merchant repricing side effects.
 */
export type PriceSource="biggo"|"feebee"|"lbj"|"merchant"|"authorized-feed";
export type PriceRecord={
 id:string;product:string;sku:string;merchant:string;source:PriceSource;
 price:number;currency:"TWD";url:string;observedAt:number|null;importedAt:number;
};
export type PriceSummary={
 offers:number;vendors:number;min:number;max:number;median:number;
 targetPrice:number|null;floorPrice:number;referenceOnly:true;notes:string[];
};
const SOURCES=new Set<PriceSource>(["biggo","feebee","lbj","merchant","authorized-feed"]);
const normalize=(value:unknown)=>String(value??"").normalize("NFKC").trim();
const normalizedProduct=(value:string)=>normalize(value).replace(/\s+/g," ").toLocaleLowerCase("zh-TW");
export function priceProductKey(record:Pick<PriceRecord,"sku"|"product">):string{
 return record.sku.trim()?"sku:"+normalizedProduct(record.sku):"title:"+normalizedProduct(record.product);
}
export function priceSearchSources():Array<{id:PriceSource;label:string;url:string}>{
 return [
  {id:"biggo",label:"BigGo 比個夠",url:"https://biggo.com.tw/"},
  {id:"feebee",label:"飛比價格",url:"https://feebee.com.tw/"},
  {id:"lbj",label:"樂天比價網",url:"https://www.lbj.tw/BJ/Default.aspx"}
 ];
}
function parseCsvLine(line:string):string[]{
 const result:string[]=[];let value="",quoted=false;
 for(let index=0;index<line.length;index++){
  const ch=line[index];
  if(ch==='"'){
   if(quoted&&line[index+1]==='"'){value+='"';index++;}
   else quoted=!quoted;
  }else if(ch===","&&!quoted){result.push(value.trim());value="";}
  else value+=ch;
 }
 if(quoted)throw new Error("CSV 引號未正確結束");
 result.push(value.trim());return result;
}
function tableRows(raw:string):Record<string,unknown>[]{
 const trimmed=raw.trim();
 if(!trimmed)return [];
 if(trimmed.startsWith("[")){
  const arr:unknown=JSON.parse(trimmed);
  if(!Array.isArray(arr))throw new Error("JSON 須為商品報價物件陣列");
  return arr.map(item=>{
   if(!item||typeof item!=="object"||Array.isArray(item))throw new Error("報價欄位格式錯誤");
   return item as Record<string,unknown>;
  });
 }
 const lines=trimmed.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
 const heads=parseCsvLine(lines[0]).map(x=>x.trim().toLowerCase());
 for(const needed of ["product","price","merchant"]){
  if(!heads.includes(needed))throw new Error("CSV 必須含 product、price、merchant 欄位");
 }
 return lines.slice(1).map(line=>{
  const values=parseCsvLine(line),data:Record<string,unknown>={};
  heads.forEach((head,index)=>{data[head]=values[index]??"";});
  return data;
 });
}
export function parsePriceRecords(raw:string,now=Date.now()):PriceRecord[]{
 const rows=tableRows(raw);
 if(rows.length>500)throw new Error("每次最多匯入 500 筆報價");
 return rows.map((row,index)=>{
  const product=normalize(row.product??row.title);
  const merchant=normalize(row.merchant??row.seller);
  const priceText=normalize(row.price).replace(/(?:NT\$|NTD|TWD|[,$\s])/gi,"");
  const price=Number(priceText);
  const sku=normalize(row.sku??row.model);
  const sourceRaw=normalize(row.source||"merchant").toLowerCase();
  const source=SOURCES.has(sourceRaw as PriceSource)?sourceRaw as PriceSource:"merchant";
  const currency=normalize(row.currency||"TWD").toUpperCase();
  if(currency!=="TWD")throw new Error("第 "+(index+1)+" 筆僅支援 TWD；請先自行換算並註明匯率");
  if(!product||!merchant||!Number.isFinite(price)||price<=0||price>100000000)
   throw new Error("第 "+(index+1)+" 筆商品、商家或價格不正確");
  const url=normalize(row.url);
  if(url){
   let parsed:URL;try{parsed=new URL(url);}catch{throw new Error("第 "+(index+1)+" 筆網址格式錯誤");}
   if(parsed.protocol!=="https:")throw new Error("來源網址必須使用 HTTPS");
  }
  const observed=normalize(row.observed_at??row.observedAt);
  let observedAt:number|null=null;
  if(observed){
   const d=Date.parse(observed);if(!Number.isFinite(d)||d>now+300000)throw new Error("第 "+(index+1)+" 筆觀察時間不正確");
   observedAt=d;
  }
  return {id:String(now)+"-"+index,product,sku,merchant,source,price,currency:"TWD" as const,url,observedAt,importedAt:now};
 });
}
export function comparePrices(records:PriceRecord[],selectedKey:string,opts:{
 currentPrice:number;cost:number;minimumMargin:number;maxChangeRate?:number;now?:number
}):PriceSummary{
 const notes:string[]=[];
 const floorPrice=Math.ceil(opts.cost/(1-opts.minimumMargin));
 const valid=records.filter(x=>priceProductKey(x)===selectedKey&&x.price>0);
 // Suppress duplicated listings from the same merchant; keep the lowest quoted offer.
 const byMerchant=new Map<string,PriceRecord>();
 for(const record of valid){
  const key=normalizedProduct(record.merchant);
  if(!byMerchant.has(key)||byMerchant.get(key)!.price>record.price)byMerchant.set(key,record);
 }
 const offers=[...byMerchant.values()].sort((a,b)=>a.price-b.price);
 const prices=offers.map(x=>x.price);
 const count=prices.length;
 const median=count?(count%2?prices[(count-1)/2]:(prices[count/2-1]+prices[count/2])/2):0;
 const sourceCount=new Set(offers.map(x=>x.source)).size;
 if(count<2)notes.push("少於兩家獨立商家報價：不能形成可靠市場參考");
 if(sourceCount<2)notes.push("報價來源不足兩類，建議再以其他來源交叉比對");
 const now=opts.now??Date.now();
 if(offers.some(x=>x.observedAt===null))notes.push("包含未填觀察時間的資料，不能視為即時價格");
 if(offers.some(x=>x.observedAt!==null&&now-x.observedAt>48*3600*1000))notes.push("存在超過 48 小時的報價；建議更新來源");
 notes.push("尚未納入運費、折價券、規格版本、庫存與會員價格，採用前需人工覆核");
 let targetPrice:number|null=null;
 if(count>=2&&Number.isFinite(opts.currentPrice)&&opts.currentPrice>0
   &&Number.isFinite(opts.cost)&&opts.cost>=0&&opts.minimumMargin>=0&&opts.minimumMargin<1){
  const maxChange=Math.min(0.25,Math.max(0.01,opts.maxChangeRate??0.1));
  const ceiling=opts.currentPrice*(1+maxChange);
  const lower=Math.max(floorPrice,opts.currentPrice*(1-maxChange));
  if(lower<=ceiling){
   // Competitor median is an indicative reference only, NOT a published price.
   targetPrice=Math.round(Math.min(ceiling,Math.max(lower,median)));
  }else notes.push("最低毛利率高於安全調價區間，無法計算建議價格");
 }
 if(!targetPrice)notes.push("請確認商品規格、成本與目前售價後再取得價格建議");
 return {offers:valid.length,vendors:count,min:count?prices[0]:0,max:count?prices[count-1]:0,median,targetPrice,floorPrice,referenceOnly:true,notes};
}
