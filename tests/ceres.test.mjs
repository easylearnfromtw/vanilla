import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCeresEvent,validateCeresPlugin,ceresGate} from '../src/ceres/core.ts';
import {parseDianaInvocation,chooseDianaTool} from '../src/detroit/diana.ts';
import {DETROIT_ENGINES} from '../src/detroit/core.ts';
import {DETROIT_FACTORY_TOOLS} from '../src/detroit/factory.ts';
const sample={platform:'line',messageId:'m1',tenantId:'t1',senderId:'u1',conversationId:'c1',text:'你好'};
test('Ceres is registered but disabled by default',()=>{
 assert.equal(DETROIT_ENGINES.find(x=>x.id==='ceres')?.status,'adapter');
 assert.equal(DETROIT_FACTORY_TOOLS.find(x=>x.id==='ceres')?.enabledByDefault,false);
 assert.equal(parseDianaInvocation('@Ceres 設定')?.forcedTool,'ceres');
 assert.equal(chooseDianaTool('設定 Telegram Bot',{privateMode:false,hasCreamResult:false}).kind,'report');
});
test('Ceres messages cannot issue authority or execute',()=>{
 assert.deepEqual(normalizeCeresEvent(sample),{...sample,sourceTrust:'untrusted',executionAllowed:false});
 for(const bad of [{...sample,execute:true},{...sample,platform:'unknown'},{...sample,text:''},{...sample,text:'a'.repeat(4001)}])assert.throws(()=>normalizeCeresEvent(bad));
});
test('Ceres never loads executable plugin manifest',()=>{
 assert.equal(validateCeresPlugin({id:'weather-view',label:'Weather',description:'Info',capabilities:['read-events']}).enabled,false);
 assert.throws(()=>validateCeresPlugin({id:'unsafe',label:'Shell',description:'',capabilities:['run-shell']}));
 assert.throws(()=>validateCeresPlugin({id:'safe-view',label:'Safe',description:'',capabilities:['read-events'],enabled:true}));
});
test('Ceres opt-in gate stays manual review only',()=>{
 assert.equal(ceresGate({privateMode:true,gatewayEnabled:true,identityLinked:true,approved:true}),'blocked');
 assert.equal(ceresGate({privateMode:false,gatewayEnabled:true,identityLinked:false,approved:true}),'requires-identity');
 assert.equal(ceresGate({privateMode:false,gatewayEnabled:true,identityLinked:true,approved:false}),'requires-consent');
 assert.equal(ceresGate({privateMode:false,gatewayEnabled:true,identityLinked:true,approved:true}),'manual-review');
});
