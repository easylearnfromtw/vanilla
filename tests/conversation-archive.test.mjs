import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {archiveConversation,listConversations,takeConversation,memoryArchiveStore,summarizeConversation,MAX_ARCHIVED} from "../src/library/conversation-archive.ts";

const turns=(q,a)=>[{role:"user",content:q,createdAt:1},{role:"assistant",content:a,createdAt:2}];

test("new conversation archives instead of deleting, scoped per account and mode",async()=>{
 const store=memoryArchiveStore();
 const a=await archiveConversation(store,"account:dad@example.test","normal",turns("幫我規劃週末行程","可以去陽明山…"));
 await archiveConversation(store,"account:mom@example.test","normal",turns("晚餐吃什麼","咖哩飯"));
 await archiveConversation(store,"account:dad@example.test","private",turns("私密問題","私密回答"));
 const dad=await listConversations(store,"account:dad@example.test","normal");
 assert.equal(dad.length,1);
 assert.equal(dad[0].title,"規劃週末行程");
 assert.equal("turns" in dad[0],false,"list returns summaries only");
 assert.equal((await listConversations(store,"account:dad@example.test","private")).length,1);
 await assert.rejects(()=>takeConversation(store,a.id,"account:mom@example.test"),/其他帳號/);
 const restored=await takeConversation(store,a.id,"account:dad@example.test");
 assert.equal(restored.turns.length,2);
 assert.equal((await listConversations(store,"account:dad@example.test","normal")).length,0);
});

test("empty or assistant-only histories are not archived; the archive is capped",async()=>{
 const store=memoryArchiveStore();
 assert.equal(await archiveConversation(store,"o","normal",[]),null);
 assert.equal(await archiveConversation(store,"o","normal",[{role:"assistant",content:"hi"}]),null);
 for(let i=0;i<MAX_ARCHIVED+5;i++)await archiveConversation(store,"o","normal",turns("問題 "+i,"答 "+i),1000+i);
 const list=await listConversations(store,"o","normal");
 assert.equal(list.length,MAX_ARCHIVED);
 assert.equal(list[0].title,"問題 "+(MAX_ARCHIVED+4),"newest first");
});

test("summaries strip markdown and keep titles short",()=>{
 const s=summarizeConversation([{role:"user",content:"請   幫我整理這份很長很長很長很長很長很長很長很長很長很長很長很長的會議紀錄"},{role:"assistant",content:"## 重點\n* **第一**"}]);
 assert.ok(s.title.length<=38);
 assert.doesNotMatch(s.preview,/[#*]/);
});

test("sidebar new chat no longer wipes history directly; chat sync honours intentional resets",()=>{
 const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
 const session=readFileSync(new URL("../src/local-ai/chat-session.ts",import.meta.url),"utf8");
 const sync=readFileSync(new URL("../src/vault/chat-sync.ts",import.meta.url),"utf8");
 assert.doesNotMatch(app,/localStorage\.removeItem\(chatStorageKey/);
 assert.match(app,/startNewConversation\(\)/);
 assert.match(session,/archiveConversation\(store,owner\(\),mode,turns\)/);
 assert.match(session,/if\(error\)return \{archived:false,error\}/,"never clear when archiving failed");
 assert.match(sync,/markChatSyncReset/);
 assert.match(sync,/resetPending\(\)&&\(!newest\|\|ownNewest\)/,"only this device's own snapshot may be overwritten");
});
