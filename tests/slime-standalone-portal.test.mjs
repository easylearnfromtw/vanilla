import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Slime has an independently served HTML site without Vanilla app boot",()=>{
 const html=read("public/slime/index.html");
 assert.match(html,/<title>Slime · Vanilla AI 節點安裝<\/title>/);
 assert.match(html,/<main>/);
 assert.match(html,/INDEPENDENT PORTAL/);
 assert.match(html,/href="\.\.\/"/);
 assert.doesNotMatch(html,/src="\/src\/main\.tsx"|id="root"|\/api\/slime\/node\/pair/);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/referrer" content="no-referrer"/);
 assert.match(html,/history\.replaceState/);
 assert.match(html,/window\.__slimePairCode/);
 assert.doesNotMatch(html,/localStorage\.setItem|sessionStorage\.setItem|document\.cookie\s*=|eval\(/);
});

test("Vanilla Slime navigation launches a new browser tab and legacy QR URLs redirect",()=>{
 const app=read("src/App.tsx");
 assert.match(app,/BASE\+"slime\/"/);
 assert.match(app,/target="_blank"/);
 assert.match(app,/noopener noreferrer/);
 assert.match(app,/window\.location\.replace\(BASE\+"slime\/"\+hash\)/);
 assert.doesNotMatch(app,/section==="nodes"\?<div className="workspace-page"><SlimeNetwork/);
});

test("Independent portal selects only the exact authenticated GitHub release asset",()=>{
 const html=read("public/slime/index.html");
 assert.match(html,/api\.github\.com\/repos\/easylearnfromtw\/vanilla\/releases\?per_page=20/);
 assert.match(html,/slime-v\[\\w\.-\]/);
 assert.match(html,/browser_download_url/);
 assert.match(html,/item\.size>0/);
 assert.match(html,/host\+release\.tag_name\+"\/"/);
 assert.match(html,/Slime-\w*/);
 assert.match(html,/尚未發布/);
 assert.match(html,/無法確認官方版本/);
 assert.match(html,/手機/);
 assert.match(html,/copy-code/);
 assert.match(html,/複製備用邀請連結/);
});

test("QR invitations target standalone page and private Telegram hub links to it",()=>{
 const slime=read("services/weiguo/slime.py");
 const telegram=read("services/weiguo/ceres_command_center.py");
 const qr=read("services/weiguo/ceres_admin_bot.py");
 assert.match(slime,/SLIME_PAIRING_PAGE_URL/);
 assert.match(slime,/https:\/\/easylearnfromtw\.github\.io\/vanilla\/slime\//);
 assert.match(slime,/_pairing_page_url\(\)\+"#slime="/);
 assert.match(telegram,/Slime 獨立安裝網頁/);
 assert.match(telegram,/在獨立網頁開啟配對/);
 assert.match(telegram,/url":_pairing_page_url\(\)/);
 assert.match(qr,/_pairing_page_url/);
 assert.match(qr,/sendPhoto/);
});

test("No public client issues privileged short codes or consumes long-lived device credentials",()=>{
 const html=read("public/slime/index.html");
 assert.doesNotMatch(html,/\/v1\/family\/slime\/invite|\/v1\/slime\/node\/pair/);
 assert.doesNotMatch(html,/authorization|bearer\s|token_digest/i);
 assert.match(html,/由 Telegram Ceres Owner 產生/);
 assert.match(html,/不在此公開網頁驗證或核發節點 Token/);
});
