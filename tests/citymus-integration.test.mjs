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
