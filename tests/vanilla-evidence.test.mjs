import test from "node:test";
import assert from "node:assert/strict";
import {authorIdentityAdjustment,authorReferenceLinks,evidenceScore,normalizeAuthor} from "../src/search/vanilla-evidence.ts";
import {parseOpenAlexHits} from "../src/search/scholarly-discovery.ts";

const author={id:"https://openalex.org/A1234",name:"Example Scholar"};
test("Evidence IDs stable per OpenAlex article and show cautious source-rating rubric",()=>{
 const data={openalex_id:"https://openalex.org/W54321",title:"Methods for testing",
  source_url:"https://openalex.org/W54321",doi:"10.1234/research",publication_year:2026,
  source_name:"Research Journal",referenced_works_count:12,work_type:"article",authors:[author]};
 const e=evidenceScore(data);
 assert.equal(e.id,"VE-OA-W54321");
 assert.equal(e.verification,"metadata-only");
 assert.equal(e.breakdown.author_identity,8);
 assert.ok(e.score<=80&&e.score>40);
 assert.equal(evidenceScore(data).score,e.score);
 assert.equal(evidenceScore({...data,is_retracted:true}).score,0);
});
test("Verified same-author research identity changes only bounded scores",()=>{
 const base=authorIdentityAdjustment(author);
 const matched=authorIdentityAdjustment(author,{id:"https://openalex.org/A1234",orcid:"https://orcid.org/0000-0000-0000-000X",works_count:150});
 const wrong=authorIdentityAdjustment(author,{id:"https://openalex.org/A4321",orcid:"https://orcid.org/0000-0000-0000-000X",works_count:800});
 assert.equal(base.identity,8);
 assert.equal(matched.identity,13);
 assert.equal(matched.footprint,3);
 assert.equal(wrong.footprint,0);
 assert.equal(wrong.identity,8);
});
test("Author profile URLs use disambiguated sources; no fabricated Wikipedia page",()=>{
 const x=normalizeAuthor({id:"https://openalex.org/A1234",display_name:"Example Scholar",orcid:"https://orcid.org/0000-0000-0000-000X"});
 assert.equal(x?.id,"https://openalex.org/A1234");
 const urls=authorReferenceLinks(x);
 assert.match(urls.wikipedia,/index\.php\?search=/);
 assert.match(urls.news,/news\.google\.com\/search/);
 assert.equal(urls.personal,urls.orcid);
 assert.match(urls.personal_search,/google.com\/search/);
});
test("OpenAlex 100 distinct papers produce 100 real evidence cards from actual payload",()=>{
 const input={results:Array.from({length:100},(_,i)=>({
  id:"https://openalex.org/W"+(110000+i),title:"Article "+i,
  doi:"https://doi.org/10.1234/example-"+i,publication_year:2026,
  type:"article",referenced_works_count:10,
  primary_location:{source:{display_name:"Journal"}},
  authorships:[{author:{id:"https://openalex.org/A1234",display_name:"Example Scholar"}}]
 }))};
 const rows=parseOpenAlexHits(input,{},100);
 assert.equal(rows.length,100);
 assert.equal(new Set(rows.map(x=>x.evidence.id)).size,100);
 assert.equal(rows[0].authors[0].name,"Example Scholar");
 assert.ok(rows.every(x=>x.evidence.verification==="metadata-only"));
 assert.ok(rows.every(x=>x.citation_weight===1));
});
