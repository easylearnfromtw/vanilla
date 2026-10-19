import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const content = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("衞國: uses a dedicated Google ID token, never a Drive access token or admin key", () => {
 const auth = content("../src/vault/google-auth.ts");
 const api = content("../src/weiguo/api.ts");
 const panel = content("../src/weiguo/WeiGuo.tsx");
 assert.match(auth, /accounts\.id\.initialize/);
 assert.match(auth, /response\.credential/);
 assert.match(api, /\/v1\/auth\/google/);
 assert.match(api, /credential:googleIdentityToken/);
 assert.match(api, /\/v1\/family\/tasks/);
 assert.doesNotMatch(api, /WEIGUO_ADMIN_TOKEN|localStorage\.setItem|sessionStorage\.setItem/);
 assert.doesNotMatch(panel, /WEIGUO_ADMIN_TOKEN|管理金鑰.*input/);
 assert.match(api, /reply\.email\.trim\(\)\.toLowerCase\(\)!==drive\.email/);
});

test("衞國: backend accepts only an HTTPS origin and keeps family token in memory", () => {
 const api = content("../src/weiguo/api.ts");
 assert.match(api, /url\.protocol!=="https:"/);
 assert.match(api, /credentials:"omit"/);
 assert.match(api, /referrerPolicy:"no-referrer"/);
 assert.match(api, /let auth:/);
 assert.match(api, /vanilla-drive-disconnected/);
 assert.doesNotMatch(api, /Bearer "\+session\.token/);
});

test("衞國: GitHub Pages receives only a public URL, never server secrets", () => {
 const pages=content("../.github/workflows/pages.yml");
 const compose=content("../services/weiguo/docker-compose.example.yml");
 assert.match(pages, /VITE_WEIGUO_API_URL: \$\{\{ vars\.WEIGUO_API_URL \}\}/);
 assert.doesNotMatch(pages, /WEIGUO_SESSION_SECRET:|WEIGUO_ADMIN_TOKEN:/);
 assert.match(compose, /WEIGUO_FAMILY_ACL_JSON/);
 assert.match(compose, /WEIGUO_GOOGLE_CLIENT_ID/);
 assert.match(compose, /WEIGUO_SESSION_SECRET/);
});
