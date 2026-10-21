/** GPT-authored SYNTHETIC routing sanity fixtures, not real user questions.
 * No teacher model was trained, no human benchmark was independently validated,
 * and no accuracy figure here measures general AI quality.
 *
 * "abstain" means no safe single specialist is determined by this tiny
 * lexical+geometric projection. A real model and Diana permission checks
 * must still handle the user request.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {planPenteractFunnel} from "../../src/detroit/penteract-5d.ts";
import {shadowPenteractRoute} from "../../src/detroit/penteract-shadow.ts";

const questions={
 finance:["請估算這筆投資的報酬","解讀本年度營收表現","每月現金流是否足夠",
  "毛利變動的原因是什麼","股息收入能支應生活嗎","分析資金周轉困難"],
 research:["幫我查核這份研究的出處","有沒有最新的法律指引","請整理相關文獻",
  "驗證這個新聞消息真偽","給我可靠的證據來源","如何核對法規規定"],
 code:["修復這段 TypeScript 型別","Python 函數出現 bug","幫我檢查 GitHub PR",
  "API 呼叫回傳錯誤","重新安排程式的模組","請幫我重構原始碼"],
 design:["設計更好的 UI 介面","調整 iOS 風格的排版","網站色彩太雜亂",
  "改善使用者 UX 體驗","這張海報如何配色","視覺設計需要更多留白"],
 writing:["幫我撰寫一封電子郵件","摘要這篇文章","將文件改寫成正式語氣",
  "把講稿寫得容易理解","製作活動文案","整理一份敘述性報告"],
 numbers:["求出樣本標準差","CSV 的缺失值有幾筆","計算本次統計的平均",
  "根據數據找出中位數","這份試算表的百分比","繪製數值圖表"]
};
const uncertain=[
 "你好","謝謝你","繼續","下一步呢？","好","我不確定該怎麼辦","早安","請解釋一下"
];
const mixed=[
 "研究最新文獻並計算 CSV 統計",
 "先做財務分析再設計網站介面",
 "用 Python 處理 CSV 數據",
 "將最新研究寫成正式文章",
 "請把股價數據畫成 UI 圖表",
 "需要程式修復和文獻查證"
];
export const SYNTHETIC_CASES=Object.freeze([
 ...Object.entries(questions).flatMap(([expected,qs])=>
  qs.map(question=>Object.freeze({question,expected}))),
 ...uncertain.map(question=>Object.freeze({question,expected:null})),
 ...mixed.map(question=>Object.freeze({question,expected:null}))
]);
export function auditPenteractShadow(samples=SYNTHETIC_CASES){
 if(!Array.isArray(samples)||!samples.length||samples.length>500)throw Error("INVALID_ROUTING_AUDIT");
 let correct=0,eligible=0,abstained=0,ambiguous=0,ambiguousAbstained=0,rawCorrect=0;
 const perDomain={};
 for(const sample of samples){
  if(typeof sample.question!=="string"||typeof sample.expected!=="string"&&sample.expected!==null)
   throw Error("INVALID_ROUTING_CASE");
  const verdict=shadowPenteractRoute(sample.question);
  const raw=planPenteractFunnel(sample.question,{budget:1,privateMode:true}).routes[0]?.id||null;
  if(sample.expected===null){
   ambiguous++;
   if(verdict.status==="abstain")ambiguousAbstained++;
  }else{
   eligible++;
   if(raw===sample.expected)rawCorrect++;
   const group=perDomain[sample.expected]??{cases:0,correct:0,abstained:0};
   group.cases++;
   if(verdict.candidateId===sample.expected){correct++;group.correct++;}
   if(verdict.status==="abstain"){abstained++;group.abstained++;}
   perDomain[sample.expected]=group;
  }
 }
 return {suite:"Penteract lexical-R5 routing sanity v1",fixturesSource:"GPT-authored synthetic, NOT field accuracy",
  noModelInvoked:true,noToolsExecuted:true,cases:samples.length,
  labeledCases:eligible,unknownOrMixedCases:ambiguous,
  rawGeometryTop1OnLabeled:eligible?rawCorrect/eligible:null,
  shadowCorrectOnLabeled:eligible?correct/eligible:null,
  shadowLabeledCoverage:eligible?(eligible-abstained)/eligible:null,
  abstainOnUnknownOrMixed:ambiguous?ambiguousAbstained/ambiguous:null,
  perDomain,privacy:"prompts are fixed synthetic cases; reports contain no query text"};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length>2||args.length===2&&args[0]!=="--output"||args.length===1)
  throw Error("Usage: node penteract-routing-audit.mjs [--output relative-file.json]");
 const summary=auditPenteractShadow();
 if(args.length===2){
  const path=resolve(args[1]);
  if(!path.startsWith(resolve("training/october/generated")+"/")||!path.endsWith(".json"))
   throw Error("REPORT_MUST_BE_IN_GENERATED_DIRECTORY");
  mkdirSync(dirname(path),{recursive:true});
  writeFileSync(path,JSON.stringify(summary,null,2)+"\n");
 }
 console.log(JSON.stringify(summary));
}
