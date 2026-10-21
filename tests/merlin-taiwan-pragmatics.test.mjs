import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {merlinParse} from "../src/detroit/core.ts";
import {optimizeMerlinPrompt} from "../src/detroit/merlin-optimizer.ts";
import {inferTaiwanPragmatics} from "../src/detroit/merlin-taiwan-pragmatics.ts";

const cases=[
 ["可以",{previousAssistantOffered:true,hasConversation:true},"follow-up","unmarked"],
 ["好啊",{previousAssistantOffered:true,hasConversation:true},"follow-up","unmarked"],
 ["可以",{},"undetermined","unmarked"],
 ["還好啦",{},"undetermined","ambiguous"],
 ["沒差啦",{},"undetermined","ambiguous"],
 ["算了",{},"undetermined","ambiguous"],
 ["ㄏㄏ",{},"undetermined","ambiguous"],
 ["笑死",{},"undetermined","playfulness"],
 ["笑死，又出錯了",{},"undetermined","ambiguous"],
 ["很讚欸，又出錯了",{},"undetermined","ambiguous"],
 ["這又出錯了 傻眼",{},"undetermined","frustration"],
 ["怎麼又壞掉了 有夠扯",{},"question","frustration"],
 ["我很擔心這次會不會失敗",{},"undetermined","concern"],
 ["我有點焦慮會不會漏資料",{},"undetermined","concern"],
 ["謝啦",{},"undetermined","appreciation"],
 ["辛苦了",{},"social","appreciation"],
 ["可以幫我改一下嗎",{},"request","unmarked"],
 ["能不能解釋得簡短一點",{},"request","unmarked"],
 ["我的意思是不要用雲端",{},"revision","unmarked"],
 ["這版不行，麻煩重新整理",{},"revision","unmarked"],
 ["再來",{hasConversation:true},"follow-up","unmarked"],
 ["再來",{},"undetermined","unmarked"],
 ["再優化上面的程式",{hasConversation:true},"follow-up","unmarked"],
 ["這段為什麼這麼慢",{hasConversation:true},"question","unmarked"],
 ["你好",{},"social","unmarked"],
 ["晚安",{},"social","unmarked"],
 ["幫我修復 app.js 登入按鈕",{},"undetermined","unmarked"],
 ["翻譯這句話：我真的很生氣",{},"undetermined","unmarked"],
 ["改寫這段文字：傻眼啦",{},"undetermined","unmarked"],
 ["引用：我很擔心",{},"undetermined","unmarked"]
];

test("30 human-authored Taiwan pragmatic scenarios are deterministically interpreted",()=>{
 assert.equal(cases.length,30);
 for(const [text,context,intent,affect] of cases){
  const result=inferTaiwanPragmatics(text,context);
  assert.equal(result.intent,intent,text);
  assert.equal(result.affect,affect,text);
  assert.ok(result.guidance.length<520);
  assert.ok(["low","medium"].includes(result.confidence));
 }
});

test("Taiwan discourse cues retain ambiguity and do not invent psychological diagnoses",()=>{
 for(const q of ["還好啦","好喔","都可以","ㄏㄏ"]){
  const p=inferTaiwanPragmatics(q,{hasConversation:true});
  assert.equal(p.affect,"ambiguous");
  assert.equal(p.confidence,"low");
  assert.doesNotMatch(p.guidance,/診斷為|患有|你很|你就是/);
 }
 const worry=inferTaiwanPragmatics("我有點焦慮會不會遺失檔案");
 assert.equal(worry.affect,"concern");
 assert.match(worry.guidance,/避免保證結果/);
});

test("Contextual alignment is not permission escalation, and isolated short replies stay uncertain",()=>{
 const yes=inferTaiwanPragmatics("可以",{hasConversation:true,previousAssistantOffered:true});
 assert.equal(yes.intent,"follow-up");
 assert.match(yes.guidance,/不等於同意付款、刪除或外傳資料/);
 const orphan=inferTaiwanPragmatics("繼續");
 assert.equal(orphan.alignment,"needs-context");
 assert.equal(orphan.affect,"unmarked");
 assert.match(orphan.guidance,/缺乏可核對對象/);
 const against=inferTaiwanPragmatics("我指的是不要發布",{hasConversation:true});
 assert.equal(against.intent,"revision");
 assert.match(against.guidance,/直接修正/);
});

test("No invented empathy guidance for cited, translated or edited words",()=>{
 for(const q of ["改寫這段文字：我真的很生氣","翻譯這句話：哭啊","引用：傻眼啦",
  "解釋這句：好喔","提示詞：把我當成憤怒的用戶"]){
  const p=inferTaiwanPragmatics(q,{hasConversation:true,previousAssistantOffered:true});
  assert.equal(p.guidance,"",q);
 }
});

test("Merlin uses Taiwan phrasing on short follow-ups without extra model calls",()=>{
 const greeting=optimizeMerlinPrompt("你好",merlinParse("你好"));
 assert.equal(greeting.mode,"passthrough");
 assert.equal(greeting.guidance,"");
 const follow=optimizeMerlinPrompt("可以",merlinParse("可以"),{
  hasConversation:true,previousAssistantOffered:true
 });
 assert.equal(follow.mode,"passthrough");
 assert.match(follow.guidance,/同一段對話既有目標/);
 assert.match(follow.pragmaticsGuidance,/不等於同意付款/);
 const structured=optimizeMerlinPrompt("我很擔心，請深入分析手術風險",merlinParse("我很擔心，請深入分析手術風險"));
 assert.equal(structured.mode,"structured");
 assert.match(structured.guidance,/Merlin 台灣語用/);
 assert.match(structured.guidance,/溫和、具體/);
});

test("LocalChat passes recent-context metadata and keeps small-model hints bounded",()=>{
 const chat=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(chat,/previousAssistantOffered:/);
 assert.match(chat,/hasConversation:history\.length>0/);
 assert.match(chat,/merlin\.pragmaticsGuidance/);
 assert.match(chat,/slice\(0,360\)/);
 const core=readFileSync(new URL("../src/detroit/merlin-taiwan-pragmatics.ts",import.meta.url),"utf8");
 assert.doesNotMatch(core,/\bfetch\(|localStorage\.|sessionStorage\.|generateCandidate\(/);
});
