import test from "node:test";
import assert from "node:assert/strict";
import {apply,oracle,parseAction,replay,scenarios,start,grade} from "../src/detroit/sandbox/core.ts";
import {challengePrompt,judgeHeadToHead,trainingFeedback} from "../src/detroit/sandbox/contest.ts";

const cases=scenarios();
const advance=(c,actions)=>actions.reduce((s,a)=>s.completed?s:apply(c,s,a),start(c));

test("both competitors receive identical initial prompts and exact context at every state",()=>{
 const c=cases[0],a=start(c),b=start(c);
 assert.equal(challengePrompt(c,a),challengePrompt(c,b));
 const after=apply(c,a,"inspect");
 assert.notEqual(challengePrompt(c,a),challengePrompt(c,after));
 assert.match(challengePrompt(c,after),/已讀取虛擬專案/);
});
test("comparison requires same scenario and cannot claim authenticated Claude identity",()=>{
 const c=cases[0];
 const a=advance(c,oracle(c)), b=advance(c,["inspect"]);
 const duel=judgeHeadToHead(c,a,b);
 assert.equal(duel.verdict,"left");
 assert.equal(duel.left.score,100);
 assert.match(duel.caveat,/無法驗證/);
 assert.throws(()=>judgeHeadToHead(c,a,start(cases[1])),/同一個沙盤/);
});
test("equal outcomes tie, no false wins after virtual fault",()=>{
 const c=cases.find(x=>x.fault==="upload-403");
 const actions=oracle(c);
 const duel=judgeHeadToHead(c,advance(c,actions),advance(c,actions));
 assert.equal(duel.verdict,"tie");
 assert.equal(duel.left.pass,true);
 assert.equal(duel.right.pass,true);
});
test("coach feedback reports blocked prerequisite and injected fault",()=>{
 const c=cases[0],g=grade(c,apply(c,start(c),"finalize"));
 assert.match(trainingFeedback(c,g),/順序/);
 const x=cases.find(y=>y.fault==="upload-403");
 const state=advance(x,["inspect","validate","export","upload"]);
 assert.match(trainingFeedback(x,grade(x,state)),/403/);
});
test("external JSON must remain within same strict allowlist",()=>{
 assert.equal(parseAction('{"tool":"inspect"}'),"inspect");
 assert.throws(()=>parseAction('{"tool":"send_email"}'),/未知|未授權/);
 const c=cases[0];
 assert.equal(replay(c,oracle(c)).pass,true);
});
