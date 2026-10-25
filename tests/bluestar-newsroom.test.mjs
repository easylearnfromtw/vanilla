import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gdeltNewsUrl,newsSourceUrl,parseLiveNews,parseArchiveSnapshot,NEWS_MARKETS} from "../src/bluestar/news-source.ts";

test("藍星報社 uses GDELT publisher-country scope and does not request full text",()=>{
 assert.deepEqual(NEWS_MARKETS.map(x=>x.id),["TW","CN","JP","KR","US"]);
 const u=new URL(gdeltNewsUrl("JP","technology","AI research"));
 assert.equal(u.origin,"https://api.gdeltproject.org");
 assert.equal(u.searchParams.get("mode"),"artlist");
 assert.match(u.searchParams.get("query"),/sourcecountry:japan "AI research"/);
 assert.equal(u.searchParams.get("timespan"),"1w");
 assert.equal(u.searchParams.get("maxrecords"),"50");
 assert.equal(u.searchParams.get("format"),"json");
});
test("external headlines are filtered, not executed, and duplicates are removed",()=>{
 assert.equal(newsSourceUrl("javascript:alert(1)"),null);
 const rows=parseLiveNews({articles:[
  {title:"Verifiable original headline",url:"https://example.org/news/1",domain:"example.org",seendate:"20261025T120000Z",language:"English"},
  {title:"Verifiable original headline",url:"https://example.org/news/1",domain:"example.org"},
  {title:"Poison URL skipped",url:"javascript:alert(1)"},
  {title:"Missing URL"}
 ]},"TW");
 assert.equal(rows.length,1);
 assert.equal(rows[0].detectedAt,"2026-10-25T12:00:00Z");
 assert.equal(rows[0].kind,"live");
 assert.equal(rows[0].url,"https://example.org/news/1");
});
test("archive snapshot is metadata only; counts are not substituted for training",()=>{
 const parsed=parseArchiveSnapshot({metadata_indexed:123,rights_reviewed_unique_full_articles:4,articles:[
  {market:"US",title:"Historic source headline",url:"https://example.com/news/2",source:"example.com",published_at:"2015-04-05",article_id:"id002",text:"Should never appear in output"}
 ]});
 assert.equal(parsed.totalIndexed,123);
 assert.equal(parsed.totalApproved,4);
 assert.equal(parsed.articles.length,1);
 assert.equal(parsed.articles[0].kind,"archive");
 assert.equal("text" in parsed.articles[0],false);
});
test("newsroom accessible by explicit deep link and tool action, not a sixth nav item",()=>{
 const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
 const primary=app.split("const items:NavItem[]=[")[1].split("];")[0];
 assert.doesNotMatch(primary,/bluestar/);
 assert.match(app,/get\("press"\)==="bluestar"/);
 assert.match(app,/vanilla-open-bluestar/);
 assert.match(app,/section==="bluestar"\?<div className="workspace-page"><BlueStarNewsroom\/>/);
 assert.match(app,/title="藍星報社 · 五國新聞來源"/);
});
