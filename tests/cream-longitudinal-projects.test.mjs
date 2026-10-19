import test from "node:test";
import assert from "node:assert/strict";
import {fromCreamRows} from "../src/cream/core.ts";
import {datasetObservations,analyzeLongitudinal,parseDate,extractTextMeasurements,makeCreamSnapshot} from "../src/cream/longitudinal.ts";
import {indexProjectSource,validateProjectRepo,safeProjectPath,redactProjectText,
 projectKnowledgeMatches,projectKnowledgePrompt,validateOpenAPI} from "../src/projects/project-core.ts";
import {projectCodeTrainingJSONL} from "../src/projects/training-export.ts";
test("CREAM derives actual date+metric observations from file with units and excludes misleading identifiers",()=>{
 const data=fromCreamRows([
  ["日期","體重 (kg)","身高 (cm)","ID"],["2026-10-01","75.0","172","0001"],
  ["2026-10-08","74.2","172","0002"],["2026-10-15","73.9","172","0003"]
 ],"weight.csv");
 const out=datasetObservations(data);
 assert.equal(out.observations.length,6);
 assert.ok(!out.observations.some(x=>x.metric==="ID"));
 assert.deepEqual([...new Set(out.observations.filter(x=>x.metric==="體重").map(x=>x.unit))],["kg"]);
 const trends=analyzeLongitudinal(out.observations);
 const weight=trends.find(x=>x.metric==="體重");
 assert.equal(weight?.count,3);
 assert.equal(weight?.firstDate,"2026-10-01");
 assert.equal(weight?.latest,73.9);
 assert.ok((weight?.slopePer30Days??0)<0);
 assert.match(weight?.insights.join(" ")||"",/不代表因果/);
});
test("CREAM text import preserves date and declared unit without inventing unsupported rows",()=>{
 assert.equal(parseDate("2026-02-29"),null);
 assert.equal(parseDate("2024-02-29"),"2024-02-29");
 const parsed=extractTextMeasurements("2026-10-01 體重: 75 kg\n2026-10-08 體重: 74.2 kg\n不要憑想像幫我補值");
 assert.ok(parsed);
 assert.equal(parsed.rows.length,2);
 assert.equal(parsed.rows[1][3],"kg");
 assert.equal(datasetObservations(parsed).observations.length,2);
});
test("CREAM separates units, preserves daily mean, reports missing and goal uncertainty",()=>{
 const dataset=fromCreamRows([["日期","使用者 (人)"],["2026-10-01","100"],["2026-10-01","200"],["2026-10-02","210"],["2026-10-03","230"]],"site");
 const rows=datasetObservations(dataset).observations;
 const trends=analyzeLongitudinal(rows,{metric:"使用者",unit:"人",target:260,direction:"increase"});
 assert.equal(trends.length,1);
 assert.equal(trends[0].count,4);
 assert.equal(trends[0].uniqueDates,3);
 assert.equal(trends[0].first,150);
 assert.equal(trends[0].latest,230);
 assert.equal(trends[0].goal?.met,false);
 assert.ok(trends[0].quality.some(x=>x.includes("同一天")));
 assert.equal(analyzeLongitudinal([...rows,{...rows[0],unit:"次"}]).length,2);
});
test("CREAM dataset snapshot fingerprint resists accidental duplicates at the same observed source",()=>{
 const data=fromCreamRows([["日期","營業額"],["2026-10-01","100"],["2026-10-02","120"]],"Revenue.csv");
 const a=makeCreamSnapshot(data,"account:owner"),b=makeCreamSnapshot(data,"account:owner");
 assert.notEqual(a.id,b.id);
 assert.equal(a.fingerprint,b.fingerprint);
 assert.throws(()=>makeCreamSnapshot(data,""),/個人/);
});
test("PROJECT HUB reads only user-owned repo paths, redacts credentials, and lists real indexed symbols",()=>{
 assert.equal(validateProjectRepo("easylearnfromtw/citymusic"),"easylearnfromtw/citymusic");
 for(const x of ["stranger/citymusic","../evil","easylearnfromtw/../../admin"])assert.throws(()=>validateProjectRepo(x));
 for(const x of [".env","node_modules/a.js","../app.ts",".github/workflows/pages.yml","api-secret.json","foo/credentials.ts"])
  assert.throws(()=>safeProjectPath(x),undefined,x);
 assert.ok(redactProjectText("const api_key=ABCDEFGH1234567890;").includes("[REDACTED]"));
 const file=indexProjectSource("easylearnfromtw/citymusic","index.html",
  '<title>CITYMUS</title><script>function calculateCityMoney(){} function renderMusic(){}</script>');
 assert.equal(file.language,"html");
 assert.ok(file.functions.includes("calculateCityMoney"));
 const corpus={id:"1",owner:"test",repo:"easylearnfromtw/citymusic",updatedAt:"2026-10-19",files:[file],source:"github",warnings:[]};
 const matching=projectKnowledgeMatches([corpus],"CITYMUS renderMusic");
 assert.equal(matching.length,1);
 assert.match(projectKnowledgePrompt(matching),/github.com\/easylearnfromtw\/citymusic/);
 assert.match(projectKnowledgePrompt(matching),/不得執行/);
});
test("only public GET operations are selectable from a user-supplied OpenAPI schema",()=>{
 assert.throws(()=>validateOpenAPI({openapi:"3.0.3",servers:[{url:"http://localhost"}],paths:{"/x":{get:{}}}},"api.json"));
 assert.throws(()=>validateOpenAPI({openapi:"3.0.3",servers:[{url:"https://example.org"}],paths:{"/delete":{post:{}}}},"api.json"));
 const api=validateOpenAPI({openapi:"3.0.3",info:{title:"Owned API"},servers:[{url:"https://api.example.org"}],
  paths:{"/public":{get:{summary:"Read metrics"},post:{}}, "/users/{id}":{get:{summary:"requires params"}}}},"openapi.json");
 assert.deepEqual(api.paths.map(x=>x.path),["/public"]);
});
test("project SFT creates source-grounded prompt/completion records with held-out files",()=>{
 const template="export function example(){const sample=1234; return sample;}\n";
 const files=Array.from({length:12},(_,i)=>indexProjectSource("easylearnfromtw/vanilla","src/module"+i+".ts",template.repeat(20)));
 const c={id:"1",owner:"test",repo:"easylearnfromtw/vanilla",updatedAt:"2026-10-19",files,source:"github",warnings:[]};
 const train=projectCodeTrainingJSONL([c],"train").trim().split("\n").filter(Boolean);
 const evals=projectCodeTrainingJSONL([c],"eval").trim().split("\n").filter(Boolean);
 assert.ok(train.length>0&&evals.length>0);
 for(const line of [...train,...evals]){
  const x=JSON.parse(line);assert.deepEqual(Object.keys(x),["prompt","completion"]);
  assert.equal(x.prompt[0].role,"user");assert.equal(x.completion[0].role,"assistant");
 }
});
