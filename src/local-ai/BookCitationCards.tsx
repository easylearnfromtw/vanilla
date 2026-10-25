import "./book-citations.css";
import {useState} from "react";

export type AtuberBookResult={
 book_id:string;title:string;author?:string|null;isbn?:string|null;
 topic?:string|null;score?:number;source_url?:string;
 source_scope?:"catalogue-dataset"|"verified-book-edition";
 citation_scope?:"catalogue-dataset-reference"|"original-text-passage";
 availability?:"metadata-only"|"rights-reviewed-fulltext";
 cover?:{image_url:string;image_source:string;image_lookup_url:string}|null;
 evidence?:{chunk_id:string;offset:number;excerpt:string;content_sha256?:string}|null;
};
const MAX_CARDS=8;
function publicUrl(url:unknown):string|null{
 if(typeof url!=="string"||url.length>1500)return null;
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||parsed.username||parsed.password)return null;
  return url;
 }catch{return null;}
}
function isbnCover(book:AtuberBookResult){
 const isbn=typeof book.isbn==="string"?book.isbn.replace(/[^0-9X]/gi,""):"";
 if(!/^(?:[0-9]{13}|[0-9]{9}[0-9X])$/.test(isbn))return null;
 // Not a bulk scrape: one cover is loaded only when this citation is displayed.
 return {
  img:"https://covers.openlibrary.org/b/isbn/"+isbn+"-M.jpg?default=false",
  source:"https://openlibrary.org/isbn/"+isbn,
 };
}
export function parseBookCitationPayload(source:string):AtuberBookResult[]|null{
 if(source.length>85000)return null;
 let obj:unknown;
 try{obj=JSON.parse(source);}catch{return null;}
 if(!obj||typeof obj!=="object")return null;
 const record=obj as Record<string,unknown>;
 if(record.protocol!=="atuber-bookrefs-v1"||record.origin!=="local-index-exact-result"||!Array.isArray(record.books))return null;
 const cards:AtuberBookResult[]=[];
 for(const raw of record.books.slice(0,MAX_CARDS)){
  if(!raw||typeof raw!=="object")continue;
  const b=raw as Record<string,unknown>;
  if(typeof b.book_id!=="string"||typeof b.title!=="string"||b.title.length>360
     ||!b.book_id.startsWith("meta:")&&!b.book_id.startsWith("full:"))continue;
  const sourceUrl=publicUrl(b.source_url);
  if(!sourceUrl)continue;
  const isFullText=b.citation_scope==="original-text-passage"&&b.availability==="rights-reviewed-fulltext";
  const ev=b.evidence;
  const validEvidence=isFullText&&ev&&typeof ev==="object"&&
    typeof (ev as Record<string,unknown>).chunk_id==="string"&&
    typeof (ev as Record<string,unknown>).excerpt==="string";
  cards.push({
   book_id:b.book_id,title:b.title,
   author:typeof b.author==="string"?b.author.slice(0,240):undefined,
   isbn:typeof b.isbn==="string"?b.isbn:undefined,
   topic:typeof b.topic==="string"?b.topic:undefined,
   source_url:sourceUrl,
   source_scope:b.source_scope==="verified-book-edition"?"verified-book-edition":"catalogue-dataset",
   availability:isFullText?"rights-reviewed-fulltext":"metadata-only",
   citation_scope:validEvidence?"original-text-passage":"catalogue-dataset-reference",
   evidence:validEvidence?{
    chunk_id:(ev as Record<string,string>).chunk_id,
    excerpt:(ev as Record<string,string>).excerpt.slice(0,400),
    offset:Number((ev as Record<string,unknown>).offset)||0,
   }:null,
  });
 }
 return cards.length?cards:null;
}
function BookCard({book}:{book:AtuberBookResult}){
 const cover=isbnCover(book);
 const [coverMissing,setCoverMissing]=useState(false);
 const url=publicUrl(book.source_url);
 const bookIsFullText=book.citation_scope==="original-text-passage"&&Boolean(book.evidence);
 return <article className="atuber-book-card">
   <div className="atuber-book-cover">
    {cover&&!coverMissing?<img loading="lazy" decoding="async"
       src={cover.img} alt={"《"+book.title+"》封面（Open Library）"}
       onError={()=>setCoverMissing(true)}/>:<span aria-label="無可用封面">無封面</span>}
   </div>
   <div className="atuber-book-detail">
    <div className="atuber-book-title">{book.title}</div>
    {book.author&&<div className="atuber-book-author">{book.author}</div>}
    <small>{bookIsFullText?"附原文節錄（請核對來源）":"僅書目，尚無全文證據"}</small>
    {book.evidence&&bookIsFullText&&<blockquote className="atuber-book-excerpt">
      {book.evidence.excerpt}
     </blockquote>}
    <div className="atuber-book-links">
     {url&&<a href={url} target="_blank" rel="noopener noreferrer">
       {bookIsFullText?"閱讀來源":"查看書目資料來源"}</a>}
     {cover&&<a href={cover.source} target="_blank" rel="noopener noreferrer">Open Library 封面資訊</a>}
    </div>
   </div>
  </article>;
}
export default function BookCitationCards({books}:{books:AtuberBookResult[]}){
 return <section className="atuber-book-citations" aria-label="書籍引用與封面">
  <h4>相關書籍與出處</h4>
  <p>封面依 ISBN 即時取得。卡片來自回答提供的結構化資料，並非自動完成獨立查證；請點開原始來源確認書目、版次與引文。</p>
  <div className="atuber-book-grid">
   {books.slice(0,MAX_CARDS).map(b=><BookCard key={b.book_id} book={b}/>)}
  </div>
  <small>封面提供：Open Library。圖片與書目可能分屬不同版本，不以封面作為全文證據。</small>
 </section>;
}
