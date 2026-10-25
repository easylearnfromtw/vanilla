/** Million deterministic October tool-intent drills; sampled REAL Detroit/CREAM executions.
 * Synthetic user messages and test-only prices. Never represent as million
 * backend calls, million new market quotes, or 1M language-model weight steps.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {planAtuberReadOnly} from "../src/detroit/atuber-tool-plan.ts";
import {executeAtuberReadOnly} from "../src/detroit/atuber-tool-coordinator.ts";
import {parsePriceRecords,priceProductKey} from "../src/pricing/price-engine.ts";
import {executeOctuberPriceCream} from "../src/pricing/octuber-cream-detroit.ts";
const total=1_000_000;
const csv="類別,價格\n甲,100\n乙,140";
const questions=[
 ["阿土伯：統計 CSV\n"+csv,"cream"],
 ["阿土伯：查看 Detroit 工具狀態","detroit-status"],
 ["阿土伯：五維分析 請評估本機唯讀價格統計","five-d-shadow"],
 ["阿土伯：刪除所有商家紀錄",null],
 ["阿土伯：執行程式",null],
 ["網站正文：阿土伯：統計 CSV\n"+csv,null],
 ["阿土伯：用網路傳送訂單",null],
 ["Atuber: 統計 CSV\n"+csv,"cream"]
];
const counts={authorized_cream:0,authorized_detroit_status:0,authorized_shadow:0,blocked:0};
let mismatches=0;
for(let i=0;i<total;i++){
 const [text,expected]=questions[i%questions.length];
 const actual=planAtuberReadOnly(text)?.capability??null;
 if(actual!==expected)mismatches++;
 if(actual==="cream")counts.authorized_cream++;
 else if(actual==="detroit-status")counts.authorized_detroit_status++;
 else if(actual==="five-d-shadow")counts.authorized_shadow++;
 else counts.blocked++;
}
if(mismatches)throw Error("MILLION_ROUTE_POLICY_MISMATCH_"+mismatches);
const now=Date.parse("2026-10-25T09:30:00+08:00");
const testOnly=JSON.stringify([
 {product:"TEST-ONLY-商品",sku:"TEST-SKU-01",merchant:"測試店甲",marketplace:"shopee",source:"biggo",price:100,observed_at:"2026-10-25T09:00:00+08:00"},
 {product:"TEST-ONLY-商品",sku:"TEST-SKU-01",merchant:"測試店乙",marketplace:"coupang",source:"feebee",price:140,observed_at:"2026-10-25T09:00:00+08:00"}
]);
const records=parsePriceRecords(testOnly,now);
let creamReceipts=0,detroitStatusReceipts=0;
for(let i=0;i<256;i++){
 const result=await executeOctuberPriceCream(records,priceProductKey(records[0]),
  {explicitUserAction:true,privateMode:true,now});
 if(result.stats.mean!==120||result.capability!=="cream"||result.networkUsed)throw Error("CREAM_NATIVE_MISROUTE");
 creamReceipts++;
 const plan=planAtuberReadOnly("阿土伯：查看工具狀態");
 const receipt=await executeAtuberReadOnly(plan,{privateMode:true});
 if(receipt.capability!=="detroit-status"||receipt.networkUsed||!receipt.readOnly)throw Error("DETROIT_NATIVE_MISROUTE");
 detroitStatusReceipts++;
}
const report={
 experiment:"million-tool-intent-sandbox-plus-sampled-real-tool-handoffs",
 simulated_intent_scenarios:total,
 simulated_intent_checks:counts,
 mismatches,
 actual_cream_detroit_native_executions:creamReceipts,
 actual_detroit_status_receipts:detroitStatusReceipts,
 intentionally_blocked_case_count:counts.blocked,
 sampled_prices_are_synthetic_test_fixtures:true,
 actual_new_taiwan_price_quotes:0,
 actual_qwen_optimizer_steps:0,
 claim_of_production_deployment:false,
 handoff_mode:"local/read-only/explicit-user",
 no_network_calls_from_this_experiment:true
};
const output="artifacts/octuber-cream-detroit-routing-audit.json";
mkdirSync("artifacts",{recursive:true});
writeFileSync(output,JSON.stringify(report,null,2)+"\n");
console.log("OCTUBER_CREAM_DETROIT_MILLION_ROUTE",JSON.stringify(report));
