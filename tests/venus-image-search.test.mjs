import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {imageSearchQuery,searchCommonsImages} from "../src/venus/image-search.ts";

test("Venus image lookup routes explicit image retrieval but not generation",()=>{
 assert.equal(imageSearchQuery("幫我找圖書館照片"),"圖書館");
 assert.equal(imageSearchQuery("請搜尋台灣自然風景圖片"),"台灣自然風景");
 assert.equal(imageSearchQuery("請生成一張圖書館照片"),null);
 assert.equal(imageSearchQuery("畫一張圖書館的圖片"),null);
 assert.equal(imageSearchQuery("這家餐廳價格多少"),null);
});
test("Wikimedia results must have real source URLs and a trusted image host",async()=>{
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
 globalThis.window={setTimeout,clearTimeout};
 let url="",options={};
 globalThis.fetch=async(address,opts)=>{
  url=String(address);options=opts;
  return {ok:true,json:async()=>({query:{pages:{
   1:{title:"File:Real image.jpg",imageinfo:[{thumburl:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/real.jpg",descriptionurl:"https://commons.wikimedia.org/wiki/File:Real_image.jpg"}]},
   2:{title:"File:Bad image.jpg",imageinfo:[{thumburl:"https://attacker.invalid/image.jpg",descriptionurl:"https://commons.wikimedia.org/wiki/File:Bad_image.jpg"}]},
   3:{title:"File:Bad source.jpg",imageinfo:[{thumburl:"https://upload.wikimedia.org/wikipedia/commons/valid.jpg",descriptionurl:"https://attacker.invalid/source"}]}
  }}})};
 };
 try{
  const result=await searchCommonsImages("library");
  assert.equal(result?.kind,"gallery");
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].source,"https://commons.wikimedia.org/wiki/File:Real_image.jpg");
  const endpoint=new URL(url);
  assert.equal(endpoint.hostname,"commons.wikimedia.org");
  assert.equal(endpoint.searchParams.get("origin"),"*");
  assert.equal(endpoint.searchParams.get("gsrnamespace"),"6");
  assert.equal(options.credentials,"omit");
  assert.equal(options.referrerPolicy,"no-referrer");
 }finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;}
});

test("native Detroit chat routes explicit Commons image searches without an unavailable model",()=>{
 const src=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 assert.match(src,/await runVenusImageLookup\(question\)/);
 assert.match(src,/await runVenusImageLookup\(route\.request,question\)/);
 assert.match(src,/if\(privateMode\)/);
 assert.match(src,/searchCommonsImages\(query\)/);
});
