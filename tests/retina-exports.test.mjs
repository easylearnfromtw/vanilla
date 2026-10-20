import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {createRetinaDocument,retinaParse} from '../src/detroit/retina.ts';

const sample='# 章節一\n第一段敘述 & 特殊符號 < >，中英文混用。\n- 量測結果：15.3\n## 小節\n後續建議。';
test('Retina deterministic parser respects headings, lists and size ceiling',()=>{
 assert.deepEqual(retinaParse('# 摘要\n正文\n- 資料源'),[{kind:'heading',text:'摘要'},{kind:'paragraph',text:'正文'},{kind:'bullet',text:'資料源'}]);
 assert.throws(()=>retinaParse('文'.repeat(160001)),/160,000/);
});
test('Retina DOCX is a valid zipped package with escaped, editable Chinese text',async()=>{
 const doc=await createRetinaDocument({title:'測試報告',body:sample,format:'docx'});
 assert.equal(doc.mime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
 const files=unzipSync(doc.bytes);
 for(const name of ['[Content_Types].xml','word/document.xml','word/styles.xml','_rels/.rels'])assert.ok(files[name],name);
 const text=strFromU8(files['word/document.xml']);
 assert.match(text,/測試報告/);assert.match(text,/第一段敘述 &amp; 特殊符號 &lt; &gt;/);
 assert.match(text,/<w:p>/);
});
test('Retina PPTX has editable slide XML, master, theme and relationships',async()=>{
 const out=await createRetinaDocument({title:'簡報',body:sample,format:'pptx'});
 assert.equal(out.mime,'application/vnd.openxmlformats-officedocument.presentationml.presentation');
 const files=unzipSync(out.bytes);
 for(const name of ['[Content_Types].xml','ppt/presentation.xml','ppt/slides/slide1.xml','ppt/slideMasters/slideMaster1.xml','ppt/theme/theme1.xml'])assert.ok(files[name],name);
 assert.match(strFromU8(files['ppt/slides/slide1.xml']),/<p:sp>/);
 assert.match(strFromU8(files['ppt/slides/slide1.xml']),/章節一/);
});

import {isRetinaImageFile,retinaImageType,retinaUnavailableMessage,RETINA_MAX_IMAGE_BYTES} from '../src/detroit/retina-vision.ts';
import {merlinParse} from '../src/detroit/core.ts';
import {readFileSync} from 'node:fs';

test('Retina accepts image attachments, including iPhone HEIC without MIME metadata',()=>{
 assert.equal(isRetinaImageFile({name:'IMG_001.HEIC',type:''}),true);
 assert.equal(isRetinaImageFile({name:'attack.svg',type:'image/svg+xml'}),true);
 assert.equal(isRetinaImageFile({name:'notes.pdf',type:'application/pdf'}),false);
 assert.deepEqual(retinaImageType({name:'IMG_001.HEIC',type:'',size:1024}),{mimeType:'image/heic',convert:true});
 assert.deepEqual(retinaImageType({name:'image.png',type:'image/png',size:1024}),{mimeType:'image/png',convert:false});
 assert.throws(()=>retinaImageType({name:'empty.png',type:'image/png',size:0}),/空白/);
 assert.throws(()=>retinaImageType({name:'oversize.jpg',type:'image/jpeg',size:RETINA_MAX_IMAGE_BYTES+1}),/8 MB/);
 assert.throws(()=>retinaImageType({name:'attack.svg',type:'image/svg+xml',size:123}),/尚未支援/);
});
test('Retina refuses to disguise unavailable image models as textual image recognition',()=>{
 assert.match(retinaUnavailableMessage({privateMode:true,localOnly:true,online:true,geminiConfigured:true,cloudAllowed:true}),/私密/);
 assert.match(retinaUnavailableMessage({privateMode:false,localOnly:false,online:true,geminiConfigured:false,cloudAllowed:false}),/Gemini/);
 assert.match(retinaUnavailableMessage({privateMode:false,localOnly:false,online:false,geminiConfigured:true,cloudAllowed:true}),/離線/);
 assert.match(retinaUnavailableMessage({privateMode:false,localOnly:false,online:true,geminiConfigured:true,cloudAllowed:false}),/授權|同意/);
});
test('Image conversations include a real Retina execution stage and bypass text-only tool intercepts',()=>{
 const plan=merlinParse('這張圖片有哪些文字？',{image:true});
 assert.notEqual(plan.depth,'quick');
 assert.equal(plan.stages.filter(x=>x.engine==='retina').length,1);
 const chat=readFileSync(new URL('../src/local-ai/LocalChat.tsx',import.meta.url),'utf8');
 assert.match(chat,/const route=image\?\(\{kind:"continue"\}/);
 assert.match(chat,/const alternative=!image&&automatic/);
 assert.match(chat,/readRetinaVisionImage\(file\)/);
 assert.match(chat,/retinaUnavailableMessage/);
});
