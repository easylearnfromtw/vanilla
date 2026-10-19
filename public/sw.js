/* App-shell cache only. WebLLM handles its own model artifacts. */
const CACHE_NAME="vanilla-shell-v5";
const ROOT=self.registration.scope;
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.add(ROOT)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("vanilla-shell-")&&key!==CACHE_NAME).map(key=>caches.delete(key)))),
  self.clients.claim()
 ]));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin||!url.href.startsWith(ROOT))return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(new Request(request,{cache:"no-store"})).then(response=>{
   if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,clone)));}
   return response;
  }).catch(async()=>await caches.match(request)||await caches.match(ROOT)||Response.error()));
  return;
 }
 if(!/\.(?:js|css|png|jpg|jpeg|svg|ico|webmanifest|woff2?)(?:\?|$)/i.test(url.pathname+url.search))return;
 // Network-first for compiled scripts/styles, offline cache fallback. Versioned
 // build chunks must never be permanently trapped behind an older PWA shell.
 const critical=/\.(?:js|css)(?:\?|$)/i.test(url.pathname+url.search);
 if(critical){
  event.respondWith(fetch(new Request(request,{cache:"no-store"})).then(response=>{
   if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,clone)));}
   return response;
  }).catch(async()=>await caches.match(request)||Response.error()));
  return;
 }
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
  if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,clone)));}
  return response;
 })));
});
self.addEventListener("message",event=>{
 if(event.data&&event.data.type==="SKIP_WAITING")void self.skipWaiting();
});
