import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('LUCA visible in Detroit and no browser admin key',()=>{
 const studio=load('src/detroit/DetroitStudio.tsx');
 const panel=load('src/luca/LucaPanel.tsx');
 assert.match(studio,/LUCA 監控/);
 assert.match(studio,/LucaPanel/);
 assert.match(panel,/privateMode/);
 assert.doesNotMatch(panel,/WEIGUO_ADMIN_TOKEN/);
});
test('LUCA summary requires owner session',()=>{
 const client=load('src/weiguo/api.ts');
 const backend=load('services/weiguo/app.py');
 assert.match(client,/identity.role!=="owner"/);
 assert.match(backend,/user.role != "owner"/);
 assert.match(backend,/Cache-Control.*private, no-store/);
 assert.match(backend,/luca_record_http/);
});
test('LUCA cloud sending hard-disabled and input templates controlled',()=>{
 const luca=load('services/weiguo/luca.py');
 assert.match(luca,/send_to_logfire=False/);
 assert.match(luca,/inspect_arguments=False/);
 assert.match(luca,/_ROUTES/);
 assert.match(luca,/if operation == "other"/);
});
