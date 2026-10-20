import test from "node:test";
import assert from "node:assert/strict";
import {publishedBuild,updateNavigationUrl} from "../src/pwa/update-version.ts";
import {readFileSync} from "node:fs";
const source=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");

test("only accept a valid published build value",()=>{
 assert.equal(publishedBuild({build:" 2026.10.19.21-pwa-update-check "}),"2026.10.19.21-pwa-update-check");
 for(const input of [null,[],{},"v1",{build:42},{build:""},{build:"<script>"},{build:"a".repeat(129)}])assert.equal(publishedBuild(input),null);
});

test("cache-busted update URLs stay on the same page and do not wipe state",()=>{
 const result=new URL(updateNavigationUrl("https://easylearnfromtw.github.io/vanilla/?tab=chat#top","2026.10.19.21-pwa-update-check",123456));
 assert.equal(result.pathname,"/vanilla/");
 assert.equal(result.searchParams.get("tab"),"chat");
 assert.equal(result.searchParams.get("vanilla_build"),"2026.10.19.21-pwa-update-check");
 assert.equal(result.searchParams.get("vanilla_refresh"),"123456");
 assert.equal(result.hash,"#top");
});

test("PWA notice includes manual diagnostics and never deletes private local data",()=>{
 const view=source("src/pwa/PWAUpdateNotice.tsx");
 assert.match(view,/檢查版本/);
 assert.match(view,/線上 \{availableBuild\}/);
 assert.match(view,/location\.replace\(updateNavigationUrl/);
 assert.match(view,/cache:"no-store"/);
 assert.doesNotMatch(view,/\.unregister\(|caches\.delete\(|indexedDB\.deleteDatabase\(|localStorage\.clear\(/);
});
test("release diagnostics are accessible from system settings without opening chat tools",()=>{
 const settings=source("src/settings/SettingsPage.tsx");
 assert.match(settings,/import PWAUpdateNotice/);
 assert.match(settings,/<div className="settings-pwa-update"><PWAUpdateNotice\/>/);
 assert.match(settings,/id="system"/);
});

test("PWA version manifest and compiled build identifier stay aligned",()=>{
 const manifest=JSON.parse(source("public/version.json"));
 assert.equal(publishedBuild(manifest),manifest.build);
 assert.ok(source("src/version.ts").includes('VANILLA_BUILD="'+manifest.build+'"'));
});
