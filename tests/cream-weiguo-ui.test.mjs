import test from "node:test";
import assert from "node:assert/strict";
import {parseCreamCSV,analyzeCream,creamInstruction,creamChartFollowup} from "../src/cream/core.ts";
import {pieSeries,numberLineSeries} from "../src/cream/extended-charts.ts";
import {validateToolManifest,BUILTIN_TOOLS} from "../src/weiguo/registry.ts";
import {readFileSync} from "node:fs";

test("CREAM: recognizes requested pie and number-line plots in a pasted CSV conversation",()=>{
 const csv="分類,值\n甲,30\n乙,20\n丙,50";
 const pie=creamInstruction("幫我畫圓餅圖\n"+csv);
 assert.equal(pie?.kind,"pie");
 assert.equal(pie?.csv,csv);
 assert.equal(creamInstruction("幫我畫數線圖\n"+csv)?.kind,"numberline");
 assert.equal(creamInstruction("幫我畫折線圖\n月份,營收\n一月,20\n二月,25")?.kind,"line");
 assert.equal(creamChartFollowup("改成圓餅圖"),"pie");
 assert.equal(creamChartFollowup("顯示數線圖"),"numberline");
});
test("CREAM: pie proportions use real data and never hide invalid negative values",()=>{
 const result=analyzeCream(parseCreamCSV("分類,值\n甲,30\n乙,20\n丙,50"),"pie");
 assert.equal(result.chartKind,"pie");
 const metric=result.metrics[0];
 const model=pieSeries(metric.points);
 assert.equal(model.error,undefined);
 assert.equal(model.total,100);
 assert.deepEqual(model.slices.map(x=>Math.round(x.percent)),[30,20,50]);
 assert.ok(Math.abs(model.slices.at(-1).end-360)<0.001);
 assert.match(pieSeries([{row:2,label:"甲",value:-5}]).error||"",/負值/);
});
test("CREAM: number line keeps real distances and stacks identical coordinates",()=>{
 const data=numberLineSeries([{row:2,label:"A",value:2},{row:3,label:"B",value:2},{row:4,label:"C",value:12}]);
 assert.equal(data.min,2);assert.equal(data.max,12);
 assert.equal(data.points[0].x,0);
 assert.equal(data.points[1].stack,1);
 assert.equal(data.points[2].x,1);
});
test("衞國: manifests require safe, account-isolated declarative permissions",()=>{
 assert.ok(BUILTIN_TOOLS.some(t=>t.id==="scouts-browser"));
 const valid=validateToolManifest({id:"my-tool",label:"Research",kind:"custom",description:"Read only",enabled:false,permissions:["read"]});
 assert.equal(valid.kind,"custom");
 assert.throws(()=>validateToolManifest({...valid,id:"scouts-browser"}),/不可覆蓋/);
 assert.throws(()=>validateToolManifest({...valid,permissions:["execute"]}),/權限/);
 assert.throws(()=>validateToolManifest({...valid,code:"eval(1)"}),/不接受/);
});
test("iPhone empty chat excludes RECENT; Detroit status belongs to the assistant message",()=>{
 const home=readFileSync(new URL("../src/local-ai/ChatHome.tsx",import.meta.url),"utf8");
 const chat=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
 assert.ok(!home.includes("vh-recent")&&!home.includes("props.recent.slice"));
 assert.ok(app.includes("RECENT · 最近對話"));
 const msg=chat.indexOf('index===latestAssistant&&<DetroitStages plan={detroitPlan}/>');
 assert.ok(msg>chat.indexOf('className="message-list"'));
 assert.ok(app.includes('label:"衞國系統"'));
});
