/** A small *real-source grounding smoke benchmark*, not a clinical accuracy estimate.
 * Tests deterministic known questions against the actual published 1000 PMC
 * records and 3000 exact excerpts (NOT synthetic fake book entries).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 rankXiahaiPapers,rankXiahaiPassages,validPaper,xiahaiPromptContext
} from '../src/academy/xiahai-evidence.ts';

const root=new URL('../public/evidence/xiahai-1000/',import.meta.url);
function read(name){return JSON.parse(readFileSync(new URL(name,root),'utf8'));}
const manifest=read('manifest.json');
const shards=Array.from({length:10},(_,i)=>read('shard-'+String(i).padStart(2,'0')+'.json'));
const sources=new Map(shards.flatMap(group=>group.papers.map(v=>[v.id,v.evidence])));
const studies=[
 {query:'diabetes MODY',expected:'PMC7618620'},
 {query:'cataract dizziness',expected:'PMC4949987'},
 {query:'rectal temperature',expected:'PMC7618561'},
 {query:'breast cancer',expected:'PMC4445249'},
 {query:'depression hypertension',expected:'PMC7618362'},
 {query:'Zika microcephaly',expected:'PMC7618589'},
 {query:'糖尿病 MODY',expected:'PMC7618620'},
 {query:'白內障 頭暈',expected:'PMC4949987'}
];
test('public deployment package is 1000 real attributed papers and 3000 traceable short passages',()=>{
 assert.equal(manifest.schema,'xiahai-verified-1000-evidence-v1');
 assert.equal(manifest.paper_count,1000);
 assert.equal(manifest.real_fulltext_chunks_checked,41796);
 assert.equal(manifest.excerpt_count,3000);
 assert.equal(manifest.papers.length,1000);
 assert.equal(sources.size,1000);
 assert.equal(shards.length,10);
 assert.equal(new Set(manifest.papers.map(p=>p.id)).size,1000);
 for(const p of manifest.papers){
  assert.ok(validPaper(p),'source PMCID and CC attribution invalid: '+p.id);
  const evidence=sources.get(p.id);
  assert.equal(evidence.length,3);
  assert.ok(evidence.every(s=>s.excerpt.length<=260));
 }
});
test('handpicked independent topics only route to published, query-related actual excerpt IDs',()=>{
 let confirmed=0;
 for(const {query,expected} of studies){
  const ranked=rankXiahaiPapers(manifest.papers,query,24);
  const actual=ranked.flatMap(({paper,score})=>{
   const snippets=rankXiahaiPassages(query,sources.get(paper.id)||[]);
   return snippets.length?[{paper,score,passages:snippets.map(s=>s.passage)}]:[];
  });
  const exact=actual.find(hit=>hit.paper.id===expected);
  assert.ok(exact,'known source not supported by original short excerpts for '+query);
  assert.ok(exact.passages.length>=1&&exact.passages[0].chunk_sha256.length===64);
  const ctx=xiahaiPromptContext(query,[exact]);
  assert.ok(ctx.includes('https://pmc.ncbi.nlm.nih.gov/articles/'+expected+'/'));
  assert.ok(ctx.includes(exact.passages[0].chunk_id));
  confirmed++;
 }
 assert.equal(confirmed,8);
});
test('refuses unrelated or overly broad clinical question without quotable direct evidence',()=>{
 assert.equal(rankXiahaiPapers(manifest.papers,'',8).length,0);
 const target=manifest.papers.find(x=>x.id==='PMC7618620');
 assert.ok(target);
 assert.equal(rankXiahaiPassages('stent persistent',
    [{chunk_id:'paper_'+'a'.repeat(26),chunk_sha256:'a'.repeat(64),position:0,
      excerpt:'Persistent infections can cause chronic illness but are unrelated to the question on cardiac implant devices and technical performance.'}]).length,0);
 assert.ok(!xiahaiPromptContext('unknown',[]).includes('PMC12000000'));
});
