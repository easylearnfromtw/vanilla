/** October price-page -> Detroit native capability bus -> CREAM local statistics.
 * Only executes after explicit user action. No scraping, model inference,
 * third-party data transport, publication, or repricing.
 */
import {executeDetroitNative} from "../detroit/native-executors";
import type {CreamResult} from "../cream/core";
import {priceProductKey,priceSellerLabel,type PriceRecord} from "./price-engine";

export type OctuberCreamPriceReceipt={
 status:"completed";capability:"cream";executedBy:"detroit-native";
 readOnly:true;networkUsed:false;modelInvoked:false;
 productKey:string;merchants:number;analyzedQuotes:number;unverifiedOrigin:true;
 staleQuotes:number;unknownObservedAt:number;
 stats:{mean:number;median:number;min:number;max:number;n:number};
 insights:string[];warnings:string[];
};
type CreamExecutor=(payload:{csv:string;source:string},context:{privateMode:boolean;signal?:AbortSignal})=>Promise<CreamResult>;
const CSV_MAX=500;
const quote=(s:string)=>'"'+s.replace(/"/g,'""').replace(/[\r\n]+/g," ").slice(0,120)+'"';
const validSeller=(s:string)=>!/^(?:biggo|比個夠|feebee|飛比(?:價格)?|lbj|比價撿便宜)$/i.test(s.trim().replace(/\s+/g,""));
export async function executeOctuberPriceCream(
 records:readonly PriceRecord[],
 productKey:string,
 options:{explicitUserAction:boolean;privateMode:boolean;signal?:AbortSignal;
  now?:number;executeCream?:CreamExecutor}
):Promise<OctuberCreamPriceReceipt>{
 if(!options?.explicitUserAction)throw Error("OCTUBER_PRICE_TOOL_REQUIRES_EXPLICIT_ACTION");
 if(options.signal?.aborted)throw Error("OCTUBER_PRICE_TOOL_CANCELLED");
 if(!Array.isArray(records)||records.length>CSV_MAX||!productKey.startsWith("sku:")&&!productKey.startsWith("title:"))
  throw Error("OCTUBER_PRICE_TOOL_INPUT_LIMIT");
 const matching=records.filter(r=>priceProductKey(r)===productKey);
 const sellers=new Map<string,PriceRecord>();
 for(const r of matching){
  if(r.currency!=="TWD"||!Number.isFinite(r.price)||r.price<=0||
      !r.merchant?.trim()||!validSeller(r.merchant))continue;
  const key=(r.marketplace??"unknown")+"|"+r.merchant.trim().normalize("NFKC").toLocaleLowerCase("zh-TW");
  const previous=sellers.get(key);
  // Prevent an old cheap quote from shadowing a more recent observed seller price.
  if(!previous||(r.observedAt??-1)>(previous.observedAt??-1)||
    r.observedAt===previous.observedAt&&r.importedAt>previous.importedAt)sellers.set(key,r);
 }
 const offers=[...sellers.values()].sort((a,b)=>a.price-b.price);
 if(!offers.length)throw Error("OCTUBER_PRICE_TOOL_NO_VALID_SELLER_QUOTES");
 const csv="賣家,價格_TWD\n"+offers.map(r=>quote(priceSellerLabel(r))+","+r.price.toFixed(2)).join("\n");
 const execute=options.executeCream??(
  (payload:{csv:string;source:string},context:{privateMode:boolean;signal?:AbortSignal})=>
   executeDetroitNative<CreamResult>("cream",payload,context)
 );
 const cream=await execute({csv,source:"October 價格頁面之本機已匯入報價"},{
  privateMode:options.privateMode,signal:options.signal
 });
 if(options.signal?.aborted)throw Error("OCTUBER_PRICE_TOOL_CANCELLED");
 const metric=cream.metrics.find(m=>m.key==="價格_TWD");
 // A fake receipt or wrong tool result must never be accepted as successful analysis.
 if(cream.rowCount!==offers.length||!metric||metric.n!==offers.length||
    ![metric.mean,metric.median,metric.min,metric.max].every(Number.isFinite))
  throw Error("OCTUBER_CREAM_RECEIPT_INVALID");
 const now=options.now??Date.now();
 const unknownObservedAt=offers.filter(r=>r.observedAt===null||!Number.isFinite(r.observedAt)).length;
 const staleQuotes=offers.filter(r=>r.observedAt!==null&&now-r.observedAt>48*3600*1000).length;
 const warnings=[
  "僅統計使用者本機匯入的報價；未向 BigGo／飛比／LBJ 重新取得即時價格或授權驗證。",
  "尚未核對運費、折扣、稅費、商品完整規格及庫存；不得直接作為購買或自動調價依據。",
  ...(offers.length<2?["只有一間已確認賣家，不能推論市場行情。"]:[]),
  ...(unknownObservedAt?["有 "+unknownObservedAt+" 間賣家缺少可驗證的觀察時間。"]:[]),
  ...(staleQuotes?["有 "+staleQuotes+" 筆報價超過 48 小時。"]:[]),
  ...cream.warnings
 ];
 return {
  status:"completed",capability:"cream",executedBy:"detroit-native",
  readOnly:true,networkUsed:false,modelInvoked:false,
  productKey,merchants:offers.length,analyzedQuotes:metric.n,unverifiedOrigin:true,
  staleQuotes,unknownObservedAt,
  stats:{mean:metric.mean,median:metric.median,min:metric.min,max:metric.max,n:metric.n},
  insights:[...(cream.insights??[])].slice(0,5),warnings
 };
}
