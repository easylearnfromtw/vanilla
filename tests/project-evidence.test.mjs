import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {projectEvidenceScope,projectEvidenceQuery,projectActionWithoutAdapter,projectNeedsVerifiedEvidence,projectEvidenceUnavailable} from "../src/projects/project-evidence.ts";

test("CITMUS typo maps to the same verified CITYMUS repository",()=>{
 for(const word of ["CITMUS隨即選一首歌","CITYMUS 隨機選歌","citymusic","musiccity"]){
  const scope=projectEvidenceScope(word);
  assert.ok(scope,word);
  assert.deepEqual(scope.repositories,["easylearnfromtw/citymusic"],word);
  assert.match(projectEvidenceQuery(word,scope),/citymusic/i);
 }
});

test("SignWell Chinese names stay scoped and generic brand does not silently choose a division",()=>{
 assert.deepEqual(projectEvidenceScope("欣緯生醫有哪些文章")?.repositories,["easylearnfromtw/signwellbio"]);
 assert.deepEqual(projectEvidenceScope("欣緯科技目前版本")?.repositories,["easylearnfromtw/signwelltec"]);
 assert.deepEqual(projectEvidenceScope("Signwellsoft 的功能")?.repositories,["easylearnfromtw/Signwellsoft"]);
 assert.equal(projectEvidenceScope("欣緯的專案")?.repositories.length,3);
 assert.equal(projectEvidenceScope("CITYMUS 和欣緯生醫的差異")?.repositories.length,2);
 assert.equal(projectEvidenceScope("今天天氣怎樣"),null);
});

test("random song request cannot be passed to the language model as if the action ran",()=>{
 const refused=projectActionWithoutAdapter("CITMUS隨即選一首歌");
 assert.match(refused||"",/沒有經過驗證的曲庫資料/);
 assert.match(refused||"",/無法真正隨機選出/);
 assert.equal(projectActionWithoutAdapter("介紹 CITMUS 隨機選歌怎麼實作"),null);
 assert.equal(projectActionWithoutAdapter("我想設計欣緯生醫首頁"),null);
});

test("verified evidence is required for current project facts, not for creative requests",()=>{
 assert.equal(projectNeedsVerifiedEvidence("欣緯生醫有哪些文章？"),true);
 assert.equal(projectNeedsVerifiedEvidence("介紹CITYMUS現有功能"),true);
 assert.equal(projectNeedsVerifiedEvidence("幫我設計欣緯生醫的新首頁"),false);
 assert.match(projectEvidenceUnavailable(projectEvidenceScope("欣緯生醫"),true),/沒有找到相關索引/);
 assert.match(projectEvidenceUnavailable(projectEvidenceScope("欣緯生醫"),false),/已關閉/);
});

test("chat checks action guard and named-project index before invoking the model",()=>{
 const src=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(src,/projectActionWithoutAdapter\(question\)/);
 assert.match(src,/projectEvidenceQuery\(question,projectScope\)/);
 assert.match(src,/projectEvidenceUnavailable\(projectScope,contextPrefs.project\)/);
 assert.match(src,/priority:projectScope\?1:3/);
});
