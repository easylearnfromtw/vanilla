import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {retrieveXiahaiEvidence,rankXiahaiPapers,scoreXiahaiPassage,xiahaiPromptContext} from '../src/academy/xiahai-evidence.ts';

const base=resolve('public/evidence/xiahai-1000');
function content(name){return JSON.parse(readFileSync(resolve(base,name),'utf8'));}
const manifest=content('manifest.json');
const shards=Array.from({length:10},(_,i)=>content('shard-'+String(i).padStart(2,'0')+'.json'));

test('1000 actual deployed-source records have distinct IDs, article URLs, CC attribution and 3000 bounded excerpts',()=>{
 assert.equal(manifest.schema,'xiahai-verified-1000-evidence-v1');
 assert.equal(manifest.paper_count,1000);
 assert.equal(manifest.real_fulltext_chunks_checked,41796);
 assert.equal(manifest.excerpt_count,3000);
 assert.equal(new Set(manifest.papers.map(x=>x.id)).size,1000);
 let count=0;
 for(const [i,shard] of shards.entries()){
  assert.equal(shard.schema,'xiahai-evidence-shard-v1');
  assert.equal(shard.shard,i);
  assert.equal(shard.papers.length,100);
  for(const row of shard.papers){
   const item=manifest.papers.find(x=>x.id===row.id);
   assert.ok(item,'Unknown PMCID in published shard');
   assert.equal(item.shard,i);
   assert.equal(item.source_url,'https://pmc.ncbi.nlm.nih.gov/articles/'+item.id+'/');
   assert.ok(item.authors.length>0);
   assert.ok(['cc-by-4.0','cc-by-3.0','cc0-1.0'].includes(item.license));
   for(const excerpt of row.evidence){
    assert.ok(excerpt.excerpt.length>=60&&excerpt.excerpt.length<=260);
    assert.match(excerpt.chunk_sha256,/^[a-f0-9]{64}$/);
    assert.match(excerpt.chunk_id,/^paper_[a-f0-9]{26}$/);
    count++;
   }
  }
 }
 assert.equal(count,3000);
});
test('real article titles without question-relevant published excerpts are REFUSED; genuine overlapping excerpts are cited',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  const match=String(url).match(/\/(manifest\.json|shard-\d{2}\.json)$/);
  assert.ok(match,'Unexpected evidence request to external domain');
  return {ok:true,headers:new Headers(),text:async()=>JSON.stringify(content(match[1]))};
 };
 try{
  const supported=await retrieveXiahaiEvidence('heart failure');
  assert.ok(supported.length>=1,'At least one fulltext source must have actual heart failure excerpt');
  for(const hit of supported){
   assert.ok(hit.passages.length>=1);
   assert.ok(hit.matched_terms.includes('heart'));
   assert.ok(hit.matched_terms.includes('failure'));
   assert.ok(hit.passages.every(v=>scoreXiahaiPassage('heart failure',v.excerpt)));
  }
  const grounded=xiahaiPromptContext('heart failure',supported);
  assert.ok(grounded.includes('pmc.ncbi.nlm.nih.gov/articles/PMC'));
  // This corpus contains title/term matches, but no adequate accessible
  // snippets for this exact 2-word question. Refusing is correct.
  assert.ok(rankXiahaiPapers(manifest.papers,'shared decision').length>0);
  assert.deepEqual(await retrieveXiahaiEvidence('shared decision'),[]);
  assert.deepEqual(await retrieveXiahaiEvidence('unmatchedquasarzz astrophysicsxyz'),[]);
 }finally{globalThis.fetch=original;}
});
