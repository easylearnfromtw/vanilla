import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const file=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("LUCA quality events are strictly allowlisted, bounded and local-only",()=>{
 const src=file("src/luca/feedback-journal.ts");
 assert.match(src,/MAX_EVENTS=500/);
 assert.match(src,/RETAIN_MS=90\*24\*60\*60\*1000/);
 assert.match(src,/ACTIONS:readonly FeedbackAction\[\]=\["up","down","chosen"\]/);
 assert.match(src,/TASKS:readonly TaskKind\[\]/);
 assert.match(src,/PROVIDERS:readonly FeedbackProvider\[\]/);
 assert.match(src,/Array\.isArray\(items\)\?items\.filter\(valid\)/);
 assert.match(src,/privateMode\|\|currentChatMode\(\)==="private"/);
 assert.match(src,/if\(currentChatMode\(\)==="private"\)return \[\]/);
 assert.match(src,/signedChatAccount\(\)/);
 assert.match(src,/if\(!key\)return clean\(guest\)/);
 assert.doesNotMatch(src,/(?:navigator\.sendBeacon|sendBeacon\(|fetch\(|XMLHttpRequest|prompt:|response:|content:|model:|conversationId:)/);
});

test("feedback comes exclusively from explicit answer rating and comparison winner",()=>{
 const chat=file("src/local-ai/LocalChat.tsx");
 assert.match(chat,/import \{recordLucaFeedback\} from "\.\.\/luca\/feedback-journal"/);
 assert.match(chat,/recordLucaFeedback\("chosen",comparison\.task,chosen\.candidate\.source,privateMode\)/);
 assert.match(chat,/recordLucaFeedback\(liked\?"up":"down",task,answer\.source,privateMode\)/);
 assert.match(chat,/if\(!privateMode\)saveAnswerRating/);
 assert.match(chat,/if\(!privateMode\)saveModelChoice/);
 assert.match(chat,/if\(!privateMode\)saveAnswerRating[\s\S]*recordNoodles/);
});

test("LUCA quality panel has stats and manual export/delete, independent of NOODLES",()=>{
 const panel=file("src/luca/LucaPanel.tsx");
 const journal=file("src/luca/feedback-journal.ts");
 assert.match(panel,/aria-label="回答品質回饋紀錄"/);
 assert.match(panel,/feedbackStats\.totals\.up/);
 assert.match(panel,/feedbackStats\.totals\.down/);
 assert.match(panel,/feedbackStats\.totals\.chosen/);
 assert.match(panel,/downloadLucaFeedback\(\)/);
 assert.match(panel,/clearLucaFeedback\(\)/);
 assert.match(panel,/privateMode\?<p>私人模式不記錄、讀取或匯出回答品質回饋/);
 assert.match(journal,/localStorage\.removeItem\(key\)/);
 assert.doesNotMatch(journal,/resetNoodles|resetModelChoices|scheduleChatSync/i);
});
