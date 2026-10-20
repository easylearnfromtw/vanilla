import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {CERES_CHANNELS,validateCeresManifest} from "../src/ceres/registry.ts";
import {DETROIT_ENGINES} from "../src/detroit/core.ts";
import {DETROIT_FACTORY_TOOLS} from "../src/detroit/factory.ts";
import {BUILTIN_TOOLS,validateToolManifest} from "../src/weiguo/registry.ts";
import {parseDianaInvocation,chooseDianaTool,dianaCatalog} from "../src/detroit/diana.ts";

test("Ceres is a disabled native Detroit gateway, not an AstrBot runtime",()=>{
 assert.equal(DETROIT_ENGINES.find(x=>x.id==="ceres")?.status,"adapter");
 const factory=DETROIT_FACTORY_TOOLS.find(x=>x.id==="ceres");
 assert.equal(factory?.enabledByDefault,false);
 assert.match(factory?.provider||"",/Vanilla/);
 assert.equal(BUILTIN_TOOLS.find(x=>x.id==="ceres-telegram")?.enabled,false);
 assert.throws(()=>validateToolManifest({
  id:"ceres-telegram",label:"Overridden",kind:"custom",
  description:"",enabled:true,permissions:["read"]
 }),/不可覆蓋/);
 assert.deepEqual(CERES_CHANNELS.map(x=>x.status),["adapter","planned","planned"]);
});

test("Diana exposes Ceres UI but does not pretend a network gateway is deployed",()=>{
 assert.equal(parseDianaInvocation("@Ceres Telegram")?.forcedTool,"ceres");
 const decision=chooseDianaTool("Telegram bot", {privateMode:false,hasCreamResult:false},"ceres");
 assert.equal(decision.kind,"open");
 assert.equal(decision.tab,"ceres");
 assert.match(dianaCatalog(),/Ceres/);
});

test("Manifest is declarative and cannot include a URL, code, or execution permission",()=>{
 const valid=validateCeresManifest({id:"clinic-msg",label:"Clinic",channel:"telegram",enabled:false,permissions:["review","receive","receive"]});
 assert.deepEqual(valid.permissions,["review","receive"]);
 for(const extra of [{url:"https://example.com"},{code:"eval(1)"},{token:"secret"},{entrypoint:"script.js"}]){
  assert.throws(()=>validateCeresManifest({...valid,...extra}));
 }
 assert.throws(()=>validateCeresManifest({...valid,enabled:true}),/disabled/);
 assert.throws(()=>validateCeresManifest({...valid,permissions:["execute"]}),/Permissions/);
 assert.throws(()=>validateCeresManifest({...valid,id:"ceres-telegram"}),/reserved/);
});


test("Ceres PWA exposes family-only, opt-in reply and draft UI without bot credentials",()=>{
 const source=readFileSync(new URL("../src/ceres/CeresPanel.tsx",import.meta.url),"utf8");
 const api=readFileSync(new URL("../src/weiguo/api.ts",import.meta.url),"utf8");
 assert.match(source,/replyApproved/);
 assert.match(source,/draftApproved/);
 assert.match(source,/sendWeiGuoCeresReply/);
 assert.match(source,/whiteSpace:"pre-wrap"/);
 assert.match(api,/\/v1\/family\/ceres\/events/);
 assert.doesNotMatch(source,/CERES_TELEGRAM_BOT_TOKEN/);
});
