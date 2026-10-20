/** Veritas: deterministic fact-risk policy for Detroit.
 * This module never calls a model or network itself. Evidence is a source
 * *index*, not verified semantic truth; ungrounded exact claims fail closed.
 */
import type {IndexedPage} from "../search/search-evidence";
import {parseParamsB} from "../ai/model-profiles.ts";

export type FactRisk="none"|"stable"|"fresh"|"official";
export type FactRequest={risk:FactRisk;needsLiveSources:boolean;restrictTinyModel:boolean;reason:string};
export type FactEvidence={status:"official"|"index"|"missing";pages:IndexedPage[];reason:string};

const EXAMS=/(?:學測|學科能力測驗|分科測驗|統測|四技二專|(?:國中(?:教育)?)?會考)/i;
const EXAM_DATE=/(?:日期|時間|考期|考程|時程|日程|哪天|哪一天|何時|什麼時候|幾月|幾號|何日|開始|舉行|開考|考幾天|考試時間)/;
const FACT_REQUEST=/(?:什麼是|是什麼|是誰|誰是|幾月|幾號|何時|幾點|多少|哪一年|哪一天|哪天|何日|哪裡|何處|在哪|何時|為何|為什麼|日期|時間|時程|幾%|幾趴|費用|價格|排名|利率|股價|考試|公告|招生|資格|規定|法律|法規|比較|介紹|解釋|查詢|查一下|有沒有|有哪些|告訴我|請問|多久|最新|目前|今天|今年|明年|近期|最近)/i;
const LIVE_WORDS=/(?:今天|今日|現在|目前|最新|最近|近期|本週|本月|今年|明年|本季|現行|即時|最新消息|時事|202[5-9]\s*年)/;
const PUBLIC_FACTS=/(?:新聞|政策|法規|法律|規定|費用|價格|股價|行情|利率|匯率|物價|房價|油價|票價|薪資|報名|考試|時程|招生|學測|統測|分科|會考|公告|研究|文獻|指引|指南|醫學|健保|補助|截止|榜單|排名|選舉|天氣|氣溫|股市|財報|業績|人口|統計|更新|改變|調整|變動|變化|什麼時候|何時|幾月|幾號|時間)/i;
const OFFICIAL_FACTS=/(?:法規|法律|條文|生效|健保給付|法定|官方公告|報名日期|報名時間|考試日期|考試時間|考程|招生時程|錄取資格|PGY.*(?:招募|說明會|招生)|(?:指引|指南).*(?:最新|20\d{2})|(?:衛福部|教育部).*(?:公告|規定))/i;
const CREATIVE=/(?:幫我|請幫我|請你|可以幫我|我要).{0,16}(?:寫|改寫|翻譯|潤稿|發想|想個|創作|設計|生成|製作).{0,100}(?:文案|文章|故事|歌詞|邀請函|祝福|標語|內容|貼文|草稿|範例|海報|圖片)/i;
const NO_WEB=/(?:不要上網|不需搜尋|不需要網路|不要搜尋|不需網路|僅使用附件|只根據文件|只用本地|僅用本地|離線回答|不要查網路|不用查網路)/;

export function forbidsAutomaticWeb(question:string):boolean{return NO_WEB.test(question);}
export function isExamScheduleQuestion(question:string):boolean{return EXAMS.test(question)&&EXAM_DATE.test(question);}

/** Diana uses this for public factual questions. No private content is classified as a web request. */
export function classifyFactRequest(question:string):FactRequest{
 const q=question.trim();
 if(!q||q.length>3500||/^(?:【待潤稿原文】|以下是原文|原文如下|引用：|引述：|>|\x60\x60\x60)/.test(q)||CREATIVE.test(q))
  return {risk:"none",needsLiveSources:false,restrictTinyModel:false,reason:"使用者內容或創作任務"};
 if(isExamScheduleQuestion(q))
  return {risk:"official",needsLiveSources:true,restrictTinyModel:true,reason:"考試日程需要主管機關資料"};
 if(OFFICIAL_FACTS.test(q)&&FACT_REQUEST.test(q))
  return {risk:"official",needsLiveSources:true,restrictTinyModel:true,reason:"法規、官方時程或指引必須核對來源"};
 if(LIVE_WORDS.test(q)&&PUBLIC_FACTS.test(q))
  return {risk:"fresh",needsLiveSources:true,restrictTinyModel:true,reason:"近期或即時公共事實需要外部來源"};
 if(/(?:現在|目前).{0,32}(?:幾點|幾度|天氣|股價|匯率|時間)|(?:股價|匯率|天氣|價格).{0,12}(?:多少|幾點|最新|現在)/i.test(q))
  return {risk:"fresh",needsLiveSources:true,restrictTinyModel:true,reason:"即時數值需要外部來源"};
 // Ordinary factual recall is possible with a capable model but is not a safe
 // use for the default 0.5B on-device model.
 if(FACT_REQUEST.test(q)&&q.length<=600)
  return {risk:"stable",needsLiveSources:false,restrictTinyModel:true,reason:"一般知識問答需具備足夠推理與事實能力"};
 return {risk:"none",needsLiveSources:false,restrictTinyModel:false,reason:"一般聊天或任務"};
}

function officialExamDomain(question:string):string{
 return /(?:學測|學科能力測驗|分科測驗)/.test(question)?"ceec.edu.tw":
  /(?:統測|四技二專)/.test(question)?"tcte.edu.tw":"rcpet.edu.tw";
}
function examName(question:string):RegExp{
 return /(?:學測|學科能力測驗)/.test(question)?/(?:學測|學科能力測驗)/:
  /分科測驗/.test(question)?/分科測驗/:
  /(?:統測|四技二專)/.test(question)?/(?:統測|四技二專|統一入學測驗)/:/(?:教育會考|國中會考)/;
}
function taiwanYear(now:Date):number{
 try{return Number(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"numeric"}).format(now));}
 catch{return now.getFullYear();}
}
/** Schedule snippets must contain a date associated with an official exam source.
 * A date in a result TITLE alone, or a generic news result, is insufficient.
 */
export function officialExamPages(question:string,pages:IndexedPage[],now=new Date()):IndexedPage[]{
 if(!isExamScheduleQuestion(question))return [];
 const domain=officialExamDomain(question),exam=examName(question);
 const explicit=question.match(/20\d{2}/),base=taiwanYear(now);
 const year=explicit?Number(explicit[0]):/明年/.test(question)?base+1:/去年/.test(question)?base-1:base;
 const roc=String(year-1911);
 const yearPattern=new RegExp("(?:\\b"+year+"\\b|"+roc+"\\s*(?:學年度|年))");
 return pages.filter(page=>{
  let host="";
  try{host=new URL(page.url).hostname.toLowerCase();}catch{return false;}
  if(host!==domain&&!host.endsWith("."+domain))return false;
  const full=page.title+" "+page.excerpt;
  return exam.test(full)&&yearPattern.test(full)&&
   (exam.test(page.excerpt)||/(?:考試日期|考試期間|考試日程|應試日程|正式考程)/.test(page.excerpt))&&
   /\d{1,2}\s*月\s*\d{1,2}\s*日/.test(page.excerpt);
 });
}

/** Do not turn snippets (even Google-grounded snippets) into verified articles.
 * In v1 most live queries intentionally show an indexed source-only result.
 */
export function evaluateFactEvidence(question:string,pages:IndexedPage[],now=new Date()):FactEvidence{
 const plan=classifyFactRequest(question);
 if(!plan.needsLiveSources)return {status:"missing",pages:[],reason:"不需要強制線上查證"};
 if(isExamScheduleQuestion(question)){
  const official=officialExamPages(question,pages,now);
  return official.length?{status:"official",pages:official,reason:"取得相符考試、年度及日期的官方來源摘錄"}:
   {status:"missing",pages:[],reason:"沒有取得相符的主管考試機關日期來源"};
 }
 // Other topics need semantic verification and publication timestamps before
 // any specific answer can be marked verified. A search hit is merely an index.
 return pages.length?{status:"index",pages:pages.slice(0,4),reason:"已有可供使用者核對的網頁索引，尚未驗證細部事實"}:
  {status:"missing",pages:[],reason:"沒有取得可核對的網頁內容"};
}

export type RouteCandidate={source:string;model:string};
/** A tiny on-device model is for low-risk chat/writing, not factual authority.
 * This never promotes or sends data to a paid API; existing consent still applies.
 */
export function qualifiedFactModels<T extends RouteCandidate>(candidates:T[],plan:FactRequest):T[]{
 if(!plan.restrictTinyModel)return candidates;
 return candidates.filter(candidate=>candidate.source!=="local"||parseParamsB(candidate.model)>=1.2);
}
