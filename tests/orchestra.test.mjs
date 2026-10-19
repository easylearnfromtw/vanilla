import test from 'node:test';
import assert from 'node:assert/strict';
import {ORCHESTRA_TOOLS,orchestraPlan,creamOrchestraBrief} from '../src/orchestra/core.ts';

test('seven native tool adapters registered with unique ids and authoritative upstream URLs',()=>{
 assert.equal(ORCHESTRA_TOOLS.length,7);
 assert.equal(new Set(ORCHESTRA_TOOLS.map(x=>x.id)).size,7);
 assert.ok(ORCHESTRA_TOOLS.every(x=>x.upstream.startsWith('https://github.com/storytold/')));
 assert.ok(ORCHESTRA_TOOLS.every(x=>x.requiresBackend&&x.status==='optional'));
});
test('Retina fallback and unavailable media formats must be explicit',()=>{
 const doc=orchestraPlan({format:'docx'});
 assert.equal(doc.tool,'wordcraft');assert.equal(doc.backend,'retina-local');
 assert.equal(doc.modelCalls,0);
 assert.equal(doc.steps.find(x=>x.id==='craft').status,'blocked');
 assert.equal(orchestraPlan({format:'pptx'}).tool,'deckcraft');
 assert.equal(orchestraPlan({format:'svg'}).backend,'unavailable');
 assert.equal(orchestraPlan({format:'mp4'}).backend,'unavailable');
});
test('remote WordCraft requires a specific verified opt-in and cannot serve private mode',()=>{
 assert.equal(orchestraPlan({format:'docx',tool:'wordcraft',remoteAvailable:true}).backend,'craft-backend');
 assert.equal(orchestraPlan({format:'docx',tool:'wordcraft',remoteAvailable:true,privateMode:true}).backend,'retina-local');
 assert.equal(orchestraPlan({format:'pptx',remoteAvailable:true}).backend,'retina-local');
});
test('reject unsupported tool and output combinations',()=>{
 assert.throws(()=>orchestraPlan({format:'mp4',tool:'wordcraft'}),/不支援/);
});
test('CREAM handoff preserves statistics and limitations without inventing measurements',()=>{
 const body=creamOrchestraBrief({
  metric:'網站流量',unit:'人',latest:120,change:20,firstDate:'2026-10-01',
  lastDate:'2026-10-15',uniqueDates:2,count:2,insights:['變化趨勢'],
  quality:['觀測時間短'],recommendations:['繼續追蹤']
 });
 assert.match(body,/120.00/);assert.match(body,/2026-10-15/);
 assert.match(body,/觀測時間短/);assert.match(body,/繼續追蹤/);
});
