import test from "node:test";
import assert from "node:assert/strict";
import {validateFeature,featureTemplate,installFeature,loadFeatures,removeFeature,
 testExpression,proposalFromAI,featureData,writeFeatureData,featureHistory,rollbackFeature} from "../src/builder/feature-schema.ts";
import {getToneProfile,saveToneProfile,learnToneFromMessage,toneInstruction,toneFeedback,resetToneProfile,applyExplicitToneRequest} from "../src/ai/tone-adaptation.ts";
import {offlineFeatureDraft} from "../src/builder/offline-designer.ts";
import {validateSelfBuildBackup,importSelfBuildBackup} from "../src/builder/backup.ts";
import {compareFeatureSpecs} from "../src/builder/feature-diff.ts";

function setup(){
 const storage=new Map();
 globalThis.localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key),
  clear:()=>storage.clear()
 };
 globalThis.window={dispatchEvent:()=>true};
 return storage;
}
test("Self-Build validates declarative modules but rejects executable/unsafe formulas",()=>{
 setup();
 const spec=validateFeature({name:"旅行預算計算",description:"輸入單價與數量",kind:"calculator",
 fields:[{id:"price",label:"單價",type:"number"},{id:"qty",label:"數量",type:"number"}],formula:"price*qty"});
 assert.equal(testExpression(spec.formula,{price:200,qty:3}),600);
 assert.equal(testExpression("(price-20)*qty",{price:200,qty:3}),540);
 assert.throws(()=>validateFeature({name:"任意程式",kind:"calculator",fields:[{id:"price",label:"價格",type:"number"}],formula:"alert(1)"}));
 assert.throws(()=>validateFeature({name:"偷取金鑰",kind:"calculator",fields:[{id:"price",label:"價格",type:"number"}],formula:"localStorage.token"}));
 assert.throws(()=>testExpression("price/0",{price:10}));
 assert.throws(()=>validateFeature({name:"缺少欄位",kind:"tracker",fields:[]}));
});
test("AI proposal requires JSON and never gains network or code capabilities",()=>{
 setup();
 const proposal=proposalFromAI('```json\n{"kind":"checklist","name":"日常事項","description":"整理生活","fields":[],"initialItems":["起床"],"script":"fetch(\\\"https://evil.test\\\")","permissions":["network"]}\n```');
 assert.equal(proposal.kind,"checklist");
 assert.equal(Object.hasOwn(proposal,"script"),false);
 assert.equal(Object.hasOwn(proposal,"permissions"),false);
 assert.equal(proposal.initialItems?.[0],"起床");
 assert.throws(()=>proposalFromAI("sudo rm -rf /"));
});
test("Approval installs a real app and saves data separately from app spec revisions",()=>{
 setup();
 const spec=featureTemplate("tracker");
 installFeature(spec);
 assert.equal(loadFeatures().length,1);
 writeFeatureData(spec.id,{items:[],records:[{id:"a",at:new Date().toISOString(),values:{date:"2026-10-19",item:"跑步",value:"6"}}],notes:"",inputs:{}});
 const revision=validateFeature({name:"運動追蹤",description:"改版",kind:"tracker",fields:[{id:"date",label:"日期",type:"date"},{id:"item",label:"活動",type:"text"},{id:"value",label:"數值",type:"number"}]},spec);
 installFeature(revision);
 assert.equal(loadFeatures()[0].revision,2);
 assert.equal(featureData(spec.id).records[0].values.item,"跑步");
 assert.equal(featureHistory(spec.id).length,1);
 const restored=rollbackFeature(spec.id);
 assert.equal(restored.name,spec.name);
 assert.equal(restored.revision,3);
 assert.equal(featureData(spec.id).records.length,1);
 removeFeature(spec.id);
 assert.equal(loadFeatures().length,0);
 assert.equal(featureData(spec.id).records.length,1);
});
test("Tone statistics learn from regular chat only and never persist raw utterance",()=>{
 const storage=setup();
 learnToneFromMessage("把這個功能直接做出來");
 learnToneFromMessage("然後加入表格");
 learnToneFromMessage("可以自動選擇模型嗎");
 const p=getToneProfile();
 assert.equal(p.samples,3);
 assert.match(toneInstruction(),/臺灣繁體中文/);
 assert.equal(storage.get("vanilla.tone.profile.v1").includes("把這個功能"),false);
 learnToneFromMessage("這是私密訊息不能學習",true);
 assert.equal(getToneProfile().samples,3);
 toneFeedback("verbose");
 assert.ok(getToneProfile().detail<55);
 saveToneProfile({...getToneProfile(),enabled:false});
 learnToneFromMessage("這則也不該學習");
 assert.equal(getToneProfile().samples,3);
 resetToneProfile();
 assert.equal(getToneProfile().samples,0);
});

test("Offline feature designer creates useful safe modules without contacting APIs",()=>{
 setup();
 const expense=offlineFeatureDraft("幫我做一個記帳和預算的功能");
 assert.equal(expense.spec.kind,"tracker");
 assert.ok(expense.spec.fields.some(field=>field.id==="expense"));
 assert.equal(expense.confidence,"high");
 const fitness=offlineFeatureDraft("我要建立跑步運動訓練紀錄");
 assert.equal(fitness.spec.kind,"tracker");
 assert.ok(fitness.spec.fields.some(field=>field.id==="distance"));
 const trip=offlineFeatureDraft("建立旅行行程規劃工具");
 assert.ok(trip.spec.fields.some(field=>field.id==="place"));
 const calc=offlineFeatureDraft("幫我做折扣計算器");
 assert.equal(calc.spec.kind,"calculator");
 assert.equal(testExpression(calc.spec.formula,{price:100,quantity:2,discount:0.1}),180);
 const revised=offlineFeatureDraft("增加備註欄位",expense.spec);
 assert.equal(revised.spec.revision,2);
 assert.ok(revised.spec.fields.some(x=>x.label==="備註"));
 assert.throws(()=>offlineFeatureDraft("幫我直接連接外部 API 同步資料",expense.spec));
});
test("Self-Build backup validates unknown data and installs separate copies with sanitization",()=>{
 setup();
 const spec=featureTemplate("tracker");
 installFeature(spec);
 writeFeatureData(spec.id,{items:[],records:[{id:"original",at:"2026-10-19",values:{date:"2026-10-19",item:"跑步",value:"6"}}],notes:"",inputs:{}});
 const backup={kind:"vanilla-self-build-backup",version:1,exportedAt:"2026-10-19T00:00:00Z",features:[{spec,data:featureData(spec.id)}]};
 const imported=validateSelfBuildBackup(backup);
 assert.equal(imported.features.length,1);
 assert.equal(importSelfBuildBackup(imported),1);
 const all=loadFeatures();
 assert.equal(all.length,2);
 assert.notEqual(all[0].id,all[1].id);
 assert.equal(featureData(all[1].id).records[0].values.item,"跑步");
 assert.throws(()=>validateSelfBuildBackup({kind:"unknown",version:1,features:[]}));
});

test("Explicit style instructions update local preference, but ordinary queries are not consumed",()=>{
 setup();
 assert.equal(applyExplicitToneRequest("請你之後回答更簡短一點")?.includes("精簡"),true);
 assert.ok(getToneProfile().detail<55);
 assert.equal(applyExplicitToneRequest("為什麼有時候回答比較長？"),null);
 assert.equal(applyExplicitToneRequest("之後不要太正式，口語自然一點")?.includes("自然"),true);
 assert.equal(applyExplicitToneRequest("之後回答詳細一點",true),null);
 assert.equal(applyExplicitToneRequest("以後請停止模仿我的語氣")?.includes("停用"),true);
 assert.equal(getToneProfile().enabled,false);
});

test("Self-Build upgrade diff highlights risky field deletions and type migrations",()=>{
 setup();
 const before=validateFeature({name:"家庭記帳",kind:"tracker",description:"收支紀錄",fields:[
  {id:"date",label:"日期",type:"date"},{id:"expense",label:"金額",type:"number"},{id:"note",label:"備註",type:"text"}]});
 const safe=validateFeature({name:"家庭收支",kind:"tracker",description:"收支紀錄",fields:[
  {id:"date",label:"日期",type:"date"},{id:"expense",label:"支出",type:"number"},{id:"note",label:"備註",type:"text"},
  {id:"category",label:"分類",type:"text"}]},before);
 const low=compareFeatureSpecs(before,safe);
 assert.equal(low.risk,false);
 assert.ok(low.changes.some(x=>x.label.includes("新增欄位")));
 const dangerous=validateFeature({name:"家庭收支",kind:"tracker",description:"收支紀錄",fields:[
  {id:"date",label:"日期",type:"text"},{id:"expense",label:"支出",type:"number"}]},before);
 const high=compareFeatureSpecs(before,dangerous);
 assert.equal(high.risk,true);
 assert.ok(high.changes.some(x=>x.label.includes("移除欄位")));
 assert.ok(high.changes.some(x=>x.label.includes("欄位型別")));
});
