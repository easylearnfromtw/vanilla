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

import {parseKnowledgeLookup,findKnowledgeSources} from "../src/knowledge/chat-source-lookup.ts";

test("chat lookup is explicit; default questions do not secretly call third parties",()=>{
 assert.deepEqual(parseKnowledgeLookup("柳岸書城 行為經濟學"),{kind:"book",query:"行為經濟學"});
 assert.deepEqual(parseKnowledgeLookup("霞海書院 behavioral economics"),{kind:"paper",query:"behavioral economics"});
 assert.equal(parseKnowledgeLookup("請幫我比較理財方法"),null);
});

test("book lookup only formats actually returned book source metadata",async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({docs:[
   {key:"/works/OL123W",title:"Verified Book",author_name:["Real Author"],isbn:["9780385533225"]}
 ]})});
 try{
  const response=await findKnowledgeSources({kind:"book",query:"Verified Book"});
  assert.match(response,/柳岸書城/);
  assert.match(response,/Verified Book/);
  assert.match(response,/https:\/\/openlibrary.org\/works\/OL123W/);
  assert.match(response,/"availability":"metadata-only"/);
  assert.doesNotMatch(response,/\"evidence\":\{.+\"excerpt\"/);
 }finally{globalThis.fetch=previous;}
});

test("paper lookup requires OpenAlex ID/DOI and does not claim reviewed findings",async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({results:[
  {id:"https://openalex.org/W12345",display_name:"Sample Economic Paper",publication_year:2025,
   doi:"https://doi.org/10.1016/real",authorships:[{author:{display_name:"Scholar"}}]}
 ]})});
 try{
  const response=await findKnowledgeSources({kind:"paper",query:"economic paper"});
  assert.match(response,/霞海書院/);
  assert.match(response,/Sample Economic Paper/);
  assert.match(response,/https:\/\/doi.org\/10.1016\/real/);
  assert.match(response,/"evidence_scope":"metadata-only"/);
  assert.match(response,/"priority":1/);
 }finally{globalThis.fetch=previous;}
});

import {LIUAN_VERIFIED_HISTORICAL_BOOKS,LIUAN_INDEX_REPORT} from "../src/knowledge/liuan-historical-100.ts";
test("柳岸書城 static page references 100 actually indexed longform historical books",()=>{
 assert.equal(LIUAN_VERIFIED_HISTORICAL_BOOKS.length,100);
 assert.equal(new Set(LIUAN_VERIFIED_HISTORICAL_BOOKS.map(([id])=>id)).size,100);
 for(const [id,title,author] of LIUAN_VERIFIED_HISTORICAL_BOOKS){
  assert.ok(/^\d+$/.test(id)&&Number(id)>0,"Gutenberg source IDs required");
  assert.ok(title.trim().length>=5&&author.includes(","),"grounded named author/title required: "+id);
 }
 assert.equal(LIUAN_INDEX_REPORT.books,100);
 assert.equal(LIUAN_INDEX_REPORT.textChunks,37950);
 assert.equal(LIUAN_INDEX_REPORT.fulltextHostedOnPublicWebsite,false);
 assert.equal(LIUAN_INDEX_REPORT.rights,"jurisdiction-and-edition-review-required");
});
