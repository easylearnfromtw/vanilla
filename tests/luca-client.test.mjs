import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('LUCA local journal has strict metadata whitelist and limits',()=>{
 const src=load('src/luca/client-diagnostics.ts');
 assert.match(src,/MAX_EVENTS=120/);
 assert.match(src,/RETAIN_MS=30\*24\*60\*60\*1000/);
 assert.match(src,/VALID:Record<FaultComponent/);
 assert.match(src,/recordClientFault\(/);
 assert.match(src,/classifyClientFault\(/);
 assert.match(src,/currentChatMode\(\)==="private"/);
 assert.match(src,/signedChatAccount\(\)/);
 assert.doesNotMatch(src,/(?:sendBeacon|navigator\.sendBeacon|fetch\(|XMLHttpRequest|stack:|message:|headers:|prompt:|response:)/);
});
test('LUCA attaches to loading, generation and UI boundaries without raw logs',()=>{
 const chat=load('src/local-ai/LocalChat.tsx');
 const entry=load('src/main.tsx');
 const panel=load('src/luca/LucaPanel.tsx');
 assert.match(chat,/recordClientFault\("model","download",error\)/);
 assert.match(chat,/recordClientFault\("model","generation",error\)/);
 assert.match(chat,/recordClientFault\("model","fallback",fallbackError\)/);
 assert.match(entry,/installClientFaultListeners\(\)/);
 assert.match(entry,/recordClientFault\("ui","render",error\)/);
 assert.match(panel,/readClientFaults\(\)/);
 assert.match(panel,/downloadClientFaults\(\)/);
 assert.match(panel,/clearClientFaults\(\)/);
});
