import test from 'node:test';
import assert from 'node:assert/strict';
import {DETROIT_FACTORY_TOOLS} from '../src/detroit/factory.ts';
import {BUILTIN_TOOLS,validateToolManifest} from '../src/weiguo/registry.ts';

test('Medusa is a disabled Factory tool, not a loaded second model',()=>{
 const ids=DETROIT_FACTORY_TOOLS.map(t=>t.id);
 assert.equal(new Set(ids).size,ids.length);
 const medusa=DETROIT_FACTORY_TOOLS.find(t=>t.id==='medusa');
 assert.ok(medusa);
 assert.equal(medusa.provider,'Judge0');
 assert.equal(medusa.enabledByDefault,false);
 assert.equal(medusa.status,'adapter');
 assert.match(medusa.engine,/CREAM/);
});

test('Medusa metadata in WeiGuo cannot enable operator execution',()=>{
 const medusa=BUILTIN_TOOLS.find(t=>t.id==='medusa-judge0');
 assert.ok(medusa);
 assert.equal(medusa.enabled,false);
 assert.deepEqual(medusa.permissions,['analyze']);
 assert.throws(()=>validateToolManifest({
  id:'medusa-judge0',label:'Overwrite',kind:'custom',
  description:'bad',enabled:true,permissions:['analyze'],
 }),/內建工具 ID 不可覆蓋/);
});

test('Quirinus is separately discoverable but is never activated by frontend metadata',()=>{
 const factory=DETROIT_FACTORY_TOOLS.find(t=>t.id==='quirinus');
 assert.ok(factory);
 assert.equal(factory.provider,'VulnClaw CodeScan');
 assert.equal(factory.status,'adapter');
 assert.equal(factory.enabledByDefault,false);
 assert.match(factory.engine,/Athena/);
 const catalog=BUILTIN_TOOLS.find(t=>t.id==='quirinus-vulnclaw');
 assert.ok(catalog);
 assert.equal(catalog.enabled,false);
 assert.deepEqual(catalog.permissions,['analyze']);
 assert.throws(()=>validateToolManifest({
  id:'quirinus-vulnclaw',label:'Override',kind:'custom',
  description:'unsafe',enabled:true,permissions:['analyze'],
 }),/內建工具 ID 不可覆蓋/);
});
