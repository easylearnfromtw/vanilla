import test from "node:test";
import assert from "node:assert/strict";
import {planAppIntent,PROJECTS} from "../src/assistant/intent-router.ts";
import {getFitnessReport,formatFitnessReport,parseRunDraft,appendFitnessRun} from "../src/assistant/fitness-bridge.ts";
import {proposeSheetAction,commitSheetAction} from "../src/assistant/sheet-actions.ts";
import {getSources,setSources,searchLinks} from "../src/search/source-preferences.ts";

function store(){
 // The app runs in a browser; node:test needs a minimal event target mock.
 globalThis.window={dispatchEvent:()=>true};
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
  assert.equal(result.workbook.sheets[0].cells.F2.raw,"=SUM(D2:D2)-SUM(E2:E2)");
  assert.equal(result.workbook.sheets[0].cells.B30.raw,"合計");
  assert.equal(result.workbook.sheets[0].cells.F30.raw,"=D30-E30");
 }
 assert.equal(planAppIntent("表格是什麼意思"),null);
 assert.equal(planAppIntent("開啟雲端檔案")?.kind,"open");
 assert.equal(planAppIntent("開啟手機操作 Agent")?.section,"mobile");
 assert.equal(planAppIntent("幫我串接 Canva API")?.kind,"integration");
 assert.equal(planAppIntent("記住：我喜歡直接回答")?.kind,"memory-save");
 assert.equal(planAppIntent("搜尋：臺灣醫療指引")?.kind,"search");
 assert.equal(planAppIntent("學習網站 https://example.com")?.kind,"memory-save");
 assert.equal(planAppIntent("忘記：旅行訂房")?.kind,"memory-delete");
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

test("Chat spreadsheet edits require explicit commit and detect stale revisions",()=>{
 const entries=store();
 const planned=planAppIntent("幫我做一個家庭收支表格");
 assert.equal(planned?.kind,"sheet");
 if(planned?.kind!=="sheet")return;
 const book=planned.workbook;
 entries.set("vanilla.sheets.workbooks.v1",JSON.stringify([book]));
 entries.set("vanilla.sheets.current.v1",book.id);
 const change=proposeSheetAction("在表格 B2 改成 餐飲");
 assert.ok(change);assert.equal(change.edits[0].cell,"B2");
 assert.equal(JSON.parse(entries.get("vanilla.sheets.workbooks.v1"))[0].sheets[0].cells.B2,undefined);
 globalThis.window={dispatchEvent:()=>true};
 const updated=commitSheetAction(change);
 assert.equal(updated.sheets[0].cells.B2.raw,"餐飲");
 const conflict=proposeSheetAction("在表格 B2 改成 交通");
 assert.ok(conflict);
 commitSheetAction(proposeSheetAction("在表格 B2 改成 購物"));
 assert.throws(()=>commitSheetAction(conflict),/其他操作更新/);
});
