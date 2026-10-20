import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chooseVenusIntent,parseVenusMessage,venusPresentationGuidance} from "../src/venus/presentation.ts";
import {parseVenusMath} from "../src/venus/math-core.ts";
const fence=value=>"\u0060\u0060\u0060venus\n"+JSON.stringify(value)+"\n\u0060\u0060\u0060";
const parse=value=>parseVenusMessage(fence(value));
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Diana selects Venus presentation modes without requiring explicit tools",()=>{
 assert.equal(chooseVenusIntent("請顯示這三個座標的互動地圖"),"map");
 assert.equal(chooseVenusIntent("嵌入這個 YouTube 影片"),"video");
 assert.equal(chooseVenusIntent("幫我排版數學公式"),"math");
 assert.equal(chooseVenusIntent("製作倒數計時"),"live");
 assert.equal(chooseVenusIntent("幫我看這個圖庫"),"gallery");
 assert.equal(chooseVenusIntent("謝謝"),"standard");
 assert.equal(venusPresentationGuidance("感謝","casual",false),"");
 assert.match(venusPresentationGuidance("請列出這些座標的地圖","analysis",false),/map/);
 assert.equal(venusPresentationGuidance("請列出這些座標的地圖","analysis",true),"");
});
test("maps accept finite coordinate shapes and reject malformed coordinates",()=>{
 assert.equal(parse({kind:"map",title:"位置",points:[{label:"臺北",lat:25.03,lon:121.56,description:"台灣"}]}).blocks.length,1);
 for(const [lat,lon] of [[Infinity,121],[NaN,121],[89,121],[25,181],["25",121]]){
  assert.equal(parse({kind:"map",points:[{label:"地點",lat,lon}]}).blocks.length,0);
 }
 assert.equal(parse({kind:"map",points:[{label:"",lat:25,lon:121}]}).blocks.length,0);
 assert.equal(parse({kind:"map",points:new Array(9).fill({label:"x",lat:25,lon:121})}).blocks.length,0);
});
test("video providers only permit provider-validated IDs",()=>{
 assert.equal(parse({kind:"video",title:"官方影片",provider:"youtube",videoId:"dQw4w9WgXcQ"}).blocks.length,1);
 assert.equal(parse({kind:"video",title:"官方影片",provider:"vimeo",videoId:"12345678"}).blocks.length,1);
 for(const [provider,videoId] of [["youtube","https://evil.example"],["youtube","<script>"],["vimeo","42"],["untrusted","12345678901"]]){
  assert.equal(parse({kind:"video",title:"影片",provider,videoId}).blocks.length,0);
 }
});
test("clock/countdown are device-time widgets, never remote real-time data",()=>{
 assert.equal(parse({kind:"live",mode:"clock",timezone:"Asia/Taipei"}).blocks.length,1);
 assert.equal(parse({kind:"live",mode:"countdown",targetISO:"2026-12-31T23:59:59+08:00",timezone:"Asia/Taipei"}).blocks.length,1);
 for(const targetISO of ["2026-12-31","bad","2026-12-31T23:59:00","2026-12-31T23:59:00<script>"]){
  assert.equal(parse({kind:"live",mode:"countdown",targetISO}).blocks.length,0);
 }
 assert.equal(parse({kind:"live",mode:"clock",timezone:"../Taipei"}).blocks.length,0);
 const code=file("src/venus/VenusAdvanced.tsx");
 assert.match(code,/Date\.now\(\)/);
 assert.match(code,/使用本裝置時間更新/);
});
test("offline math AST handles fractions, roots, subscripts and superscripts",()=>{
 const fraction=parseVenusMath("\\frac{a_1+b^2}{\\sqrt{c}}");
 assert.ok(fraction);
 assert.equal(fraction.kind,"fraction");
 assert.equal(fraction.numerator.kind,"row");
 const script=parseVenusMath("x_i^2");
 assert.ok(script);
 assert.equal(script.kind,"script");
 assert.equal(script.sub.kind,"token");
 assert.equal(script.sup.kind,"token");
 for(const invalid of ["\\href{javascript:alert(1)}{click}","\\input{a}","\\htmlClass{evil}{x}","\\frac{x}","a^{x","<script>alert(1)</script>", " ".repeat(650)]){
  assert.equal(parseVenusMath(invalid),null);
 }
 assert.equal(parse({kind:"math",expression:"\\frac{1}{2}"}).blocks.length,1);
 assert.equal(parse({kind:"math",expression:"<script>"}).blocks.length,0);
});
test("third-party image/media/map stays opt-in and sandboxed",()=>{
 const media=file("src/venus/VenusAdvanced.tsx");
 const gallery=file("src/venus/VenusBlocks.tsx");
 assert.match(media,/載入 OpenStreetMap 互動地圖/);
 assert.match(media,/載入 \{block\.provider/);
 assert.match(media,/sandbox="allow-scripts allow-same-origin"/);
 assert.match(media,/sandbox="allow-scripts allow-same-origin allow-presentation"/);
 assert.match(media,/referrerPolicy="no-referrer"/);
 assert.match(gallery,/載入外部圖片/);
 assert.doesNotMatch(media+gallery,/dangerouslySetInnerHTML|eval\(/);
});
