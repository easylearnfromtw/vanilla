/* App-shell cache only. WebLLM handles its own model artifacts. */
const CACHE_NAME="vanilla-shell-v1";
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
  event.respondWith(fetch(request).then(response=>{
   if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,clone)));}
   return response;
  }).catch(async()=>await caches.match(request)||await caches.match(ROOT)||Response.error()));
  return;
 }
 if(!/\.(?:js|css|png|jpg|jpeg|svg|ico|webmanifest|woff2?)(?:\?|$)/i.test(url.pathname+url.search))return;
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
  if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,clone)));}
  return response;
 })));
});
