import {gdeltNewsUrl,parseLiveNews,type NewsMarket} from "../bluestar/news-source";
/** Explicit only: source search routed from chat to 柳岸書城／霞海書院／藍星報社.
 * Public metadata is not evidence of having read the full book or paper.
 */
type LibraryRoute={kind:"book"|"paper"|"news";query:string};
export function parseKnowledgeLookup(text:string):LibraryRoute|null{
 const s=text.trim();
 const match=s.match(/^(?:請?幫?我?(?:查詢|搜尋|查找|查|找)\s*)?(柳岸書城|霞海書院|藍星報社)\s*[：:\s]+\s*(.{2,120})$/);
 if(!match)return null;
 return {kind:match[1]==="柳岸書城"?"book":match[1]==="霞海書院"?"paper":"news",query:match[2].trim()};
}
function validHttp(value:unknown):string|null{
 if(typeof value!=="string"||value.length>1500)return null;
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
async function getJson(url:string,signal?:AbortSignal):Promise<unknown>{
 const resp=await fetch(url,{signal,headers:{"Accept":"application/json"}});
 if(!resp.ok)throw Error("來源索引暫不可用（HTTP "+resp.status+"）");
 return resp.json();
}
export async function findKnowledgeSources(route:LibraryRoute,signal?:AbortSignal):Promise<string>{
 if(route.kind==="news"){
  // Exact source request only; a newsroom metadata lookup is NOT a model update.
  const m=route.query.match(/^(台灣|臺灣|中國|日本|韓國|美國)\s*(.*)$/);
  const countries:Record<string,NewsMarket>={"台灣":"TW","臺灣":"TW","中國":"CN","日本":"JP","韓國":"KR","美國":"US"};
  const market=m?countries[m[1]]:"TW";
  const keyword=(m?.[2]||route.query).trim();
  const url=gdeltNewsUrl(market,"general",keyword);
  const data=await getJson(url,signal);
  const articles=parseLiveNews(data,market).slice(0,6).map(x=>({
   title:x.title,source_url:x.url,publisher:x.source,source_country:x.market,
   indexed_at:x.detectedAt,evidence_scope:"metadata-only"
  }));
  if(!articles.length)return "藍星報社尚無符合條件、可回溯原始媒體的新聞標題。";
  return "以下為**藍星報社**即時檢索所得新聞來源資料。時間是 GDELT 的收錄時間，尚未取得原新聞全文，不可將標題視為報導內容已證實，也不代表 OCTUBER 已以該新聞訓練。"+
   "\n\n~~~newsrefs\n"+JSON.stringify({protocol:"bluestar-newsrefs-v1",origin:"gdelt-article-metadata",articles})+"\n~~~";
 }
 if(route.kind==="book"){
  const query="https://openlibrary.org/search.json?q="+encodeURIComponent(route.query)+"&limit=6&fields=key,title,author_name,first_publish_year,isbn";
  const raw=await getJson(query,signal) as {docs?:Array<{key?:string;title?:string;author_name?:string[];isbn?:string[]}>};
  const books=(Array.isArray(raw.docs)?raw.docs:[]).flatMap(d=>{
   if(typeof d.key!=="string"||!/^\/works\/OL\d+W$/.test(d.key)||typeof d.title!=="string")return [];
   const original="https://openlibrary.org"+d.key;
   const isbn=Array.isArray(d.isbn)?d.isbn.find(n=>/^(?:[0-9]{13}|[0-9]{9}[0-9X])$/.test(n)):null;
   return [{
     book_id:"meta:openlibrary:"+d.key.split("/").pop(),title:d.title,
     author:Array.isArray(d.author_name)?d.author_name.slice(0,3).join("、"):"",
     isbn:isbn||null,source_url:original,source_scope:"catalogue-dataset",
     availability:"metadata-only",citation_scope:"catalogue-dataset-reference",
     evidence:null
   }];
  });
  if(!books.length)return "柳岸書城目前沒有找到可核實的書籍元資料。";
  return "以下為**柳岸書城**查得的公開書目，請查看真正作者和原始出處。這不是已讀取全文，不適合直接拿來聲稱書內結論。"+
    "\n\n~~~bookrefs\n"+JSON.stringify({protocol:"atuber-bookrefs-v1",origin:"local-index-exact-result",books})+"\n~~~";
 }
 const url="https://api.openalex.org/works?search.title_and_abstract="+encodeURIComponent(route.query)+"&per_page=6&filter=type:article";
 const raw=await getJson(url,signal) as {results?:Array<{
  id?:string;display_name?:string;publication_year?:number;doi?:string;
  authorships?:Array<{author?:{display_name?:string}}>;
  primary_location?:{source?:{display_name?:string};landing_page_url?:string};
 }>};
 const papers=(Array.isArray(raw.results)?raw.results:[]).flatMap(work=>{
  if(typeof work.id!=="string"||!/^https:\/\/openalex\.org\/W\d+$/.test(work.id)||!work.display_name)return [];
  const original=validHttp(work.doi)||validHttp(work.primary_location?.landing_page_url)||work.id;
  const authors=Array.isArray(work.authorships)?work.authorships.map(x=>x.author?.display_name).filter((x):x is string=>Boolean(x)).slice(0,5):[];
  return [{
    paper_id:work.id.split("/").pop(),title:work.display_name,authors,year:work.publication_year,
    doi:validHttp(work.doi),source_url:original,publisher:work.primary_location?.source?.display_name||"OpenAlex",
    evidence_scope:"metadata-only",priority:1
  }];
 });
 if(!papers.length)return "霞海書院暫時沒有查得可核實的論文元資料。";
 return "以下為**霞海書院**查得的論文元資料，來源索引不代表已審核研究方法或取得全文；個人健康、金融、投資建議需要更強證據。"+
   "\n\n~~~paperrefs\n"+JSON.stringify({protocol:"xiahai-paperrefs-v1",origin:"openalex-metadata-reviewed",papers})+"\n~~~";
}
