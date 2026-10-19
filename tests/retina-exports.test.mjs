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
