import test from 'node:test';
import assert from 'node:assert/strict';
import {creamInstruction,creamChartFollowup,parseCreamCSV,analyzeCream} from '../src/cream/core.ts';
import {pieSeries,numberLineSeries} from '../src/cream/extended-charts.ts';

test('natural language picks pie and number line, preserving line and scatter',()=>{
 assert.equal(creamInstruction('幫我畫圓餅圖\n類別,數值\nA,10\nB,20')?.kind,'pie');
 assert.equal(creamInstruction('製作數線圖\n項目,數值\nA,4\nB,9')?.kind,'numberline');
 assert.equal(creamInstruction('畫折線圖\n月份,營業額\n1月,10\n2月,20')?.kind,'line');
 assert.equal(creamChartFollowup('改成圓餅圖'),'pie');
 assert.equal(creamChartFollowup('請生成數線圖'),'numberline');
 assert.equal(creamChartFollowup('改成折線圖'),'line');
});
test('pie aggregates repeated category with traceable percent',()=>{
 const d=parseCreamCSV('類別,營業額\nA,10\nB,20\nA,30');
 const r=analyzeCream(d,'pie');const p=pieSeries(r.metrics[0].points);
 assert.equal(r.chartKind,'pie');assert.equal(p.total,60);assert.equal(p.slices.length,2);
 assert.equal(p.slices[0].value,40);assert.ok(Math.abs(p.slices[0].percent-66.66666666666667)<1e-5);
});
test('pie rejects negative and zero totals rather than invent chart',()=>{
 assert.match(pieSeries([{row:1,label:'A',value:-1}]).error,/負值/);
 assert.match(pieSeries([{row:1,label:'A',value:0}]).error,/大於 0/);
});
test('number line uses quantitative x and stacks repeats',()=>{
 const d=numberLineSeries([{row:2,label:'A',value:3},{row:3,label:'B',value:3},{row:4,label:'C',value:9}]);
 assert.equal(d.min,3);assert.equal(d.max,9);
 assert.equal(d.points[0].x,0);assert.equal(d.points[1].stack,1);assert.equal(d.points[2].x,1);
});