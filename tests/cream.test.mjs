import test from "node:test";
import assert from "node:assert/strict";
import {parseCreamCSV,fromCreamRows,analyzeCream,creamInstruction,creamChartFollowup,summarizeCream} from "../src/cream/core.ts";

test("quoted CSV, BOM, CRLF and escaped quotes parse consistently",()=>{
 const ds=parseCreamCSV('\ufeff月份,金額,備註\r\n一月,100,"A, ""B"""\r\n二月,200,正常\r\n',"sample.csv");
 assert.deepEqual(ds.columns,["月份","金額","備註"]);
 assert.equal(ds.rows[0][2],'A, "B"');
 assert.equal(ds.rows.length,2);
});
test("numeric summaries are deterministic and missing values disclosed",()=>{
 const ds=parseCreamCSV("月份,數值\n一月,10\n二月,20\n三月,\n四月,30","trial.csv");
 const result=analyzeCream(ds,"line");
 assert.equal(result.source,"trial.csv");
 assert.equal(result.rowCount,4);
 const metric=result.metrics.find(m=>m.key==="數值");
 assert.ok(metric);
 assert.equal(metric.n,3);
 assert.equal(metric.missing,1);
 assert.equal(metric.sum,60);
 assert.equal(metric.mean,20);
 assert.equal(metric.median,20);
 assert.equal(metric.min,10);
 assert.equal(metric.max,30);
 assert.equal(metric.sampleStdDev,10);
 assert.deepEqual(metric.points.map(p=>p.row),[2,3,5]);
 assert.match(summarizeCream(result),/4 筆/);
});
test("mixed types are not coerced or treated as continuous measurements",()=>{
 const result=analyzeCream(parseCreamCSV("識別碼,數值\n001,2\n002,3\n003,bad"));
 assert.equal(result.metrics.length,0);
 assert.ok(result.warnings.some(s=>s.includes("數值")));
});
test("missing data, one-row SD and negative totals are handled",()=>{
 const result=analyzeCream(fromCreamRows([["類別","差異"],["甲",-7],["乙",""]],"manual"));
 const m=result.metrics[0];
 assert.equal(m.n,1);assert.equal(m.missing,1);
 assert.equal(m.mean,-7);assert.equal(m.sampleStdDev,null);
});
test("dangerous huge inputs, malformed files and duplicate columns are rejected",()=>{
 assert.throws(()=>parseCreamCSV("x,y\n1,\"unterminated"));
 assert.throws(()=>parseCreamCSV("a,a\n1,2"));
 assert.throws(()=>parseCreamCSV("a,b\n1,2\n".repeat(3005)));
 assert.throws(()=>parseCreamCSV("a,b\n1,2".repeat(200000)));
});
test("charts show only a clearly reported preview, statistics use full sample",()=>{
 const text="id,value\n"+Array.from({length:100},(_,i)=>"n"+i+","+(i+1)).join("\n");
 const result=analyzeCream(parseCreamCSV(text));
 const m=result.metrics[0];
 assert.equal(m.n,100);assert.equal(m.mean,50.5);
 assert.equal(m.points.length,48);
 assert.ok(result.warnings.some(s=>s.includes("48")));
});
test("only explicit tabular requests route to CREAM; follow-up chart changes are deterministic",()=>{
 const cmd=creamInstruction("CREAM：月份,銷售\n一月,10\n二月,15");
 assert.ok(cmd);assert.equal(cmd.kind,"auto");
 assert.equal(creamInstruction("CREAM 幫我統整醫學論文"),null);
 assert.equal(creamChartFollowup("把圖改成折線圖"),"line");
 assert.equal(creamChartFollowup("切換成散佈圖"),"scatter");
 assert.equal(creamChartFollowup("幫我整理文獻"),null);
});

test("extra CSV cells are rejected rather than silently dropped",()=>{
 assert.throws(()=>parseCreamCSV("欄一,欄二\n1,2,3"),/欄位數/);
});

test("trace keeps original line numbers even when blank input rows are skipped",()=>{
 const ds=parseCreamCSV("月份,數值\n甲,5\n,\n乙,7");
 assert.equal(ds.rows.length,2);
 assert.deepEqual(ds.rowNumbers,[2,4]);
 const result=analyzeCream(ds,"line");
 assert.deepEqual(result.metrics[0].points.map(p=>p.row),[2,4]);
 assert.deepEqual(result.metrics[0].points.map(p=>p.label),["甲","乙"]);
});

test("auto chart selection uses time labels and produces sourced deterministic insights",()=>{
 const ds=parseCreamCSV("月份,銷售\n一月,10\n二月,15\n三月,22");
 const result=analyzeCream(ds);
 assert.equal(result.chartKind,"line");
 assert.equal(result.autoChartKind,"line");
 assert.match(result.chartReason,/時間/);
 assert.ok(result.insights.some(x=>x.includes("首末觀測差")));
 assert.equal(analyzeCream(ds,"bar").chartKind,"bar");
});
test("XY scatter actually pairs numerical columns by source row",()=>{
 const ds=parseCreamCSV("年齡,收縮壓\n18,110\n20,120\n22,130\n24,");
 const result=analyzeCream(ds);
 assert.equal(result.chartKind,"scatter");
 assert.equal(result.scatterAxis?.xKey,"年齡");
 assert.equal(result.scatterAxis?.n,3);
 assert.ok(Math.abs(result.scatterAxis.pearsonR-1)<1e-10);
 const y=result.metrics.find(m=>m.key==="收縮壓");
 assert.deepEqual(y.points.map(p=>p.x),[18,20,22]);
 assert.ok(result.insights.some(x=>x.includes("不能推論因果")));
});
test("ID columns not used as scatter X, category data gets bar",()=>{
 const id=analyzeCream(parseCreamCSV("識別碼,成績\n001,20\n002,30\n003,40"));
 assert.equal(id.chartKind,"bar");
 const categories=analyzeCream(parseCreamCSV("組別,分數\nA,8\nB,12\nC,9"));
 assert.equal(categories.chartKind,"bar");
});
test("ordinary chat containing explicit tabular data auto-routes without capturing unrelated prose",()=>{
 const q="幫我分析以下資料\n月份,營業額\n一月,20\n二月,22";
 const parsed=creamInstruction(q);
 assert.ok(parsed);
 assert.equal(parsed.kind,"auto");
 assert.equal(analyzeCream(parseCreamCSV(parsed.csv)).chartKind,"line");
 assert.equal(creamInstruction("請幫我分析報告的結果，沒有表格"),null);
});