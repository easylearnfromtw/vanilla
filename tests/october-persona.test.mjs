import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {vanillaSystemPrompt,STRUCTURED_SYSTEM_PROMPT} from "../src/ai/prompts.ts";
import {isOctoberModel,OCTOBER_RUNTIME_CONTRACT,OCTOBER_COMPACT_CONTRACT} from "../src/ai/october-persona.ts";
import {prepareHumanization} from "../src/erya/humanize.ts";
import {venusPresentationGuidance} from "../src/venus/presentation.ts";

const file=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("October persona matches only explicit October Ollama models",()=>{
 for(const model of ["october:0.3","october:lite","OCTOBER:custom"])assert.equal(isOctoberModel(model),true,model);
 for(const model of ["qwen3:4b","gemini-3.8-flash","fake-october:0.3","october-notreal:4b","october:0.3 admin"])assert.equal(isOctoberModel(model),false,model);
});
test("October runtime keeps its manager decision and Detroit execution separate",()=>{
 const full=vanillaSystemPrompt({task:"analysis",compact:false,latestUserText:"分析公司財報",model:"october:0.3"});
 for(const token of ["阿土伯","再興中學","哈佛 MBA","上海光華管理學院","臺灣大學法律碩士","里長","立法委員","Victoria","Detroit","Verifier","Ceres","Self-Build"])assert.ok(full.includes(token),token);
 assert.match(full,/虛構/);
 assert.match(full,/不能把它們宣稱為真實/);
 assert.match(full,/不表示你有權替使用者做高風險/);
 assert.doesNotMatch(full,/你是 Vanilla，一個家庭專用/);
 assert.ok(full.length<6500,"persona should not waste entire model context");
});
test("Lite persona stays short and resists fabricated real-world credentials",()=>{
 const lite=vanillaSystemPrompt({task:"general",compact:true,latestUserText:"你好",model:"october:lite"});
 assert.match(lite,/October（阿土伯）/);
 assert.match(lite,/虛構/);
 assert.match(lite,/不能冒充真實證照/);
 assert.ok(lite.length<1250);
 assert.ok(OCTOBER_COMPACT_CONTRACT.length<OCTOBER_RUNTIME_CONTRACT.length);
});
test("Ordinary Vanilla and schema generation do not inherit October credentials",()=>{
 const plain=vanillaSystemPrompt({task:"analysis",compact:false,latestUserText:"分析",model:"qwen3:4b"});
 assert.match(plain,/你是 Vanilla/);
 assert.doesNotMatch(plain,/哈佛 MBA|臺灣律師證|里長/);
 const noModel=vanillaSystemPrompt({task:"general",compact:true,latestUserText:"你好"});
 assert.doesNotMatch(noModel,/阿土伯/);
 assert.doesNotMatch(STRUCTURED_SYSTEM_PROMPT,/阿土伯|維納斯|哈佛/);
});
test("Ollama selects the model-aware persona, not the generic family identity",()=>{
 const source=file("src/ai/ollama.ts");
 assert.match(source,/vanillaSystemPrompt\(\{task,compact:profile.compactPrompt,latestUserText:latest,model\}\)/);
});
test("Erya refines October's consultant voice without overwriting evidence",()=>{
 const task=prepareHumanization("潤稿：本季營收達 120 萬元，較上季增加 8%。");
 assert.ok(task);
 assert.match(task.guidance,/延續阿土伯成熟/);
 assert.match(task.guidance,/不滔滔不絕/);
 assert.match(task.guidance,/數值、日期、單位/);
});
test("Venus protects professional Bauhaus/iOS design and real chart evidence",()=>{
 const guide=venusPresentationGuidance("請繪製長期數據的趨勢圖表","analysis",false);
 for(const phrase of ["包豪斯","iOS","毛玻璃","專業圖表","資料來源","無障礙"])assert.ok(guide.includes(phrase),phrase);
 assert.doesNotMatch(guide,/沒有要求資料來源也可以捏造/);
 assert.equal(venusPresentationGuidance("你好","casual",false),"");
 const css=file("src/venus/presentation.css");
 assert.match(css,/Venus design system — Bauhaus/);
 assert.match(css,/backdrop-filter/);
 assert.match(css,/prefers-reduced-transparency/);
 assert.match(css,/prefers-color-scheme:dark/);
});
test("Ollama Modelfile backstory applies to normal and low-VRAM model configs",()=>{
 for(const path of ["training/october/Modelfile","training/october/Modelfile.lite"]){
  const model=file(path);
  assert.match(model,/阿土伯/);
  assert.match(model,/虛構/);
  assert.match(model,/Ceres/);
  assert.match(model,/Self-Build/);
  assert.doesNotMatch(model,/FROM october/);
 }
});
