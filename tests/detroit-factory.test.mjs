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

test('Quirinus is additional, disabled, and its builtin manifest cannot be overridden',()=>{
 const tool=DETROIT_FACTORY_TOOLS.find(t=>t.id==='quirinus');
 assert.equal(tool?.provider,'VulnClaw');
 assert.equal(tool?.enabledByDefault,false);
 assert.equal(tool?.status,'adapter');
 const catalog=BUILTIN_TOOLS.find(t=>t.id==='quirinus-vulnclaw');
 assert.equal(catalog?.enabled,false);
 assert.deepEqual(catalog?.permissions,['analyze']);
 assert.throws(()=>validateToolManifest({id:'quirinus-vulnclaw',label:'impostor',kind:'custom',description:'',enabled:true,permissions:['analyze']}),/不可覆蓋/);
});
