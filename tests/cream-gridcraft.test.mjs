import test from "node:test";
import assert from "node:assert/strict";
import {analyzeCream,parseCreamCSV} from "../src/cream/core.ts";
import {prepareCreamGridCraftReport} from "../src/cream/gridcraft-report.ts";

test("CREAM report exports full summary stats but only sourced plot preview",()=>{
 const csv="月份,金額\n"+Array.from({length:60},(_,i)=>`${i+1}月,${i+1}`).join("\n");
 const result=analyzeCream(parseCreamCSV(csv,"試算資料.csv"),"line");
 const metric=result.metrics[0];
 const payload=prepareCreamGridCraftReport(result,metric,"line");
 assert.equal(payload.rowCount,60);
 assert.equal(payload.metrics[0].n,60);
 assert.equal(payload.metrics[0].sum,1830);
 assert.equal(payload.points.length,48);
 assert.equal(payload.points[0].row,2);
 assert.equal(payload.points.at(-1).row,49);
 assert.equal(payload.chartKind,"line");
});

test("CREAM XY chart exports real X-values, no invented values",()=>{
 const result=analyzeCream(parseCreamCSV("年齡,血壓\n18,110\n20,120\n22,130"));
 const y=result.metrics.find(x=>x.key==="血壓");
 const x=result.metrics.find(x=>x.key==="年齡");
 const payload=prepareCreamGridCraftReport(result,y,"scatter");
 assert.deepEqual(payload.points.map(p=>p.x),[18,20,22]);
 assert.equal(payload.chartKind,"scatter");
 assert.equal(prepareCreamGridCraftReport(result,x,"scatter").chartKind,"bar");
});

test("CREAM report does not invent missing summary or export out-of-result metric",()=>{
 const result=analyzeCream(parseCreamCSV("類別,分數\n甲,-10\n乙,20"));
 const m=result.metrics[0];
 const payload=prepareCreamGridCraftReport(result,m,"pie");
 assert.equal(payload.metrics[0].sum,10);
 assert.equal(payload.points[0].value,-10);
 assert.throws(()=>prepareCreamGridCraftReport(result,{...m,key:"偽造欄位"},"pie"));
});
