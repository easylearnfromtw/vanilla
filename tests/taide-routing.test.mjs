import test from "node:test";
import assert from "node:assert/strict";
import {classifyTaiwanTopic,isTaideModel,preferTaideForTaiwan,taiwanEvidenceGuidance,isTaiwanTaideEnabled,setTaiwanTaideEnabled} from "../src/ai/taiwan-routing.ts";

test("Taiwan local, legal and historical subjects, excluding non-Taiwan jurisdictions",()=>{
 assert.equal(classifyTaiwanTopic("台灣地方政府的里長怎麼選？"),"local");
 assert.equal(classifyTaiwanTopic("依照勞基法加班費如何計算"),"law");
 assert.equal(classifyTaiwanTopic("台灣民法的租屋押金規定"),"law");
 assert.equal(classifyTaiwanTopic("臺灣日治時期霧社事件背景"),"history");
 assert.equal(classifyTaiwanTopic("介紹二二八事件"),"history");
 assert.equal(classifyTaiwanTopic("美國加州勞動法如何計算"),null);
 assert.equal(classifyTaiwanTopic("日本民法的繼承規定"),null);
 assert.equal(classifyTaiwanTopic("羅馬帝國歷史"),null);
 assert.equal(classifyTaiwanTopic("幫我 debug TypeScript"),null);
 assert.equal(classifyTaiwanTopic(""),null);
 assert.equal(classifyTaiwanTopic("比較日本和台灣的著作權法"),"law");
});
test("TAIDE preference never invents missing models or breaches candidate filters",()=>{
 const gemini={source:"gemini",model:"gemini-2.5-pro"};
 const taide={source:"ollama",model:"llama-3.1-taide:8b"};
 const local={source:"local",model:"qwen-0.5b"};
 assert.equal(isTaideModel("Gemma-3-TAIDE-12b-Chat-2602"),true);
 assert.equal(isTaideModel("qwen3:8b"),false);
 assert.deepEqual(preferTaideForTaiwan([gemini,local],"台灣健保的制度"),[gemini,local]);
 assert.deepEqual(preferTaideForTaiwan([gemini,taide,local],"刑法傷害罪"),[taide,gemini,local]);
 assert.deepEqual(preferTaideForTaiwan([gemini,taide],"日本刑法的規範"),[gemini,taide]);
 assert.deepEqual(preferTaideForTaiwan([gemini,taide],"台灣健保",false),[gemini,taide]);
 assert.deepEqual(preferTaideForTaiwan([local],"台灣勞基法"),[local]);
});
test("route switch defaults on, opt-out persists, and legal guidance discourages invented cites",()=>{
 const data=new Map();
 globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 globalThis.window={dispatchEvent:()=>true};
 assert.equal(isTaiwanTaideEnabled(),true);
 setTaiwanTaideEnabled(false);
 assert.equal(isTaiwanTaideEnabled(),false);
 setTaiwanTaideEnabled(true);
 assert.equal(isTaiwanTaideEnabled(),true);
 assert.match(taiwanEvidenceGuidance("law"),/law.moj.gov.tw/);
 assert.match(taiwanEvidenceGuidance("law"),/無法確認最新修法/);
 assert.match(taiwanEvidenceGuidance("history"),/國史館/);
});
