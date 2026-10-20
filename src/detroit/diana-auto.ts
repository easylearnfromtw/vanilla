/** Diana's proactive chat policy and deterministic, local CREAM -> Retina workflow.
 * Proactive means every ordinary turn can be evaluated without requiring @Diana.
 * It never authorizes cloud transmission, destructive mutations, background jobs or arbitrary code.
 */
import {chooseDianaTool,type DianaContext,type DianaDecision} from "./diana";
import type {CreamResult} from "../cream/core";
import type {RetinaFormat,RetinaRequest} from "./retina";

const ACTION=/(?:製作|產生|生成|建立|匯出|下載|輸出|做成|轉成|製成|幫我做|幫我製作)/i;
const DOC=/(?:PDF|DOCX|PPTX|WORD\s*文件|Word檔|簡報檔)/i;
/** Only intercept high-confidence tool actions; questions and quotations remain conversational. */
export function proposeProactiveDiana(question:string,ctx:DianaContext):DianaDecision|null{
 const q=question.trim();
 if(!q||q.length>16000||/^(?:請問|為什麼|什麼是|如何|怎麼|解釋|比較|是否|能不能|可以嗎)/.test(q))return null;
 // User-provided writing/source text must never be construed as new executable instructions.
 if(/^(?:【待潤稿原文】|以下是原文|原文如下|引用：|引述：|>)/.test(q))return null;
 const doc=DOC.test(q)&&ACTION.test(q);
 const visual=/(?:設計|製作|建立|生成|畫一張|幫我做).{0,40}(?:海報|廣告版面|品牌主視覺|AI\s*圖片|AI\s*圖像)/i.test(q);
 const email=/(?:設計|製作|建立|匯出|編輯).{0,40}(?:電子報|郵件模板|EDM|newsletter|Email\s*Studio)/i.test(q);
 const rewrite=/(?:幫我|請|麻煩).{0,10}(?:潤稿|去除AI腔|自然化這段)/i.test(q);
 const stats=/(?:幫我|請|麻煩).{0,12}(?:分析|統計|繪製).{0,35}(?:CSV|數據|圖表|資料集|折線圖|圓餅圖)/i.test(q);
 const code=/(?:幫我|請|麻煩|我要).{0,12}(?:修改|修復|重構|新增|實作).{0,45}(?:Vanilla|GitHub|原始碼|程式碼|bug)/i.test(q);
 if(!(doc||visual||email||rewrite||stats||code))return null;
 const choice=chooseDianaTool(q,ctx);
 // Keep ordinary LLM chat as-is if Diana cannot identify a concrete tool.
 if(choice.tool==="merlin"||choice.tool==="diana")return null;
 // In private mode a web-only task must remain in the regular local model route.
 if(ctx.privateMode&&choice.tool==="scouts")return null;
 return choice;
}
/** Exporting requires explicit user intent, never simply mentioning PDF in quoted data. */
export function requestedDianaFormat(question:string):RetinaFormat|null{
 if(!ACTION.test(question)||!DOC.test(question))return null;
 if(/\bPPTX\b|簡報檔/i.test(question))return "pptx";
 if(/\bDOCX\b|WORD\s*文件|Word檔/i.test(question))return "docx";
 return /\bPDF\b/i.test(question)?"pdf":null;
}
/** Build a document only from data that CREAM actually computed. */
export function composeDianaCreamDocument(question:string,result:CreamResult):RetinaRequest|null{
 const format=requestedDianaFormat(question);
 if(!format||!result.metrics.length)return null;
 const clean=(v:string)=>v.replace(/[\r\n]+/g," ").replace(/[<>]/g,"").slice(0,180);
 const n=(v:number)=>Number.isFinite(v)?Number(v.toFixed(4)).toLocaleString("zh-TW"):"未能計算";
 const body=[
  "# CREAM 確定性統計報告",
  "資料來源："+clean(result.source),
  "觀測筆數："+result.rowCount+"；欄位："+result.columns.map(clean).join("、"),
  "# 描述性統計",
  ...result.metrics.flatMap(m=>[
   "## "+clean(m.key),
   "有效筆數："+m.n+"；缺失："+m.missing,
   "總和："+n(m.sum)+"；平均："+n(m.mean)+"；中位數："+n(m.median),
   "最小："+n(m.min)+"；最大："+n(m.max)+"；樣本標準差："+(m.sampleStdDev===null?"資料不足":n(m.sampleStdDev))
  ]),
  "# 觀察與限制",
  ...(result.insights?.length?result.insights.map(x=>"- "+clean(x)):["- 僅整理描述性統計，不能據此推論因果。"]),
  ...result.warnings.map(x=>"- 資料品質："+clean(x)),
  "圖表建議："+result.chartKind+"（此文件僅含統計文字，沒有嵌入聊天圖表）",
  "本報告由已完成的 CREAM 程式結果直接產生；沒有補造未提供的研究結論或引用。"
 ].join("\n");
 return {format,title:"CREAM_數據分析報告",body};
}


/** Native output handoff: the model drafts content; Detroit does the actual local export.
 * Mentioning a format in a question or quotation never triggers a download.
 */
export type DianaNativeArtifact=
 |{capability:"retina";format:RetinaFormat;title:string}
 |{capability:"janus";kind:"invitation"|"newsletter"|"announcement";title:string;brand:string};
export function planDianaNativeArtifact(request:string):DianaNativeArtifact|null{
 const q=request.trim();
 if(!q||q.length>1800||/^(?:什麼是|如何|怎麼|為什麼|請問|可不可以|能不能|引用：|引述：|原文如下|以下是原文|>)/.test(q))return null;
 if(/(?:不要|不必|無需|不需要).{0,8}(?:匯出|下載|產生檔案|輸出檔案)/.test(q))return null;
 const format=requestedDianaFormat(q);
 if(format)return {capability:"retina",format,title:q.replace(/[\\/:*?"<>|]/g," ").slice(0,54)||"Detroit 文件"};
 if(/(?:幫我|請|我要|製作|設計|建立|生成|產生)/.test(q)&&/(?:製作|設計|建立|生成|產生|匯出)/.test(q)&&
   /(?:電子報|郵件模板|EDM|newsletter|HTML\s*(?:電子郵件|Email))/i.test(q)&&
   !/(?:寄送|發送|傳送|寄給|群發|批次寄信)/.test(q)){
  const kind=/(?:邀請函|邀請信|invitation)/i.test(q)?"invitation":/(?:公告|announcement)/i.test(q)?"announcement":"newsletter";
  const brand=/(?:欣緯生醫|Sign Well|SignWell)/i.test(q)?"欣緯生醫":"VANILLA";
  return {capability:"janus",kind,title:q.slice(0,80),brand};
 }
 return null;
}
