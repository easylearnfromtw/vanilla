import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {janusPermission} from "../src/detroit/janus.ts";

test("Janus local generation is allowed without cloud approval, including private mode",()=>{
 assert.deepEqual(janusPermission("render-local",{privateMode:true,approved:false}).allow,true);
 assert.equal(janusPermission("render-local",{privateMode:true,approved:false}).mode,"local");
});
test("Janus hosted Unlayer editor requires consent and non-private mode",()=>{
 assert.equal(janusPermission("hosted-editor",{privateMode:false,approved:false}).allow,false);
 assert.equal(janusPermission("hosted-editor",{privateMode:true,approved:true}).allow,false);
 assert.equal(janusPermission("hosted-editor",{privateMode:false,approved:true}).mode,"external");
});
test("Janus never silently sends mail",()=>{
 assert.equal(janusPermission("send-email",{privateMode:false,approved:true}).allow,false);
});
test("Janus UI is registered in Detroit, while the legacy shortcut remains available",()=>{
 const studio=readFileSync(new URL("../src/detroit/DetroitStudio.tsx",import.meta.url),"utf8");
 const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
 const mail=readFileSync(new URL("../src/email/EmailStudio.tsx",import.meta.url),"utf8");
 assert.match(studio,/tab==='janus'/);
 assert.match(studio,/JanusStudio/);
 assert.match(app,/Janus 郵件設計/);
 assert.match(mail,/janusPermission\("hosted-editor"/);
 assert.match(mail,/currentChatMode\(\)==="private"/);
});
