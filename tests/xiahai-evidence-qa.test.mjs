import test from 'node:test';
import assert from 'node:assert/strict';
import {
 rankXiahaiPapers,retrieveXiahaiEvidence,parseXiahaiEvidenceQuestion,
 xiahaiPromptContext,formatXiahaiEvidence,rankXiahaiPassages,xiahaiVerifiedSourceFooter
} from '../src/academy/xiahai-evidence.ts';

const papers=Array.from({length:1000},(_,i)=>({
 id:'PMC'+(12000000+i),title:i===8?'Shared Decision Making in Surgery':'Scientific Research Series '+i,
 authors:['Example Researcher'],year:2025,doi:'10.5555/test.'+i,
 source_url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC'+(12000000+i)+'/',
 license:'cc-by-4.0',license_url:'https://creativecommons.org/licenses/by/4.0/',
 shard:Math.floor(i/100),terms:i===8?['decision','shared','surgery']:['fictional','research']
}));
const good={chunk_id:'paper_'+'a'.repeat(26),chunk_sha256:'a'.repeat(64),position:100,
 excerpt:'Shared decision making in surgery requires careful explanation of benefits, harms and uncertainties for individual patients before consenting to treatment.'};
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
  const footer=xiahaiVerifiedSourceFooter(hits);
  assert.ok(footer.includes('引用自霞海書院'));
  assert.ok(footer.includes('https://pmc.ncbi.nlm.nih.gov/articles/PMC12000008/'));
  assert.ok(footer.includes('CC 授權'));
  assert.ok(footer.includes('程式直接核對'));

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

test('passage grounder refuses substring and title-only false positives',()=>{
 const relevant={...good,excerpt:'Shared decision making in surgery requires informed consent and discussing uncertainties before recommending treatment.'};
 const unrelated={...good,chunk_id:'paper_'+('c'.repeat(26)),excerpt:'Observations concern persistent viral infections and household heating systems that have no relationship to cardiac device placement.'};
 assert.equal(rankXiahaiPassages('shared decision', [unrelated,relevant]).length,1);
 assert.equal(rankXiahaiPassages('stent', [unrelated]).length,0,'stent must not match persistent');
 assert.equal(rankXiahaiPassages('diabetes MODY',[relevant]).length,0);
 assert.equal(rankXiahaiPassages('shared decision',[relevant])[0].overlap,2);
 assert.equal(rankXiahaiPassages('shared unrelated',[relevant]).length,0,'a one-word mention cannot ground a two-term research question');
});
