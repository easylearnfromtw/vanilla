/** Pure helpers for non-destructive PWA release detection and cache-busted navigation. */
export function publishedBuild(payload:unknown):string|null{
 if(!payload||typeof payload!=="object"||Array.isArray(payload))return null;
 const build=(payload as {build?:unknown}).build;
 if(typeof build!=="string")return null;
 const normalized=build.trim();
 return normalized&&normalized.length<=128&&/^[A-Za-z0-9._-]+$/.test(normalized)?normalized:null;
}

/** Changing the navigation URL bypasses stale document cache without deleting local data. */
export function updateNavigationUrl(currentUrl:string,build:string,timestamp:number):string{
 const url=new URL(currentUrl);
 url.searchParams.set("vanilla_build",build);
 url.searchParams.set("vanilla_refresh",String(Math.floor(timestamp)));
 return url.toString();
}