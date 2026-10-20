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
/** Exam schedules are external facts: the on-device model must not invent dates.
 * Keep this deterministic; it runs before Scouts and never sends private content.
 */
export function requiresVerifiedExamSchedule(question:string):boolean{
 const q=question.trim();
 return /(?:學測|學科能力測驗|分科測驗|統測|四技二專|國中(?:教育)?會考)/.test(q)&&
  /(?:日期|時間|考期|考程|時程|日程|哪天|哪一天|何時|什麼時候|幾月|幾號|何日|開始|舉行|開考|考幾天)/.test(q);
}

/** A search hit is not proof. Demand an official domain, relevant year,
 * matching exam and concrete calendar date before handing off to synthesis.
 * Official snippets can serve as evidence but must remain labeled as snippets.
 */
export function hasOfficialExamScheduleEvidence(question:string,pages:IndexedPage[],now=new Date()):boolean{
 if(!requiresVerifiedExamSchedule(question))return true;
 const subject=/(?:學測|學科能力測驗|分科測驗)/.test(question)?"ceec":
  /(?:統測|四技二專)/.test(question)?"tcte":"cap";
 const domain=subject==="ceec"?"ceec.edu.tw":subject==="tcte"?"tcte.edu.tw":"rcpet.edu.tw";
 const exam=subject==="ceec"?/(?:學測|學科能力測驗|分科測驗)/:
  subject==="tcte"?/(?:統測|四技二專|統一入學測驗)/:/(?:教育會考|國中會考)/;
 const explicit=question.match(/20\d{2}/);
 const currentYear=now.getFullYear();
 const year=explicit?Number(explicit[0]):/明年/.test(question)?currentYear+1:/去年/.test(question)?currentYear-1:currentYear;
 const schoolYear=String(year-1911);
 const yearSignal=new RegExp("(?:\\b"+year+"\\b|"+schoolYear+"\\s*(?:學年度|年))");
 return pages.some(page=>{
  let host="";
  try{host=new URL(page.url).hostname.toLowerCase();}catch{return false;}
  if(host!==domain&&!host.endsWith("."+domain))return false;
  const text=(page.title+" "+page.excerpt).slice(0,9000);
  // Dates in unrelated navigation, publication stamps or adjacent exams
  // are not adequate schedule evidence. Demand explicit exam/schedule context
  // in the excerpt itself (not merely its result title).
  const excerpt=page.excerpt.slice(0,8500);
  const scheduleContext=exam.test(excerpt)||/(?:考試日期|考試期間|考試日程|應試日程|正式考程)/.test(excerpt);
  return exam.test(text)&&yearSignal.test(text)&&scheduleContext&&/\d{1,2}\s*月\s*\d{1,2}\s*日/.test(excerpt);
 });
}

export function implicitResearchQuery(text:string):string|null{
 const q=text.trim();
 if(q.length<4||q.length>300||/https?:\/\//i.test(q))return null;
 // Do not leak pasted source text or opt-out requests to external search providers.
 if(/(?:不要上網|不需搜尋|不需要網路|不要搜尋|僅使用附件|只根據文件|只用本地|離線回答)/.test(q))return null;
 if(/^(?:【待潤稿原文】|以下是原文|原文如下|引用：|引述：|>)/.test(q))return null;
 // Short questions such as「今年學測時間」also require live evidence.
 if(requiresVerifiedExamSchedule(q))return q;
 // Requests for verifiable online facts should work without requiring "/搜尋".
 if(/(?:現在|目前|最近|近期|最新|今日|今天|本週|今年|明年|20\d{2}年).{0,90}(?:新聞|政策|法規|指引|指南|行情|價格|發展|研究|文獻|公告|資料|趨勢|更新|招募|時程|比較|規定)|(?:有沒有|有哪些|查一下|幫我找|請查).{0,90}(?:最新研究|最新文獻|官方公告|新聞來源|網站資料)/i.test(q))return q;
 if(/(?:依據|根據|參考|按照).{0,24}(?:最新|近期|官方|公開).{0,18}(?:資料|文獻|指引|規範|公告|網站|來源)/i.test(q))return q;
 if(/^(?:(?:請|幫我|可以幫我|請你|麻煩你)\s*)?(?:查詢|檢索|找一下|幫我找出|幫我看有沒有)\s*.{4,}/i.test(q))return q;
 return null;
}
