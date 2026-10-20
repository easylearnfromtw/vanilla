import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=file("src/venus/VenusBlocks.tsx");
const advanced=file("src/venus/VenusAdvanced.tsx");
const css=file("src/venus/presentation.css");

test("Venus charts have accessible graph/data controls and source provenance",()=>{
 assert.match(ui,/aria-pressed=\{mode==="visual"\}/);
 assert.match(ui,/aria-pressed=\{mode==="data"\}/);
 assert.match(ui,/className="venus-data-table"/);
 assert.match(ui,/<th scope="row">/);
 assert.match(ui,/來源標示（由回答提供，未獨立查證）/);
});
test("tabs use keyboard-aware roving tabindex, labels and an addressable panel",()=>{
 assert.match(ui,/role="tablist"/);
 assert.match(ui,/tabIndex=\{selected===i\?0:-1\}/);
 assert.match(ui,/event\.key==="ArrowRight"/);
 assert.match(ui,/event\.key==="ArrowLeft"/);
 assert.match(ui,/event\.key==="Home"/);
 assert.match(ui,/event\.key==="End"/);
 assert.match(ui,/aria-labelledby=\{id\+"-tab-"\+selected\}/);
});
test("checklist and quiz allow session-only progress and replay without persistence",()=>{
 assert.match(ui,/role="progressbar"/);
 assert.match(ui,/aria-valuenow=\{checked\.length\}/);
 assert.match(ui,/已完成 \{checked\.length\}/);
 assert.match(ui,/重新開始/);
 assert.match(ui,/再試一次/);
 assert.match(ui,/答案由模型產生，尚未獨立核對/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|fetch\(/);
});
test("gallery lightbox is keyboard-accessible, closable, and honors per-image consent even during navigation",()=>{
 assert.match(ui,/role="dialog" aria-modal="true"/);
 assert.match(ui,/event\.key==="Escape"/);
 assert.match(ui,/event\.key==="Tab"/);
 assert.match(ui,/openerRef\.current\?\.focus\(\)/);
 assert.match(ui,/ref=\{dialogRef\}/);
 assert.match(ui,/event\.key==="ArrowRight"/);
 assert.match(ui,/event\.key==="ArrowLeft"/);
 assert.match(ui,/referrerPolicy="no-referrer"/);
 assert.match(ui,/!loaded\.includes\(active\)\?<button/);
 assert.match(ui,/loaded\.includes\(i\)\?/);
 assert.match(ui,/圖片出處/);
 assert.match(ui,/onError=/);
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|eval\(/);
});
test("map and video can unload the third-party iframe after opt-in",()=>{
 assert.match(advanced,/收起地圖/);
 assert.match(advanced,/關閉播放器/);
 assert.match(advanced,/setPermitted\(false\)/);
 assert.match(advanced,/setPermitted\(true\)/);
 assert.match(advanced,/sandbox="allow-scripts allow-same-origin"/);
 assert.match(advanced,/referrerPolicy="no-referrer"/);
});
test("MathML copy confirms only completed clipboard operations and reports failures",()=>{
 assert.match(advanced,/navigator\.clipboard\?\.writeText/);
 assert.match(advanced,/await navigator\.clipboard\.writeText\(block\.expression\)/);
 assert.match(advanced,/setCopied\("ok"\)/);
 assert.match(advanced,/setCopied\("failed"\)/);
});
test("mobile Venus UI uses strong focus, touch targets, dark mode, reduced motion and safe layout",()=>{
 assert.match(css,/\.venus-lightbox/);
 assert.match(css,/\.venus-widget-head/);
 assert.match(css,/focus-visible/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media \(prefers-color-scheme:dark\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(print\)/);
});
