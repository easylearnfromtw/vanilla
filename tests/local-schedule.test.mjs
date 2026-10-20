import test from "node:test";
import assert from "node:assert/strict";
import {
 scheduleStorageKey,listLocalSchedule,addLocalSchedule,changeLocalSchedule,
 needsNotionSync,markLocalScheduleSynced,createMemorySchedule
} from "../src/notion/local-schedule.ts";
import {chooseDianaTool} from "../src/detroit/diana.ts";
import {proposeProactiveDiana} from "../src/detroit/diana-auto.ts";

function memoryStorage(){
 const map=new Map();
 return {getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value);},map};
}
const accountA="account:alice@example.com",accountB="account:bob@example.com";
const when="2026-11-01T09:00:00+08:00",next="2026-11-03T09:30:00+08:00";

test("Offline schedules are account-scoped and need no Notion, Google or network",()=>{
 const storage=memoryStorage();
 const task=addLocalSchedule(accountA,{title:"  Weekly review  ",when,details:"local-first"},storage);
 assert.equal(task.title,"Weekly review");
 assert.equal(task.when,"2026-11-01T01:00:00.000Z");
 assert.equal(listLocalSchedule(accountA,storage).length,1);
 assert.equal(listLocalSchedule(accountB,storage).length,0);
 assert.ok(storage.map.has(scheduleStorageKey(accountA)));
 assert.notEqual(scheduleStorageKey(accountA),scheduleStorageKey(accountB));
 assert.equal(needsNotionSync(task),true);
});
test("Editing locally keeps the task when cloud is unavailable",()=>{
 const storage=memoryStorage();
 const created=addLocalSchedule(accountA,{title:"Clinical lecture",when},storage);
 const changed=changeLocalSchedule(accountA,created.id,{when:next},storage);
 assert.equal(changed.when,"2026-11-03T01:30:00.000Z");
 const done=changeLocalSchedule(accountA,created.id,{done:true},storage);
 assert.equal(done.done,true);
 assert.equal(listLocalSchedule(accountA,storage).length,1);
 assert.throws(()=>changeLocalSchedule(accountB,created.id,{done:true},storage),/找不到/);
});
test("Cloud sync marker updates only the matching local item and revision",()=>{
 const storage=memoryStorage();
 const task=addLocalSchedule(accountA,{title:"Brand planning",when},storage);
 const cloudId="315966e0-d6f7-4fbe-9ff9-50dd765bb50d";
 const synced=markLocalScheduleSynced(accountA,task.id,task.updatedAt,cloudId,storage);
 assert.equal(synced.notionPageId,cloudId);
 assert.equal(needsNotionSync(synced),false);
 const revised=changeLocalSchedule(accountA,task.id,{done:true},storage);
 assert.equal(needsNotionSync(revised),true);
 const oldRevision=markLocalScheduleSynced(accountA,task.id,task.updatedAt,cloudId,storage);
 assert.equal(needsNotionSync(oldRevision),true);
 assert.throws(()=>markLocalScheduleSynced(accountB,task.id,task.updatedAt,cloudId,storage),/不存在/);
});
test("Private-memory schedules never touch device storage",()=>{
 const privateOnly=createMemorySchedule();
 const item=privateOnly.add(accountA,{title:"Sensitive private draft",when});
 assert.equal(privateOnly.list(accountA).length,1);
 assert.equal(privateOnly.list(accountB).length,0);
 assert.equal(privateOnly.change(accountA,item.id,{done:true}).done,true);
 assert.equal(createMemorySchedule().list(accountA).length,0);
});
test("Corrupted local records fail closed rather than overwriting data",()=>{
 const storage=memoryStorage();
 const key=scheduleStorageKey(accountA);
 storage.setItem(key,"{invalid-json");
 assert.throws(()=>addLocalSchedule(accountA,{title:"Work",when},storage),/未覆寫/);
 assert.equal(storage.getItem(key),"{invalid-json");
});
test("Diana selects the offline schedule workspace without requiring Notion online",()=>{
 const offline={privateMode:false,online:false,hasCreamResult:false};
 const task=chooseDianaTool("新增待辦任務：準備簡報",offline);
 assert.equal(task.tool,"notion");
 assert.equal(task.kind,"open");
 assert.equal(task.tab,"notion");
 assert.equal(proposeProactiveDiana("新增待辦任務：準備簡報",offline)?.tab,"notion");
 assert.equal(proposeProactiveDiana("新增待辦任務：準備簡報",{...offline,privateMode:true})?.tab,"notion");
 assert.equal(chooseDianaTool("安排日程規劃",offline).tab,"notion");
});
