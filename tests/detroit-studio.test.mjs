import test from 'node:test';
import assert from 'node:assert/strict';
import {athenaInspectBytes,inspectZipDirectory} from '../src/detroit/athena-quarantine.ts';
import {bardValidate} from '../src/detroit/bard.ts';

const bin=(s)=>new TextEncoder().encode(s);
test('Athena blocks disguised PDF and EICAR signature',()=>{
 assert.equal(athenaInspectBytes('report.pdf','application/pdf',bin('MZ dangerous')).some(x=>x.level==='block'),true);
 assert.equal(athenaInspectBytes('x.txt','text/plain',bin('EICAR-STANDARD-ANTIVIRUS-TEST-FILE')).some(x=>x.level==='block'),true);
});
test('Athena blocks executable ZIP payload and corrupt central directory',()=>{
 assert.equal(inspectZipDirectory(bin('PK\x03\x04truncated'),false).some(x=>x.level==='block'),true);
 assert.equal(athenaInspectBytes('files.zip','application/zip',bin('PK\x03\x04fake')).some(x=>x.level==='block'),true);
});
test('Athena accepts simple correctly signed PNG',()=>{
 const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
 assert.deepEqual(athenaInspectBytes('a.png','image/png',png),[]);
});
test('Bard enforces explicit permission and private/offline constraints',()=>{
 assert.throws(()=>bardValidate('蒙德里安色塊設計',{privateMode:true,approved:true,online:true}),/私密/);
 assert.throws(()=>bardValidate('蒙德里安色塊設計',{privateMode:false,approved:false,online:true}),/同意/);
 assert.throws(()=>bardValidate('蒙德里安色塊設計',{privateMode:false,approved:true,online:false}),/離線/);
 assert.equal(bardValidate('  蒙德里安色塊設計  ',{privateMode:false,approved:true,online:true}),'蒙德里安色塊設計');
});
