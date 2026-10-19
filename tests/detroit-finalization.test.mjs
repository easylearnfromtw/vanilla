import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {retinaParse,createRetinaDocument} from '../src/detroit/retina.ts';
import {bardValidate} from '../src/detroit/bard.ts';
import {athenaInspectBytes,inspectZipDirectory} from '../src/detroit/athena-quarantine.ts';
import {notificationEndpoint,enqueueChangeNotice,dispatchNotifications} from '../services/detroit-jobs/notifications.mjs';

test('Retina parses deliberate headings and bullets; does not execute HTML',()=>{
 const blocks=retinaParse('# 摘要\n資料來自驗證\n- 核對數字\n<script>alert(1)</script>');
 assert.deepEqual(blocks.map(b=>b.kind),['heading','paragraph','bullet','paragraph']);
 assert.equal(blocks[3].text,'<script>alert(1)</script>');
});
test('Retina DOCX creates editable OOXML document and escapes text',async()=>{
 const result=await createRetinaDocument({title:'醫學 & 商業',body:'# 摘要\n<資料> & 策略\n- 成長',format:'docx'});
 const zip=unzipSync(result.bytes),content=strFromU8(zip['word/document.xml']);
 assert.equal(result.mime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 assert.match(content,/醫學 &amp; 商業/);assert.match(content,/&lt;資料&gt;/);
 assert.ok(zip['word/styles.xml']&&zip['[Content_Types].xml']&&zip['_rels/.rels']);
});
test('Retina PPTX has slide layouts, master relationships and valid slide text',async()=>{
 const result=await createRetinaDocument({title:'業務規劃',body:'# A 階段\n- 重點1\n# B 階段\n- 重點2',format:'pptx'});
 const zip=unzipSync(result.bytes);
 assert.ok(zip['ppt/slides/slide1.xml']&&zip['ppt/slides/slide2.xml']);
 assert.ok(zip['ppt/slideMasters/slideMaster1.xml']&&zip['ppt/theme/theme1.xml']);
 assert.match(strFromU8(zip['ppt/presentation.xml']),/screen16x9/);
 assert.match(strFromU8(zip['ppt/slides/slide2.xml']),/B 階段/);
});
test('Retina rejects missing content and excessive input',async()=>{
 await assert.rejects(createRetinaDocument({title:'X',body:'',format:'docx'}));
 assert.throws(()=>retinaParse('a'.repeat(160001)));
});
test('Bard requires explicit API approval and blocks private-mode cloud upload',()=>{
 assert.throws(()=>bardValidate('draw a cat',{privateMode:true,approved:true,online:true}),/私密/);
 assert.throws(()=>bardValidate('draw a cat',{privateMode:false,approved:false,online:true}),/同意/);
 assert.throws(()=>bardValidate('draw a cat',{privateMode:false,approved:true,online:false}),/離線/);
 assert.equal(bardValidate('  draw a cat  ',{privateMode:false,approved:true,online:true}),'draw a cat');
});
test('Athena rejects PDF active content and masked executables',()=>{
 const pdf=strToU8('%PDF-1.7\n2 0 obj << /OpenAction 9 0 R /JavaScript >>');
 assert.equal(athenaInspectBytes('report.pdf','application/pdf',pdf)[0].level,'block');
 assert.equal(athenaInspectBytes('photo.png','image/png',strToU8('MZ executable'))[0].level,'block');
 const eicar=strToU8('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
 assert.equal(athenaInspectBytes('sample.txt','text/plain',eicar)[0].level,'block');
});
test('Athena inspects Office ZIP metadata without decompressing executable members',()=>{
 const safe=zipSync({'word/document.xml':strToU8('safe'),'[Content_Types].xml':strToU8('<Types/>')});
 assert.equal(athenaInspectBytes('safe.docx','application/octet-stream',safe).length,0);
 const evil=zipSync({'word/document.xml':strToU8('safe'),'word/vbaProject.bin':strToU8('macro')});
 assert.equal(inspectZipDirectory(evil,true)[0].level,'block');
 const traversal=zipSync({'word/document.xml':strToU8('safe'),'../a.js':strToU8('evil')});
 assert.equal(inspectZipDirectory(traversal,true)[0].level,'block');
});
test('Persistent notification URL is fixed to exact HTTPS host',()=>{
 assert.equal(notificationEndpoint({DETROIT_NOTIFY_HOST:'hooks.example.com',DETROIT_NOTIFY_WEBHOOK:'https://hooks.example.com/call'}),'https://hooks.example.com/call');
 assert.throws(()=>notificationEndpoint({DETROIT_NOTIFY_HOST:'hooks.example.com',DETROIT_NOTIFY_WEBHOOK:'https://hooks.example.com.evil.org/call'}),/pinned/);
 assert.throws(()=>notificationEndpoint({DETROIT_NOTIFY_HOST:'hooks.example.com',DETROIT_NOTIFY_WEBHOOK:'http://hooks.example.com/call'}));
 assert.equal(notificationEndpoint({}),null);
});
test('Persistent notification outbox records digest and delivers only metadata with HMAC',async()=>{
 const query=[];
 const db={prepare(sql){const stmt={bind(...v){query.push({sql,v});return stmt;},async run(){return {success:true};},async all(){return {results:[{id:12,job_id:'one',owner_id:'opaque-owner',target_url:'https://example.com/public',digest:'f'.repeat(64),created_at:44,attempts:0}]};}};return stmt;}};
 await enqueueChangeNotice(db,{id:'one',owner_id:'opaque-owner',target_url:'https://example.com/public'},'f'.repeat(64),44);
 const env={DETROIT_DB:db,DETROIT_NOTIFY_HOST:'notify.example.com',DETROIT_NOTIFY_WEBHOOK:'https://notify.example.com/hook',DETROIT_NOTIFY_SECRET:'s'.repeat(48)};
 let called=false;
 const result=await dispatchNotifications(env,55,async (url,opts)=>{called=true;assert.equal(url,env.DETROIT_NOTIFY_WEBHOOK);assert.match(opts.headers['x-detroit-signature'],/^sha256=[a-f0-9]{64}$/);assert.ok(!opts.body.includes('secret'));assert.ok(opts.body.includes('opaque-owner'));return new Response(null,{status:204});});
 assert.equal(called,true);assert.equal(result.delivered,1);assert.ok(query.some(q=>q.sql.includes('status=\'delivered\'')));
});