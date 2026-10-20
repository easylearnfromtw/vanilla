import test from 'node:test';
import assert from 'node:assert/strict';
import {ORCHESTRA_TOOLS,orchestraPlan,creamOrchestraBrief,orchestraLocalAvailable} from '../src/orchestra/core.ts';
import {posterSvg,encodeIndexedGif} from '../src/orchestra/local-exports.ts';
import {creamLineSvg} from '../src/orchestra/cream-chart.ts';
import {validateOrchestraCapabilities,wordcraftConfigured,pdfcraftConfigured} from '../src/orchestra/capability-contract.ts';

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
 assert.equal(orchestraPlan({format:'svg'}).backend,'studio-local');
 assert.equal(orchestraPlan({format:'mp4'}).backend,'unavailable');
 assert.equal(orchestraPlan({format:'png',tool:'photocraft'}).backend,'studio-local');
 assert.equal(orchestraPlan({format:'gif',tool:'effectcraft'}).backend,'studio-local');
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

test('CREAM line chart generates safe, portable SVG without external assets',()=>{
 const svg=creamLineSvg({label:'成長 <script>alert(1)</script>',unit:'人',
  points:[{date:'2026-10-01',value:100},{date:'2026-10-10',value:150}]
 });
 assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
 assert.match(svg,/&lt;script&gt;/);assert.doesNotMatch(svg,/<script>/);
 assert.match(svg,/<path d="M/);
 assert.match(svg,/2026-10-10/);
 assert.throws(()=>creamLineSvg({label:'T',unit:'',points:[{date:'2026-10-01',value:1}]}),/至少需要兩筆/);
});
test('Orchestra supports genuine local SVG only with CREAM data',()=>{
 assert.equal(orchestraPlan({format:'svg',tool:'vectorcraft',creamChart:true}).backend,'cream-local');
 assert.equal(orchestraPlan({format:'svg',tool:'vectorcraft',creamChart:true}).steps.at(-1).engine,'cream');
});

test('authenticated capability data never grants unimplemented native engines',()=>{
 const unavailable=['wordcraft','deckcraft','vectorcraft','photocraft','pdfcraft','effectcraft','designcraft']
  .map(id=>({id,status:'unavailable',operations:[],outputFormats:[],runtimeVerified:false}));
 const payload={schemaVersion:1,execution:'family-gateway',engines:unavailable};
 assert.equal(wordcraftConfigured(validateOrchestraCapabilities(payload)),false);
 const valid={...payload,engines:[
  {...unavailable[0],status:'configured',operations:['convert-markdown'],outputFormats:['docx','pdf']},
  ...unavailable.slice(1)]};
 assert.equal(wordcraftConfigured(validateOrchestraCapabilities(valid)),true);
 assert.throws(()=>validateOrchestraCapabilities({...payload,engines:[...unavailable.slice(0,6),
  {...unavailable[6],id:'eval'}]}),/未授權/);
 assert.throws(()=>validateOrchestraCapabilities({...payload,engines:unavailable.map(e=>e.id==='deckcraft'?
  {...e,status:'configured',operations:['run-code'],outputFormats:['pptx']}:e)}),/未實作/);
 assert.throws(()=>validateOrchestraCapabilities({...valid,engines:valid.engines.map(e=>e.id==='wordcraft'?
  {...e,runtimeVerified:true}:e)}),/未支援/);
 assert.throws(()=>validateOrchestraCapabilities({...payload,engines:unavailable.map(e=>e.id==='pdfcraft'?
  {...e,operations:['delete-files']}:e)}),/不得宣告/);
});

test('PdfCraft combines only through reviewed fixed capability contract',()=>{
 const disabled=['wordcraft','deckcraft','vectorcraft','photocraft','pdfcraft','effectcraft','designcraft']
  .map(id=>({id,status:'unavailable',operations:[],outputFormats:[],runtimeVerified:false}));
 const record={schemaVersion:1,execution:'family-gateway',engines:disabled};
 assert.equal(pdfcraftConfigured(validateOrchestraCapabilities(record)),false);
 const enabled={...record,engines:disabled.map(e=>e.id==='pdfcraft'?
  {...e,status:'configured',operations:['combine-pdf'],outputFormats:['pdf']}:e)};
 assert.equal(pdfcraftConfigured(validateOrchestraCapabilities(enabled)),true);
 assert.equal(wordcraftConfigured(validateOrchestraCapabilities(enabled)),false);
 assert.throws(()=>validateOrchestraCapabilities({...record,engines:disabled.map(e=>e.id==='pdfcraft'?
  {...e,status:'configured',operations:['execute'],outputFormats:['pdf']}:e)}),/不符/);
 assert.throws(()=>validateOrchestraCapabilities({...record,engines:disabled.map(e=>e.id==='pdfcraft'?
  {...e,status:'configured',operations:['combine-pdf'],outputFormats:['docx']}:e)}),/不符/);
});

test('local media fallbacks cover all seven tool categories without representing native Craft',()=>{
 const routes=[['wordcraft','docx'],['deckcraft','pptx'],['vectorcraft','svg'],
  ['photocraft','jpeg'],['pdfcraft','pdf'],['effectcraft','gif'],['designcraft','png']];
 for(const [tool,format] of routes){
  const result=orchestraPlan({tool,format});
  assert.equal(result.canRunLocally,true,tool);
  assert.equal(result.steps.find(x=>x.id==='craft').status,'blocked',tool);
 }
 assert.equal(orchestraLocalAvailable('effectcraft','mp4'),false);
 assert.equal(orchestraPlan({format:'mp4'}).canRunLocally,false);
});
test('poster export is escaped and never includes raw HTML or remote assets',()=>{
 const svg=posterSvg({title:'T<script>alert(1)</script>',body:'<img src="https://evil.example/x"> & secret',
  kind:'publication',accent:'#fff url(http://evil.example)'});
 assert.match(svg,/&lt;script&gt;/);
 assert.match(svg,/&lt;img/);
 assert.doesNotMatch(svg,/<script>|<img|#fff url/);
 assert.match(svg,/<svg xmlns=/);
});
test('GIF encoder emits bounded animated GIF89a with trailer',()=>{
 const frames=[new Uint8Array(400).fill(4),new Uint8Array(400).fill(7)];
 const bytes=encodeIndexedGif(frames,20,20);
 assert.equal(new TextDecoder().decode(bytes.slice(0,6)),'GIF89a');
 assert.equal(bytes.at(-1),0x3B);
 assert.throws(()=>encodeIndexedGif(frames,900,200),/不合法/);
});

test('long headlines and body stay above the footer in every local graphic aspect ratio',()=>{
 for(const kind of ['slide','vector','publication']){
  const svg=posterSvg({title:'測試標題'.repeat(50),body:('正文內容 '*20+'\\n').repeat(40),kind});
  const height=kind==='slide'?720:kind==='publication'?1350:1080;
  const positions=Array.from(svg.matchAll(/<text[^>]* y="(\\d+)"/g),m=>Number(m[1]));
  assert.ok(positions.length>2,kind);
  assert.ok(positions.every(y=>y<=height-70),kind+' has a text line outside the safe canvas');
 }
});
