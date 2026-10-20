/** User-visible, indexed provenance for web research; snippets are never
 * mislabeled as full article reading. No invented citations.
 */
import {classifyFactRequest} from "../detroit/veritas-gate.ts";
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
 if(q.length<4||q.length>300||/https?:\/\//i.test(q))return null;
 // Do not leak pasted source text or opt-out requests to external search providers.
 if(/(?:不要上網|不需搜尋|不需要網路|不要搜尋|僅使用附件|只根據文件|只用本地|離線回答)/.test(q))return null;
 if(/^(?:【待潤稿原文】|以下是原文|原文如下|引用：|引述：|>)/.test(q))return null;
 // Veritas flags short exam questions and other high-risk facts before a small LLM.
 if(classifyFactRequest(q).needsLiveSources)return q;
 // Requests for verifiable online facts should work without requiring "/搜尋".
 if(/(?:現在|目前|最近|近期|最新|今日|今天|本週|今年|明年|20\d{2}年).{0,90}(?:新聞|政策|法規|指引|指南|行情|價格|發展|研究|文獻|公告|資料|趨勢|更新|招募|時程|比較|規定)|(?:有沒有|有哪些|查一下|幫我找|請查).{0,90}(?:最新研究|最新文獻|官方公告|新聞來源|網站資料)/i.test(q))return q;
 if(/(?:依據|根據|參考|按照).{0,24}(?:最新|近期|官方|公開).{0,18}(?:資料|文獻|指引|規範|公告|網站|來源)/i.test(q))return q;
 if(/^(?:(?:請|幫我|可以幫我|請你|麻煩你)\s*)?(?:查詢|檢索|找一下|幫我找出|幫我看有沒有)\s*.{4,}/i.test(q))return q;
 return null;
}
