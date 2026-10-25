/** CITYMUS public-catalog adapter. Never requests private playlists or tokens. */
export type CitymusTrack={
  id:string;title:string;artist:string;genre:string;license:string;sourceUrl:string|null;
  audioUrl:string|null;album:string;provider:"CITYMUS";
};
export type CitymusSearchResult={
  query:string;total:number;matched:number;fallback:boolean;tracks:CitymusTrack[];
  via:"api"|"public-catalog";attribution:{label:string;url:string;required:true};
};
const WEB="https://easylearnfromtw.github.io/musictown/";
const API=(import.meta.env?.VITE_CITYMUS_API_BASE||"https://citymus-production.vercel.app").replace(/\/+$/,"");
const ATTRIBUTION={label:"Powered by CITYMUS",url:WEB,required:true} as const;
const MOODS:Record<string,string[]>={
 "讀書":["study","focus","lofi","lo-fi","piano","ambient","calm"],
 "專注":["study","focus","ambient","piano","instrumental","calm"],
 "工作":["focus","jazz","lofi","ambient"],
 "睡前":["sleep","calm","ambient","quiet","relax","piano"],
 "放鬆":["relax","chill","ambient","lo-fi","lofi","soft"],
 "下雨":["rain","ambient","piano","lofi","lo-fi"],
 "開車":["rock","pop","synth","drive","road","night","city"],
 "運動":["sport","workout","energy","dance","edm","rock"],
 "跑步":["run","running","sport","energy","edm","dance"],
 "咖啡":["cafe","coffee","jazz","lounge","acoustic"],
 "夜晚":["night","jazz","ambient","lounge"],
 "爵士":["jazz","blues","swing"],
 "搖滾":["rock","indie"],
 "電子":["electronic","edm","synth","dance"],
 "台北":["taipei","taiwan"],"東京":["tokyo","japan"],"日本":["japan","japanese","tokyo"]
};
const KEYWORD=/(?:citymus|推薦.{0,24}(?:音樂|歌曲|歌單|幾首歌|首歌|好聽的歌)|(?:音樂|歌曲|歌單|歌手|專輯).{0,20}(?:推薦|查詢|搜尋|找|介紹)|(?:搜尋|查詢|找|想聽|播放|來點|聽點|放點|聽聽|給我).{0,18}(?:音樂|歌曲|歌單|首歌|這首歌)|(?:聽|找).{0,10}什麼歌|(?:推薦|找|查詢|搜尋|播放).{0,10}(?:爵士|搖滾|流行歌|嘻哈|電子樂|lo-?fi|jazz|rock|pop)|(?:適合|想要|來點).{0,22}(?:聽的音樂|聽的歌|背景音樂)|(?:這首歌|那首歌).{0,12}(?:叫什麼|歌手|是誰)|(?:歌手|藝人).{0,12}(?:有哪些歌|唱過什麼|的歌曲)|(?:音樂|歌曲)(?:推薦|查詢|搜尋)|^[/／](?:音樂|歌曲|music|citymus)(?:\s|$))/i;
const NON_SEARCH=/(?:製作|設計|建立|開發|部署|寫|編輯|生成|產生).{0,16}(?:音樂|歌曲|歌手|歌單).{0,8}(?:網站|程式|app|api|模型|海報|介面|報告)|(?:音樂|歌曲|歌手|歌單).{0,16}(?:產業|公司|股票|版權|著作權|法律|教學|歷史|理論|分析報告)/i;

/** Music queries are routed before general web search; ordinary music theory/news aren't hijacked. */
export function citymusIntent(question:string):boolean{
 const q=question.trim();
 if(q.length<2||q.length>220||NON_SEARCH.test(q)||/citymus.{0,20}(?:api|網站|部署|串接|資料庫|設定|整合|功能|後台)/i.test(q))return false;
 return KEYWORD.test(q)||/^(?:推薦音樂|推薦歌曲|找音樂|查音樂|音樂推薦|找歌|查歌|找歌手|查歌手|查專輯|歌單推薦|播放音樂|音樂搜尋|推薦幾首|音樂|歌曲|music|citymus)[！!。.?？\s]*$/i.test(q);
}
function text(v:unknown,max=160){return typeof v==="string"?v.trim().slice(0,max):"";}
function safeHttp(v:unknown){
 try {const u=new URL(text(v,1800));return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:null;}
 catch {return null;}
}
function normalizeTrack(v:unknown,i:number):CitymusTrack|null{
 if(!v||typeof v!=="object")return null;
 const t=v as Record<string,unknown>;
 const title=text(t.title||t.name||t.song||t.track);
 if(!title)return null;
 const genre=[t.genre,t.genres,t.mood,t.vibe,t.tags,t.theme,t.category,t.style,t.city]
   .flatMap(x=>Array.isArray(x)?x:x==null?[]:[x]).map(x=>text(x,120)).filter(Boolean).join(" · ");
 const rawAudio=safeHttp(t.audioUrl||t.audio_url||t.download||t.preview||t.audioSrc);
 const audioUrl=rawAudio&&/\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac)(?:[?#]|$)/i.test(rawAudio)?rawAudio:null;
 return {
  id:text(t.id||t.track_id,100)||"citymus-"+i,title,
  artist:text(t.artist||t.creator||t.author||t.performer)||"未標示作者",
  genre,license:text(t.license||t.licence,100),
  album:text(t.album),sourceUrl:safeHttp(t.sourceUrl||t.source_url||t.source||t.page||t.url||t.link),
  audioUrl,provider:"CITYMUS"
 };
}
function queryTerms(query:string):string[]{
 return query.toLowerCase().replace(/(推薦|音樂|歌曲|歌單|查詢|搜尋|找一下|找|想聽|播放|請|幫我|給我|一些|好聽|幾首|適合|的|citymus)/gi," ")
   .split(/[\s、，：。?？!！/]+/).filter(x=>x.length>1).slice(0,8);
}
function score(t:CitymusTrack,q:string):number{
 const words=queryTerms(q),title=t.title.toLowerCase(),artist=t.artist.toLowerCase(),genre=(t.genre+" "+t.album).toLowerCase();
 let n=0;
 if(title===q.toLowerCase().trim()||artist===q.toLowerCase().trim())n+=120;
 for(const term of words){if(title.includes(term))n+=45;if(artist.includes(term))n+=40;if(genre.includes(term))n+=16;}
 for(const [k,terms] of Object.entries(MOODS))if(q.includes(k))for(const term of terms){
  if(genre.includes(term))n+=8;if(title.includes(term))n+=4;
 }
 return n;
}
function isBroad(query:string){return /^(?:請|幫我|我想|我要|來點|給我|推薦|查詢|搜尋|想聽|一些|幾首|好聽|的|隨機|音樂|歌曲|歌單|找|播放|citymus|music|[，。！!?\s])+$/i.test(query);}
function jsonResult(payload:unknown,query:string):CitymusSearchResult{
 if(!payload||typeof payload!=="object")throw Error("CITYMUS 格式不正確");
 const p=payload as Record<string,unknown>;
 if(!Array.isArray(p.tracks))throw Error("CITYMUS 沒有傳回曲目");
 return {query,total:Number(p.total)||0,matched:Number(p.matched)||0,fallback:Boolean(p.fallback),
   tracks:p.tracks.map(normalizeTrack).filter((t):t is CitymusTrack=>Boolean(t)).slice(0,12),
   via:"api",attribution:ATTRIBUTION};
}
async function fetchWithTimeout(url:string,ms:number,signal?:AbortSignal):Promise<Response>{
 const ctl=new AbortController();
 const onAbort=()=>ctl.abort();
 signal?.addEventListener("abort",onAbort,{once:true});
 const timer=setTimeout(()=>ctl.abort(),ms);
 try {return await fetch(url,{signal:ctl.signal,headers:{Accept:"application/json"},cache:"no-store"});}
 finally {clearTimeout(timer);signal?.removeEventListener("abort",onAbort);}
}
/** Public database fallback keeps actual CITYMUS metadata, never synthetic track records. */
async function catalogFallback(query:string,signal?:AbortSignal):Promise<CitymusSearchResult>{
 // GitHub Pages publishes a compiled 4,500-track library, not /data/*.json.
 // Parse the known JSON assignment as data. Never eval or execute downloaded JavaScript.
 const res=await fetchWithTimeout(WEB+"citymus-library.js",10000,signal);
 if(!res.ok)throw Error("CITYMUS 公開曲庫 HTTP "+res.status);
 const js=await res.text(),prefix="window.CITYMUS_LIBRARY=";
 const begin=js.indexOf(prefix),end=js.indexOf(";\nwindow.CITYMUS_LIBRARY_REPORT=",begin);
 if(begin<0||end<0||end-begin>12000000)throw Error("CITYMUS 公開曲庫格式不正確");
 const values:unknown[]=JSON.parse(js.slice(begin+prefix.length,end));
 if(!Array.isArray(values)||!values.length)throw Error("CITYMUS 公開曲庫目前沒有可讀取曲目");
 const items=values.map(normalizeTrack).filter((t):t is CitymusTrack=>Boolean(t));
 const ranked=items.map(track=>({track,score:score(track,query)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 const broad=isBroad(query);
 return {query,total:items.length,matched:ranked.length,fallback:!ranked.length&&broad,
  tracks:(ranked.length?ranked.map(x=>x.track):broad?items:[]).slice(0,6),via:"public-catalog",attribution:ATTRIBUTION};
}
/** Empty result is a valid outcome. Failed connections report failure (never fabricate matches). */
export async function searchCitymus(query:string,signal?:AbortSignal):Promise<CitymusSearchResult>{
 const endpoint=API+"/api/search?q="+encodeURIComponent(query.trim().slice(0,180))+"&limit=6";
 try{
  const res=await fetchWithTimeout(endpoint,7000,signal);
  if(!res.ok)throw Error("CITYMUS API HTTP "+res.status);
  return jsonResult(await res.json(),query);
 }catch(error){
  if(signal?.aborted)throw error;
  try{return await catalogFallback(query,signal);}
  catch(fallback){throw new Error("CITYMUS 搜尋與公開曲庫均無法連線："+String(fallback instanceof Error?fallback.message:fallback));}
 }
}
