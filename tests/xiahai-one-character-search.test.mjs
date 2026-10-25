import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseKnowledgeLookup} from '../src/knowledge/chat-source-lookup.ts';
import {searchOpenAlexWorks} from '../src/search/scholarly-discovery.ts';
import {retrieveXiahaiEvidence,parseXiahaiEvidenceQuestion,scoreXiahaiPassage} from '../src/academy/xiahai-evidence.ts';

const dir=resolve('public/evidence/xiahai-1000');
function fixture(name){return JSON.parse(readFileSync(resolve(dir,name),'utf8'));}

test('one Chinese character is sufficient for explicit research / news / book search routing',()=>{
 assert.deepEqual(parseKnowledgeLookup('霞海書院：癌'),{kind:'paper',query:'癌'});
 assert.deepEqual(parseKnowledgeLookup('柳岸書城：書'),{kind:'book',query:'書'});
 assert.deepEqual(parseKnowledgeLookup('藍星報社：日'),{kind:'news',query:'日'});
 assert.equal(parseXiahaiEvidenceQuestion('霞海全文 癌'),'癌');
 assert.equal(parseXiahaiEvidenceQuestion('霞海論文問答 心'),'心');
 assert.equal(parseXiahaiEvidenceQuestion('霞海全文 '),null);
 assert.equal(parseKnowledgeLookup('霞海書院：'),null);
});

test('OpenAlex actually sends one-character search to official provider, not only unlocking the button',async()=>{
 const old=globalThis.fetch;
 let urls=[];
 globalThis.fetch=async target=>{
  urls.push(new URL(String(target)));
  return {ok:true,headers:new Headers({'content-type':'application/json'}),text:async()=>JSON.stringify({results:[]})};
 };
 try{
  assert.deepEqual(await searchOpenAlexWorks('癌',8),[]);
  assert.deepEqual(await searchOpenAlexWorks('a',8),[]);
  assert.equal(urls.length,2);
  assert.ok(urls.every(url=>url.hostname==='api.openalex.org'));
  assert.equal(urls[0].searchParams.get('search'),'癌');
  assert.equal(urls[1].searchParams.get('search'),'a');
  await assert.rejects(searchOpenAlexWorks('  ',8),/至少需要一個字/);
  assert.equal(urls.length,2,'blank input must not reach provider');
 }finally{globalThis.fetch=old;}
});

test('one Han character retrieves actual published matching fulltext excerpts; no invented quote',async()=>{
 const previous=globalThis.fetch;
 const visited=[];
 globalThis.fetch=async request=>{
  const url=new URL(String(request),'https://example.invalid/');
  assert.equal(url.origin,'https://example.invalid');
  const file=url.pathname.split('/').pop();
  assert.match(file,/^(manifest|shard-\d{2})\.json$/);
  visited.push(file);
  return {ok:true,headers:new Headers(),text:async()=>JSON.stringify(fixture(file))};
 };
 try{
  const hits=await retrieveXiahaiEvidence('癌');
  assert.ok(hits.length>=1,'single character 癌 should match real CC licensed cancer excerpts');
  for(const hit of hits){
   assert.ok(hit.paper.source_url.startsWith('https://pmc.ncbi.nlm.nih.gov/articles/PMC'));
   assert.equal(hit.paper.license,'cc-by-4.0');
   assert.ok(hit.matched_terms.includes('cancer'));
   assert.ok(hit.passages.some(p=>scoreXiahaiPassage('癌',p.excerpt)));
  }
  assert.ok(visited.includes('manifest.json'));
  assert.ok(visited.some(s=>s.startsWith('shard-')));
  assert.deepEqual(await retrieveXiahaiEvidence('🧪'),[],'one emoji may return no evidence; should not be rejected by minimum length');
  await assert.rejects(retrieveXiahaiEvidence('   '),/1–200 字/);
 }finally{globalThis.fetch=previous;}
});

test('web form no longer disables submission until two characters',()=>{
 const form=readFileSync(resolve('src/academy/XiahaiAcademy.tsx'),'utf8');
 assert.ok(form.includes('disabled={busy||!query.trim()}'));
 assert.ok(form.includes('請至少輸入 1 個字'));
 assert.ok(!form.includes('query.trim().length<2'));
});
