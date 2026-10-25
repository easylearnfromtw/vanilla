import test from "node:test";
import assert from "node:assert/strict";
import {citymusIntent} from "../src/music/citymus.ts";
import {routeMessage} from "../src/assistant/chat-router.ts";

const ctx={privateMode:false,hasCreamResult:false,hasModel:false};
test("CITYMUS intents are detected without models",()=>{
 for(const q of ["推薦音樂","幫我推薦讀書音樂","查詢爵士歌曲","歌單推薦","找歌","查歌手","查專輯","播放音樂","音樂搜尋","/音樂","CITYMUS 推薦歌曲"]){
  assert.equal(citymusIntent(q),true,q);
  assert.equal(routeMessage(q,ctx).kind,"citymus",q);
 }
});
test("Other tools and sensitive private-mode choice are preserved",()=>{
 for(const q of ["幫我建立音樂網站","音樂產業趨勢","查詢音樂版權法律","CITYMUS API 整合","幫我製作歌曲海報"]){
  assert.equal(citymusIntent(q),false,q);
 }
 assert.equal(routeMessage("推薦音樂",{...ctx,privateMode:true}).kind,"citymus");
});
test("CITYMUS results are source-grounded and not encoded as made-up defaults",async()=>{
 const module=await import("../src/music/citymus.ts");
 assert.equal(typeof module.searchCitymus,"function");
 assert.equal(module.citymusIntent("請幫我推薦爵士音樂"),true);
});

test("Artist queries and slash music commands keep music route",()=>{
 for(const q of ["查詢歌手 周杰倫","幫我找五月天的歌","推薦台語歌","張學友唱過什麼歌"]){
  assert.equal(routeMessage(q,ctx).kind,"citymus",q);
 }
});
test("Slash command actually expands to CITYMUS route",async()=>{
 const {expandSlashCommand,matchSlashCommands}=await import("../src/assistant/chat-router.ts");
 const slash=expandSlashCommand("/音樂 推薦爵士");
 assert.equal(slash?.text,"CITYMUS 搜尋音樂：推薦爵士");
 assert.equal(routeMessage(slash.text,ctx).kind,"citymus");
 assert.ok(matchSlashCommands("/音").some(x=>x.cmd==="/音樂"));
 assert.equal(routeMessage(expandSlashCommand("/音樂").text,ctx).kind,"citymus");
});

test("CITYMUS falls back to verified metadata if deployed Pages library is unavailable",async()=>{
 const originalFetch=globalThis.fetch;
 const paths=[];
 globalThis.fetch=async(input)=>{
  const url=String(input);paths.push(url);
  if(url.includes("/api/search"))return new Response(JSON.stringify({query:"推薦爵士音樂",total:2500,matched:0,tracks:[],attribution:{label:"Powered by CITYMUS"}}),{status:200});
  if(url.includes("/citymus-library.js"))return new Response("Not found",{status:404});
  if(url.includes("/data/legal_music_library.json"))return new Response(JSON.stringify({tracks:[
   {id:"verified-1",title:"Verified Jazz Demo",artist:"Verified Artist",genre:"jazz",license:"CC0",source:"https://example.org/track"},
   {id:"verified-2",title:"Classical Demo",artist:"Verified Composer",genre:"classical",license:"CC BY",source:"https://example.org/work"}
  ]}),{status:200});
  throw Error("Unexpected fetch "+url);
 };
 try{
  const {searchCitymus}=await import("../src/music/citymus.ts");
  const report=await searchCitymus("推薦爵士音樂");
  assert.equal(report.via,"public-catalog");
  assert.equal(report.total,2);
  assert.equal(report.tracks.length,1);
  assert.equal(report.tracks[0].title,"Verified Jazz Demo");
  assert.equal(report.tracks[0].sourceUrl,"https://example.org/track");
  assert.ok(paths.some(url=>url.includes("citymus-library.js")));
  assert.ok(paths.some(url=>url.includes("legal_music_library.json")));
  const miss=await searchCitymus("完全沒有的歌曲_zzxyx");
  assert.equal(miss.tracks.length,0);
 }finally{globalThis.fetch=originalFetch;}
});
