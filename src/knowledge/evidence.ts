/** Evidence contracts for 柳岸書城 and 霞海書院.
 * A house brand is an INDEX, never the author, publisher or original evidence.
 */
export type EvidenceKind="book"|"paper";
export type EvidenceTier="metadata"|"abstract"|"reviewed-fulltext"|"reviewed-finding";
export type SourceRecord={
 id:string;kind:EvidenceKind;title:string;authors:string[];
 originalUrl:string;sourceName:string;year?:number;
 isbn?:string;doi?:string;openAccess?:boolean;
 tier:EvidenceTier;verified:boolean;description?:string;
 institutionRank?:number;expertReviewed?:boolean;
};
export const BRAND={book:"柳岸書城",paper:"霞海書院"} as const;
export const INSTITUTION_POLICY=[
 {end:100,weight:5},{end:300,weight:4},{end:500,weight:3},{end:700,weight:2},
] as const;
export function citationPriority(rank?:number,expertReviewed=false):number{
 if(expertReviewed)return 5;
 if(typeof rank!=="number"||!Number.isInteger(rank)||rank<1)return 1;
 return INSTITUTION_POLICY.find(x=>rank<=x.end)?.weight??1;
}
export function validSourceUrl(candidate:unknown):string|null{
 if(typeof candidate!=="string"||candidate.length>1800)return null;
 try{
  const u=new URL(candidate);
  return u.protocol==="https:"&&!u.username&&!u.password?u.href:null;
 }catch{return null;}
}
export function attribution(record:SourceRecord):string{
 const brand=BRAND[record.kind];
 const author=record.authors.filter(Boolean).slice(0,3).join("、")||"作者待核對";
 return "引用自"+brand+"（來源索引）｜"+author+"，《"+record.title+"》"+
   (record.year?"，"+record.year:"")+"｜原始出處："+record.sourceName;
}
export function evidenceLabel(tier:EvidenceTier):string{
 if(tier==="metadata")return "只核對書目／論文元資料，不能據此聲稱理解全文";
 if(tier==="abstract")return "論文摘要，尚未核對全文結果";
 if(tier==="reviewed-fulltext")return "已審核可用全文，仍需確認推論與適用範圍";
 return "已有人工審核研究發現與引文";
}
export function canSupportAdvice(record:SourceRecord):boolean{
 return record.verified&&(record.tier==="reviewed-finding"||record.tier==="reviewed-fulltext");
}
export const BOOK_SEEDS:SourceRecord[]=[
 {id:"pg-3300",kind:"book",title:"An Inquiry into the Nature and Causes of the Wealth of Nations",
  authors:["Adam Smith"],sourceName:"Project Gutenberg",year:1776,
  originalUrl:"https://www.gutenberg.org/ebooks/3300",tier:"reviewed-fulltext",verified:true,
  description:"關於分工、生產力與市場交換的古典經濟學著作。已建立原文檢索試點；不代表具有現代投資策略證據。"},
 {id:"pg-1232",kind:"book",title:"The Prince（W. K. Marriott 英譯）",
  authors:["Niccolò Machiavelli","W. K. Marriott（譯）"],sourceName:"Project Gutenberg",
  originalUrl:"https://www.gutenberg.org/ebooks/1232",tier:"reviewed-fulltext",verified:true,
  description:"政治權力、統治與歷史情境的古典著作。版本與譯者需連同原始來源核對。"}
];
/** Do not convert metadata/abstract into a confident consumer recommendation. */
export function consumerGuidance(records:SourceRecord[],question:string){
 const approved=records.filter(canSupportAdvice);
 const unverified=records.filter(x=>!canSupportAdvice(x));
 return {
  question,knowledgeSuitableForAdvice:approved.length>0,
  evidenceCount:approved.length,candidatesOnly:unverified.length,
  systemGuidance:"使用繁體中文，先解釋可核對的專業機制、必要條件與反例，再給有條件的建議；不得將書目、摘要或相關性分數說成經過驗證的結論。每一項實證主張附原始作者及 URL；沒有足夠證據則明說不知道。金融建議說明風險、時間區間與個人條件；健康建議避免取代臨床判斷。只使用合法範圍內必要的短引文，用自己的話概括，不長篇轉載書籍或論文。"
 };
}
