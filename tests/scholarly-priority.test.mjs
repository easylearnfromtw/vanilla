import test from 'node:test';
import assert from 'node:assert/strict';
import { scholarlyCitationPriority, orderScholarlyCitations, selectTrainingCandidates } from '../src/search/scholarly-priority.ts';
const ranks={'ror:01abcde12':100,'ror:02abcde12':300,'ror:03abcde12':301,'ror:04abcde12':500,'ror:05abcde12':501,'ror:06abcde12':700};
test('university ranking boundary tiers and fallbacks',()=>{
 const outcomes=[['01abcde12',5],['02abcde12',4],['03abcde12',3],['04abcde12',3],['05abcde12',2],['06abcde12',2]];
 for(const [ror,weight] of outcomes)assert.equal(scholarlyCitationPriority({institutions:[{ror,type:'education'}]},ranks).citation_weight,weight);
 assert.equal(scholarlyCitationPriority({institutions:[{ror:'099999999',type:'education'}]},ranks).citation_weight,1);
 assert.equal(scholarlyCitationPriority({institutions:[]},ranks).citation_weight,1);
});
test('non-university authority requires review and verified identity',()=>{
 const paper={doi:'https://doi.org/10.1234/example',institutions:[{type:'company'}]};
 const a={match_id:'doi:10.1234/example',verified:true,category:'established_theory',reviewer:'Research admin',evidence_url:'https://example.org/review'};
 assert.equal(scholarlyCitationPriority(paper,ranks,[a]).citation_weight,5);
 assert.equal(scholarlyCitationPriority(paper,ranks,[{...a,verified:false}]).citation_weight,1);
 assert.equal(scholarlyCitationPriority({...paper,institutions:[]},ranks,[a]).citation_weight,1);
});
test('all weights train if and only if full text has verified compatible rights',()=>{
 const base={fulltext:'actual text',license:'cc-by',rights_verified:true,rights_reference:'documented',rights_reviewer:'Auditor',fulltext_source_url:'https://example.org/text'};
 assert.deepEqual(selectTrainingCandidates([{...base,citation_weight:1},{...base,citation_weight:5},{...base,license:'cc-by-nc-nd',citation_weight:3}]).map(x=>x.citation_weight),[1,5]);
});
test('scientific validity first, citation weight as tie breaker',()=>{
 const out=orderScholarlyCitations([{id:'top',citation_weight:5,relevance:.7,evidence_grade:1},{id:'retracted',citation_weight:5,relevance:1,retracted:true},{id:'strong',citation_weight:1,relevance:.6,evidence_grade:2}]);
 assert.deepEqual(out.map(x=>x.id),['strong','top']);
});
