import test from "node:test";
import assert from "node:assert/strict";
import {shouldVictoriaAnalyzeLongitudinal,summarizeVictoriaLongitudinal} from "../src/detroit/victoria-longitudinal.ts";
import {victoriaTaskQuery} from "../src/detroit/victoria.ts";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const trend=(metric,unit,first,latest,more={})=>({
 metric,unit,count:12,uniqueDates:12,firstDate:"2025-01-01",lastDate:"2026-01-01",
 first,latest,change:latest-first,changePercent:latest!==0?(latest-first)/Math.abs(first)*100:0,
 mean:(first+latest)/2,min:Math.min(first,latest),max:Math.max(first,latest),
 slopePer30Days:(latest-first)/12,volatility:1,outliers:0,quality:[],direction:"stable",
 insights:[],recommendations:[],points:[{date:"2025-01-01",value:first,source:"Owner CSV"}],...more
});
const snapshot={id:"s1",owner:"signed-owner",source:"Owner CSV",importedAt:"2026-01-01",
 observations:[],rowsAnalyzed:12,warnings:[],fingerprint:"example"};
test("Victoria long-term requests use real CREAM metrics, not generated statistics",()=>{
 assert.equal(shouldVictoriaAnalyzeLongitudinal("分析兩年來的長期數據趨勢"),true);
 assert.equal(shouldVictoriaAnalyzeLongitudinal("嗨，你好"),false);
 assert.equal(shouldVictoriaAnalyzeLongitudinal("繼續"),false);
 const r=summarizeVictoriaLongitudinal("比較血壓長期趨勢",{
  trends:[trend("血壓","mmHg",120,115),trend("收入","TWD",50000,60000)],
  snapshots:[snapshot]
 });
 assert.equal(r.matchedMetrics,1);
 assert.match(r.context,/血壓/);
 assert.match(r.context,/120/);
 assert.match(r.context,/115/);
 assert.doesNotMatch(r.context,/收入/);
 assert.match(r.context,/只讀本裝置/);
});
test("Victoria generic long-range requests show bounded metrics and scope",()=>{
 const rows=Array.from({length:12},(_,i)=>trend("系列"+i,"件",i,i+1));
 const r=summarizeVictoriaLongitudinal("長期數據趨勢分析",{trends:rows,snapshots:[snapshot]});
 assert.ok(r.matchedMetrics<=6);
 assert.equal(r.inspectedMetrics,12);
 assert.match(r.context,/低|品質|CREAM/);
 assert.ok(r.context.length<=3300);
});
test("Victoria refuses to infer trends without real numeric observations",()=>{
 const r=summarizeVictoriaLongitudinal("長期數據變化",{trends:[],snapshots:[]});
 assert.equal(r.context,"");
 assert.equal(r.matchedMetrics,0);
});
test("Victoria terse follow-ups reuse current user task, not unrelated archives",()=>{
 const turns=[{role:"user",content:"台大 PGY 2027 薪資與訓練路線分析"},{role:"assistant",content:"已經建立比較框架"}];
 assert.equal(victoriaTaskQuery("繼續",turns),"台大 PGY 2027 薪資與訓練路線分析");
 assert.equal(victoriaTaskQuery("請分析 2028 成本",turns),"請分析 2028 成本");
 assert.equal(victoriaTaskQuery("繼續",[]),"繼續");
});
test("October invokes a single consent-scoped Victoria + CREAM path",()=>{
 const file=fileURLToPath(new URL("../src/local-ai/LocalChat.tsx",import.meta.url));
 const source=readFileSync(file,"utf8");
 assert.match(source,/victoriaTaskQuery\(question,history\)/);
 assert.match(source,/executeDetroitNative<VictoriaRecall>\("victoria"/);
 assert.match(source,/includeLongitudinal:wantsLongitudinal/);
 assert.match(source,/contextPrefs\.cream&&shouldVictoriaAnalyzeLongitudinal\(question\)/);
 assert.match(source,/Victoria × CREAM 長期數據/);
 assert.match(source,/notice:\[primaryPrompt\.notice,victoriaStatus\]/);
 assert.match(source,/victoriaEnabled\|\|wantsLongitudinal/);
 // No silent fallback: the CREAM opt-in is evaluated by the native executor too.
 const executor=readFileSync(fileURLToPath(new URL("../src/detroit/native-executors.ts",import.meta.url)),"utf8");
 assert.match(executor,/prefs\.cream!==false/);
 assert.match(executor,/if\(!input\.includeLongitudinal\|\|ctx\.privateMode\)return recalled/);
});
test("Victoria longitudinal date and source are grounded, distinct units remain distinct",()=>{
 const rows=[
  trend("體重","kg",76,74,{points:[{date:"2025-01-01",value:76,source:"醫療紀錄CSV"}]}),
  trend("體重","lb",167,164,{points:[{date:"2025-01-01",value:167,source:"家庭自存紀錄"}]})
 ];
 const result=summarizeVictoriaLongitudinal("體重長期變化",{trends:rows,snapshots:[snapshot]});
 assert.equal(result.matchedMetrics,2);
 assert.equal(result.from,"2025-01-01");
 assert.equal(result.to,"2026-01-01");
 assert.match(result.context,/體重 \(kg\)/);
 assert.match(result.context,/體重 \(lb\)/);
 assert.match(result.context,/資料來源：醫療紀錄CSV/);
 assert.match(result.context,/不作因果推論/);
});
