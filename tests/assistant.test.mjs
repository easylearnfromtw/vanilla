import test from "node:test";
import assert from "node:assert/strict";
import {planAppIntent,PROJECTS} from "../src/assistant/intent-router.ts";
import {getFitnessReport,formatFitnessReport,parseRunDraft,appendFitnessRun} from "../src/assistant/fitness-bridge.ts";
import {getSources,setSources,searchLinks} from "../src/search/source-preferences.ts";

function store(){
 const entries=new Map();
 globalThis.localStorage={
  getItem:key=>entries.get(key)??null,
  setItem:(key,value)=>entries.set(key,String(value)),
  removeItem:key=>entries.delete(key),
  clear:()=>entries.clear()
 };
 return entries;
}
test("Conversation tools create real editable sheets, not fabricated Markdown",()=>{
 store();
 const result=planAppIntent("幫我做一份家庭收支表格");
 assert.equal(result?.kind,"sheet");
 if(result?.kind==="sheet"){
  assert.equal(result.workbook.sheets.length,1);
  assert.equal(result.workbook.sheets[0].cells.A1.raw,"日期");
  assert.equal(result.workbook.sheets[0].cells.E1.raw,"支出");
 }
 assert.equal(planAppIntent("表格是什麼意思"),null);
 assert.equal(planAppIntent("開啟雲端檔案")?.kind,"open");
 assert.equal(planAppIntent("記住：我喜歡直接回答")?.kind,"memory-save");
 assert.equal(planAppIntent("搜尋：臺灣醫療指引")?.kind,"search");
});
test("Project registry uses actual Github repos and names",()=>{
 assert.ok(PROJECTS.some(x=>x.id==="fitness"&&x.repo==="easylearnfromtw/Builder"));
 assert.equal(planAppIntent("查詢健人的跑步數據")?.kind,"project");
 assert.equal(planAppIntent("幫我在健人新增 6 公里 40 分鐘跑步")?.kind,"project");
});
test("Fitness reporting counts only actual completed records and preserves state",()=>{
 const entries=store();
 const state={v:1,profile:{name:"測試使用者"},lifts:[{id:"l1",date:"2026-10-18",items:[]},{id:"demo",date:"2026-10-18",items:[],ex:true}],
  runs:[{id:"r1",date:"2026-10-18",km:5,sec:1800,type:"easy",ex:false},{id:"demo",date:"2026-10-18",km:10,sec:3600,ex:true}]};
 entries.set("kai-log-v1",JSON.stringify(state));
 const report=getFitnessReport();
 assert.equal(report.runs,1);assert.equal(report.lifts,1);assert.equal(report.totalKm,5);
 assert.match(formatFitnessReport(report),/5 km/);
 const draft=parseRunDraft("2026-10-19 幫我在健人新增 6 公里 40 分鐘跑步 心率 150");
 assert.ok(draft);assert.equal(draft.km,6);assert.equal(draft.minutes,40);assert.equal(draft.hr,150);
 appendFitnessRun(draft);
 const updated=JSON.parse(entries.get("kai-log-v1"));
 assert.equal(updated.runs.length,3);
 assert.equal(updated.profile.name,"測試使用者");
 assert.equal(updated.runs.at(-1).km,6);
 assert.throws(()=>appendFitnessRun(draft),/相同日期/);
});
test("Preferred site controls never pretend to fetch evidence",()=>{
 store();
 assert.ok(searchLinks("臨床指引").some(x=>x.url.includes("pubmed.ncbi.nlm.nih.gov")));
 assert.throws(()=>setSources([{host:"localhost",label:"惡意",weight:5,enabled:true}]));
 setSources([{host:"pubmed.ncbi.nlm.nih.gov",label:"PubMed",weight:5,enabled:true}]);
 assert.equal(getSources()[0].weight,5);
 assert.ok(searchLinks("diabetes")[1].url.includes("site%3Apubmed"));
});
