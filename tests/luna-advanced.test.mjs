import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {lunaTensorPixels,lunaMaskPixels,LUNA_CUTOUT_MODEL,LUNA_CUTOUT_SHA256} from "../src/luna/background-removal.ts";
import {validatePsdSize,psdPosition} from "../src/luna/psd.ts";
import {parseLunaAI} from "../src/luna/ai-layout.ts";
const file=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("actual AI structured layout becomes validated independent text/shape layers",()=>{
 const d=parseLunaAI(JSON.stringify({name:"品牌新作",background:"#F4F2EC",layers:[
  {kind:"text",label:"標題",text:"肌膚講座",x:.1,y:.2,w:.75,h:.2,color:"#111111",fontSize:91},
  {kind:"shape",label:"色塊",x:.1,y:.7,w:.5,h:.04,fill:"#E75B4A"}
 ]}));
 assert.equal(d.name,"品牌新作");assert.equal(d.layers.length,2);
 assert.equal(d.layers[0].text,"肌膚講座");
 assert.equal(d.layers[1].kind,"shape");
 assert.throws(()=>parseLunaAI('{"layers":[{"kind":"image","image":"http://evil"}]}'),/僅能生成文字/);
 assert.throws(()=>parseLunaAI('{"layers":[{"kind":"text","x":"javascript:1"}]}'),/座標/);
});
test("PSD guards reject oversized or suspicious file sizes and preserve geometry",()=>{
 assert.throws(()=>validatePsdSize(24_000_001),/24 MB/);
 assert.throws(()=>validatePsdSize(-1),/24 MB/);
 assert.doesNotThrow(()=>validatePsdSize(150000));
 const p=psdPosition(150,250,200,300,1000,1000);
 assert.equal(p.x,.15);assert.equal(p.y,.25);
 assert.equal(p.w,.2);assert.equal(p.h,.3);
});
test("local U2NetP tensor and saliency normalization keep RGB and alpha separate",()=>{
 const src=new Uint8ClampedArray(320*320*4);
 src.set([255,0,128,255]);
 const t=lunaTensorPixels(src);
 assert.equal(t.length,3*320*320);
 assert.ok(t[0]>2);assert.ok(t[320*320]<0);
 const values=new Float32Array(320*320);values[0]=1;values[1]=0.4;
 const mask=lunaMaskPixels(values);
 assert.equal(mask.length,320*320*4);
 assert.equal(mask[3],255);
 assert.ok(mask[7]<255);
 assert.match(LUNA_CUTOUT_MODEL,/huggingface\.co/);assert.equal(LUNA_CUTOUT_SHA256.length,64);
});
test("advanced tools keep remote model and heavy runtime behind explicit UI consent",()=>{
 const ui=file("src/luna/LunaAdvancedTools.tsx"),layout=file("src/luna/ai-layout.ts");
 const psd=file("src/luna/psd.ts"),cutout=file("src/luna/background-removal.ts");
 assert.match(ui,/remoteApproved/);assert.match(ui,/modelApproved/);
 assert.match(layout,/currentChatMode\(\)==="private"/);
 assert.match(layout,/purpose:"structured"/);
 assert.match(psd,/MAX_PSD_BYTES/);assert.match(psd,/readPsd/);assert.match(psd,/writePsd/);
 assert.match(cutout,/crypto\.subtle\.digest/);
 assert.match(cutout,/executionProviders:\["wasm"\]/);
 assert.doesNotMatch(cutout,/Authorization|x-goog-api-key|\/admin\//);
 const editor=file("src/luna/LunaStudio.tsx");
 assert.match(editor,/LunaAdvancedTools/);
 assert.match(file("src/luna/export.ts"),/if\(!l\.image\)/);
});
