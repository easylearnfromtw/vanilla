import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../services/weiguo/ceres_slime_web.py",import.meta.url),"utf8");
const page=source.match(/_PAGE="""([\s\S]*?)"""/)?.[1];
assert.ok(page,"Mini App HTML template is present");

test("Telegram Mini App inline Javascript remains syntactically valid",()=>{
 const js=page.match(/<script nonce="__NONCE__">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(js,"nonce-protected Mini App Javascript found");
 assert.doesNotThrow(()=>new vm.Script(js,{filename:"ceres-slime-miniapp.js"}));
});

test("Monochrome Hub design retains accessible functional controls",()=>{
 for(const id of ["overview","devices","pairing","sync-pill","device-counter","refresh",
  "issue","code","copy-code","copy-link","qr-image","installer","node-list",
  "confirm-box","confirm-title","confirm-description","approve","cancel","message"]){
   assert.match(page,new RegExp('id="'+id+'"'),"Missing control: "+id);
 }
 assert.match(page,/aria-selected="true"/);
 assert.match(page,/tabindex="-1"/);
 assert.match(page,/role="dialog" aria-modal="true"/);
 assert.match(page,/safe-area-inset-bottom/);
 assert.match(page,/prefers-reduced-motion:reduce/);
 assert.match(page,/--tg-theme-bg-color/);
 assert.match(page,/--tg-theme-text-color/);
 assert.match(page,/owner/i);
 assert.match(page,/color-mix/);
 assert.match(page,/data-tab="overview"/);
 assert.match(page,/data-tab="devices"/);
 assert.match(page,/data-tab="pairing"/);
 assert.match(page,/navigator\.clipboard\.writeText/);
 assert.match(page,/issued=\{code:obj\.code,link:obj\.link\}/);
});

test("Aesthetic changes do not weaken Owner auth, expose secrets, or add remote assets",()=>{
 assert.match(source,/def _owner\(init_data:/);
 assert.match(source,/_verify\(init_data\)/);
 assert.match(source,/owner_subject\(chat\)/);
 assert.match(source,/return issue_short_pair\(sub\)|result=issue_short_pair\(sub\)/);
 assert.match(source,/hashlib\.sha256\(token\.encode\(\)\)/);
 assert.match(source,/def confirm\(body:Confirm\)/);
 assert.match(source,/db\.commit\(\)/);
 assert.match(source,/frame-ancestors 'none'/);
 assert.match(source,/Cache-Control/);
 assert.doesNotMatch(page,/localStorage\.|sessionStorage\.|innerHTML\s*=/);
 assert.doesNotMatch(page,/https:\/\/t\.me\/SignWell_bot/);
 assert.doesNotMatch(page,/https:\/\/fonts\.googleapis\.com/);
 const publicPage=readFileSync(new URL("../public/slime/index.html",import.meta.url),"utf8");
 assert.doesNotMatch(publicPage,/\/v1\/ceres\/slime\/webapp/);
 assert.doesNotMatch(publicPage,/https:\/\/t\.me\/SignWell_bot/);
});

test("Welcome screen starts privately and transitions in one tap to actual white workspace",()=>{
 for(const id of ["welcome-splash","welcome-start","auth-block"]){
  assert.match(page,new RegExp('id="'+id+'"'));
 }
 assert.match(page,/開始使用/);
 assert.match(page,/html\.slime-white/);
 assert.match(page,/--bg:#ffffff/);
 assert.match(page,/--paper:#ffffff/);
 assert.match(page,/document\.documentElement\.classList\.add\("slime-white"\)/);
 assert.match(page,/tg\.setBackgroundColor\?\.\("#ffffff"\)/);
 assert.match(page,/tg\.setHeaderColor\?\.\("#ffffff"\)/);
 assert.match(page,/setTab\("overview"\)/);
 assert.match(page,/void reload\(\)/);
 assert.match(page,/if\(!auth\)\s*\{\s*\$\("welcome-splash"\)\.hidden=true/);
 assert.match(page,/role="region" aria-label="Ceres Slime 歡迎畫面"/);
 assert.doesNotMatch(page,/localStorage\.|sessionStorage\.|document\.cookie\s*=/);
});
