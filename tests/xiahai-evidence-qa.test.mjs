import test from 'node:test';
import assert from 'node:assert/strict';
import {
 rankXiahaiPapers,retrieveXiahaiEvidence,parseXiahaiEvidenceQuestion,
 xiahaiPromptContext,formatXiahaiEvidence,scoreXiahaiPassage
} from '../src/academy/xiahai-evidence.ts';

const papers=Array.from({length:1000},(_,i)=>({
 id:'PMC'+(12000000+i),title:i===8?'Shared Decision Making in Surgery':'Scientific Research Series '+i,
 authors:['Example Researcher'],year:2025,doi:'10.5555/test.'+i,
 source_url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC'+(12000000+i)+'/',
 license:'cc-by-4.0',license_url:'https://creativecommons.org/licenses/by/4.0/',
 shard:Math.floor(i/100),terms:i===8?['decision','shared','surgery']:['fictional','research']
}));
const good={chunk_id:'paper_'+'a'.repeat(26),chunk_sha256:'a'.repeat(64),position:100,
 excerpt:'In shared decision making for surgery, some patients reported that medical preferences should be clarified. These observations require independent confirmation.'};
const evidence=(id)=>({id,evidence:[good,{...good,chunk_id:'paper_'+'b'.repeat(26),position:200}]});

test('RAG uses only the 1000 real source-linked records and never fabricates sources',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).endsWith('/manifest.json'))return {
   ok:true,headers:new Headers(),text:async()=>JSON.stringify({
    schema:'xiahai-verified-1000-evidence-v1',paper_count:1000,papers
   })
  };
  const m=String(url).match(/shard-(\d{2})\.json$/);
  assert.ok(m,'Only local static evidence assets may be requested');
  const shard=Number(m[1]);
  const data=papers.filter(p=>p.shard===shard).map(p=>evidence(p.id));
  return {ok:true,headers:new Headers(),text:async()=>JSON.stringify({
   schema:'xiahai-evidence-shard-v1',shard,papers:data
  })};
 };
 try{
  const hits=await retrieveXiahaiEvidence('shared decision surgery');
  assert.ok(hits.length>=1);
  assert.equal(hits[0].paper.id,'PMC12000008');
  assert.equal(hits[0].passages.length,2);
  const instructions=xiahaiPromptContext('shared decision surgery',hits);
  assert.ok(instructions.includes('https://pmc.ncbi.nlm.nih.gov/articles/PMC12000008/'));
  assert.ok(instructions.includes('不能推測')||instructions.includes('不確定性'));
  const cards=formatXiahaiEvidence(hits);
  assert.ok(cards.includes('引用自霞海書院'));
  assert.ok(cards.includes('creativecommons.org/licenses/by/4.0/'));
  assert.ok(cards.includes('paper_'+('a'.repeat(26))));
  const empty=await retrieveXiahaiEvidence('unmatchedrareterm');
  assert.deepEqual(empty,[]);
  assert.ok(xiahaiPromptContext('irrelevant',empty).includes('無符合'));
 }finally{globalThis.fetch=original;}
});
test('input activates actual fulltext only by explicit 霞海 command',()=>{
 assert.equal(parseXiahaiEvidenceQuestion('霞海全文 shared decision making'),'shared decision making');
 assert.equal(parseXiahaiEvidenceQuestion('請根據霞海書院全文 分析 results'),'分析 results');
 assert.equal(parseXiahaiEvidenceQuestion('一般醫療建議'),null);
 assert.equal(parseXiahaiEvidenceQuestion('霞海書院 psychology'),null);
 const spoof={...papers[8],source_url:'https://evil.invalid/article'};
 assert.deepEqual(rankXiahaiPapers([spoof],'shared decision'),[]);
});


test('relevant source metadata alone cannot supply a citation when its public excerpts do not answer the question',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).endsWith('/manifest.json'))return {ok:true,headers:new Headers(),
    text:async()=>JSON.stringify({schema:'xiahai-verified-1000-evidence-v1',paper_count:1000,papers})};
  const found=String(url).match(/shard-(\d{2})\.json$/);
  assert.ok(found);
  const shard=Number(found[1]);
  const irrelevant={...good,excerpt:'Microscopic particles moved across the experimental surface, affecting the measurement apparatus in unpredictable and unrelated ways.'};
  return {ok:true,headers:new Headers(),text:async()=>JSON.stringify({
   schema:'xiahai-evidence-shard-v1',shard,
   papers:papers.filter(p=>p.shard===shard).map(p=>({
    id:p.id,evidence:[irrelevant,{...irrelevant,chunk_id:'paper_'+'b'.repeat(26)}]
   }))
  })};
 };
 try{
  // Its title is a perfect query match but the published excerpts do not
  // contain the query topic. The model MUST NOT receive them.
  assert.ok(rankXiahaiPapers(papers,'shared decision surgery').length>0);
  assert.deepEqual(await retrieveXiahaiEvidence('shared decision surgery'),[]);
 }finally{globalThis.fetch=old;}
});
test('strict passage coverage rejects loose and unrelated matches',()=>{
 const match=scoreXiahaiPassage('heart failure', 'This cohort examined people with heart failure and atrial fibrillation and reported differences in mortality and follow-up.');
 assert.ok(match);
 assert.deepEqual(match.matched_terms,['heart','failure']);
 assert.equal(scoreXiahaiPassage('heart failure','An unrelated paper about heart-shaped leaves documented routine measurements and control groups.'),null);
 assert.equal(scoreXiahaiPassage('shared decision surgery','A discussion about surgery focused on other measurements and references without talking about patient preferences.'),null);
 assert.equal(scoreXiahaiPassage('cardiac risk','Multiple unrelated imaging datasets recorded numerical variation across instruments and settings.'),null);
});
