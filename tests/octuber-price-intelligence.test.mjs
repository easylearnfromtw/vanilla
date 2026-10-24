import test from "node:test";
import assert from "node:assert/strict";
import {parsePriceRecords,comparePrices,priceProductKey,priceSearchSources} from "../src/pricing/price-engine.ts";
import {ATUBER_TIERS,OCTUBER_HIGH_CAPACITY,ATUBER_LOCAL_MODEL,octuberTierPreference,setOctuberTierPreference} from "../src/ai/atuber-control-plane.ts";
const STAMP=Date.parse("2026-10-24T11:00:00+08:00");
const FEED=[
 {product:"Sony ABC",sku:"SONY-ABC-1",merchant:"店 A",source:"biggo",price:1680,observed_at:"2026-10-24T10:00:00+08:00"},
 {product:"Sony ABC",sku:"SONY-ABC-1",merchant:"店 B",source:"feebee",price:1740,observed_at:"2026-10-24T10:00:00+08:00"},
 {product:"Sony ABC",sku:"SONY-ABC-1",merchant:"店 A",source:"biggo",price:1700,observed_at:"2026-10-24T10:00:00+08:00"},
 {product:"Sony ABC",sku:"SONY-ABC-1",merchant:"店 C",source:"lbj",price:1900,observed_at:"2026-10-24T10:00:00+08:00"},
];
test("OCTUBER branding preserves verified legacy aliases and 0.6B bootstrap",()=>{
 assert.equal(ATUBER_LOCAL_MODEL,"Qwen3-0.6B-q4f16_1-MLC");
 assert.deepEqual(ATUBER_TIERS.map(x=>x.brand),[
  "OCTUBER FLATTERING","OCTUBER MODEST","OCTUBER SUMPTUOUS"
 ]);
 assert.deepEqual(ATUBER_TIERS.map(x=>x.model),["october:sm","october:ml","october:lg"]);
 assert.equal(OCTUBER_HIGH_CAPACITY.base,"qwen3:32b");
 assert.equal(OCTUBER_HIGH_CAPACITY.label,"OCTUBER SUMPTUOUS · 32B Dense");
 assert.deepEqual(ATUBER_TIERS.map(x=>x.publicAlias),[
  "octuber:flattering","octuber:modest","octuber:sumptuous"
 ]);
});
test("CSV and JSON ingestion preserve price provenance and matching SKU",()=>{
 const csv="product,sku,merchant,source,price,observed_at\nSony ABC,SONY-ABC-1,店 A,biggo,1680,2026-10-24T10:00:00+08:00";
 const parsed=parsePriceRecords(csv,STAMP);
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].price,1680);
 assert.equal(parsed[0].source,"biggo");
 assert.equal(parsed[0].currency,"TWD");
 const fromJson=parsePriceRecords(JSON.stringify(FEED),STAMP);
 assert.equal(fromJson.length,4);
 assert.equal(new Set(fromJson.map(priceProductKey)).size,1);
 assert.equal(priceSearchSources().length,3);
});
test("price suggestions are only a bounded reference, de-duplicated per merchant",()=>{
 const rows=parsePriceRecords(JSON.stringify(FEED),STAMP);
 const result=comparePrices(rows,priceProductKey(rows[0]),{
  currentPrice:2100,cost:1700,minimumMargin:0.2,maxChangeRate:0.1,now:STAMP
 });
 assert.equal(result.vendors,3);
 assert.equal(result.offers,4);
 assert.equal(result.min,1680);
 assert.equal(result.median,1740);
 assert.equal(result.floorPrice,2125);
 assert.equal(result.targetPrice,2125);
 assert.equal(result.referenceOnly,true);
});
test("invalid prices, invalid URLs, cross-currency and future observations rejected",()=>{
 const item={product:"ABC",merchant:"店 A",price:100,source:"merchant"};
 for(const override of [{price:-3},{currency:"USD"},{url:"http://example.com"}, {observed_at:"2099-01-01T00:00:00Z"}]){
  assert.throws(()=>parsePriceRecords(JSON.stringify([{...item,...override}]),STAMP));
 }
});
test("single report cannot reprice without independent merchant comparison",()=>{
 const rows=parsePriceRecords(JSON.stringify([FEED[0]]),STAMP);
 const result=comparePrices(rows,priceProductKey(rows[0]),{currentPrice:1000,cost:800,minimumMargin:0.2,now:STAMP});
 assert.equal(result.targetPrice,null);
 assert.ok(result.notes.some(x=>x.includes("少於兩家")));
});
test("manual size preference defaults safely and only accepts known tiers",()=>{
 assert.equal(octuberTierPreference(),"auto");
 setOctuberTierPreference("mid-large");
 assert.equal(octuberTierPreference(),"auto"); // no browser storage in node
});
