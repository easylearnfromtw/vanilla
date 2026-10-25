import test from "node:test";
import assert from "node:assert/strict";
import {BRAND,BOOK_SEEDS,attribution,citationPriority,evidenceLabel,canSupportAdvice,consumerGuidance} from "../src/knowledge/evidence.ts";

test("柳岸書城 citation still attributes original author and original publisher",()=>{
 const text=attribution(BOOK_SEEDS[0]);
 assert.match(text,/引用自柳岸書城/);
 assert.match(text,/Adam Smith/);
 assert.match(text,/Project Gutenberg/);
 assert.doesNotMatch(text,/柳岸書城出版/);
});
test("霞海書院 research institution weight policy (unverified rank defaults 1)",()=>{
 for(const [rank,expected] of [[1,5],[100,5],[101,4],[300,4],[301,3],[500,3],[501,2],[700,2],[701,1]]){
  assert.equal(citationPriority(rank),expected);
 }
 assert.equal(citationPriority(undefined),1);
 assert.equal(citationPriority(2000,true),5);
 assert.equal(BRAND.paper,"霞海書院");
});
test("consumer advice refuses paper abstract as established actionable evidence",()=>{
 const paper={id:"W123",kind:"paper",title:"Research title",authors:["Researcher"],
   originalUrl:"https://doi.org/10.1/example",sourceName:"Example journal",
   tier:"abstract",verified:true};
 assert.equal(canSupportAdvice(paper),false);
 const outcome=consumerGuidance([paper],"What should I buy?");
 assert.equal(outcome.knowledgeSuitableForAdvice,false);
 assert.match(evidenceLabel(paper.tier),/摘要/);
});
