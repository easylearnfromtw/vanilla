/** User-visible, indexed provenance for web research; snippets are never
 * mislabeled as full article reading. No invented citations.
 */
export type IndexedPage={title:string;url:string;kind:"full"|"snippet";excerpt:string};
export function formatIndexedPages(pages:IndexedPage[]):string{
 if(!pages.length)return "沒有成功取得可核對的網站內容，不能提供已讀取的網頁分析。";
 return "實際讀取／搜尋得到 "+pages.length+" 筆網站索引：\n"+
  pages.map((p,i)=>"["+(i+1)+"] "+p.title+
   "\n網址："+p.url+
   "\n資料型態："+(p.kind==="full"?"已取得公開正文":"僅有搜尋結果摘要（未讀取全文）")+
   "\n擷取重點："+p.excerpt.replace(/\s+/g," ").trim().slice(0,650)).join("\n\n")+
  "\n\n以上只是已取得的資料摘錄；沒有連線至 AI 模型時不會冒充語意綜述。";
}
export function implicitResearchQuery(text:string):string|null{
 const q=text.trim();
 if(q.length<8||q.length>200||/https?:\/\//i.test(q))return null;
 if(/(?:不要上網|不需搜尋|不需要網路|僅使用附件|只根據文件)/.test(q))return null;
 if(/(?:現在|最近|最新|今日|今天|本週|2026年).{0,60}(?:新聞|政策|法規|行情|價格|發展|研究|公告|資料|趨勢|更新)|(?:有沒有|有哪些|查一下|幫我找).{0,60}(?:最新研究|官方公告|新聞來源|網站資料)/.test(q))return q;
 return null;
}
