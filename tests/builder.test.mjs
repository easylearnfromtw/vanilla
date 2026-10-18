import test from "node:test";
import assert from "node:assert/strict";
import {validateFeature,featureTemplate,installFeature,loadFeatures,removeFeature,
 testExpression,proposalFromAI,featureData,writeFeatureData} from "../src/builder/feature-schema.ts";
import {getToneProfile,saveToneProfile,learnToneFromMessage,toneInstruction,toneFeedback,resetToneProfile} from "../src/ai/tone-adaptation.ts";

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
