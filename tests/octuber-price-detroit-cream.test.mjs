import test from "node:test";
import assert from "node:assert/strict";
import {executeOctuberPriceCream} from "../src/pricing/octuber-cream-detroit.ts";
import {parsePriceRecords,priceProductKey} from "../src/pricing/price-engine.ts";
import {detroitBus} from "../src/detroit/capability-bus.ts";

const NOW=Date.parse("2026-10-25T10:00:00+08:00");
const observed="2026-10-25T09:00:00+08:00";
function quotes(extra=[]){
 return parsePriceRecords(JSON.stringify([
  {product:"測試同型手機",sku:"PHONE-A1",merchant:"店家甲",marketplace:"shopee",source:"biggo",price:1000,observed_at:observed},
  {product:"測試同型手機",sku:"PHONE-A1",merchant:"店家乙",marketplace:"coupang",source:"feebee",price:1200,observed_at:observed},
  {product:"測試同型手機",sku:"PHONE-A1",merchant:"店家甲",marketplace:"shopee",source:"lbj",price:1100,observed_at:"2026-10-24T09:00:00+08:00"},
  ...extra
 ]),NOW);
}
test("October price page routes into real Detroit native CREAM executor with verified receipt",async()=>{
 const records=quotes();
 const receipt=await executeOctuberPriceCream(records,priceProductKey(records[0]),
   {explicitUserAction:true,privateMode:true,now:NOW});
 assert.equal(receipt.capability,"cream");
 assert.equal(receipt.executedBy,"detroit-native");
 assert.equal(receipt.status,"completed");
 assert.equal(receipt.networkUsed,false);
 assert.equal(receipt.readOnly,true);
 assert.equal(receipt.modelInvoked,false);
 assert.equal(receipt.analyzedQuotes,2);
 assert.equal(receipt.merchants,2);
 assert.equal(receipt.stats.min,1000);
 assert.equal(receipt.stats.max,1200);
 assert.equal(receipt.stats.median,1100);
 assert.equal(receipt.stats.mean,1100);
 assert.equal(receipt.staleQuotes,0);
 assert.equal(detroitBus.isRunnable("cream"),true);
 assert.ok(receipt.insights.length>0);
 assert.ok(receipt.warnings.some(x=>x.includes("本機匯入")));
 assert.doesNotMatch(receipt.insights.join(" "),/feebee|biggo|lbj/i);
});
test("read-only execution requires explicit UI action and rejects no valid seller",async()=>{
 const records=quotes();
 const key=priceProductKey(records[0]);
 await assert.rejects(()=>executeOctuberPriceCream(records,key,{explicitUserAction:false,privateMode:true}),/EXPLICIT_ACTION/);
 await assert.rejects(()=>executeOctuberPriceCream(records,"sku:OTHER",{explicitUserAction:true,privateMode:true}),/NO_VALID_SELLER/);
 const bad=records.map(r=>({...r,merchant:"BigGo"}));
 await assert.rejects(()=>executeOctuberPriceCream(bad,key,{explicitUserAction:true,privateMode:true}),/NO_VALID_SELLER/);
 const cancelled=new AbortController();cancelled.abort();
 await assert.rejects(()=>executeOctuberPriceCream(records,key,{
  explicitUserAction:true,privateMode:true,signal:cancelled.signal
 }),/CANCELLED/);
});
test("stale and missing observed times are explicit, not inferred as live",async()=>{
 const rows=quotes().map((r,i)=>i===0?{...r,observedAt:null}:r);
 const receipt=await executeOctuberPriceCream(rows,priceProductKey(rows[0]),{
  explicitUserAction:true,privateMode:true,now:NOW+7*24*3600000
 });
 assert.ok(receipt.unknownObservedAt>=1);
 assert.ok(receipt.staleQuotes>=1);
 assert.equal(receipt.unverifiedOrigin,true);
});
test("malformed CREAM receipt cannot claim success",async()=>{
 const data=quotes();
 await assert.rejects(()=>executeOctuberPriceCream(data,priceProductKey(data[0]),{
  explicitUserAction:true,privateMode:true,executeCream:async()=>({
   rowCount:2,metrics:[],warnings:[],insights:[]
  })
 }),/RECEIPT_INVALID/);
});
test("the page explicitly exposes a real Detroit -> CREAM button",async()=>{
 const {readFileSync}=await import("node:fs");
 const page=readFileSync(new URL("../src/pricing/PriceIntelligencePanel.tsx",import.meta.url),"utf8");
 assert.match(page,/executeOctuberPriceCream\(rows,selectedKey/);
 assert.match(page,/Detroit → CREAM/);
 assert.match(page,/creamReport\.stats\.median/);
 assert.match(page,/explicitUserAction:true/);
});
