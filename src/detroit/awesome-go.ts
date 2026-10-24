/** Curated, offline technology suggestions sourced from avelino/awesome-go.
 * Catalog entries are references, NOT installed dependencies or deployment receipts.
 * No network, evaluation of external source, package installation, or credential access.
 */
export type GoRole="diana"|"slime"|"ceres"|"luca"|"quirinus"|"detroit";
export type GoCategory="agent"|"inference"|"message-bus"|"observability"|"supply-chain"|"http";
export type GoReference={
 id:string;name:string;category:GoCategory;roles:readonly GoRole[];
 url:string;summary:string;tradeoff:string;keywords:readonly string[];
};
export const AWESOME_GO_SOURCE="https://github.com/avelino/awesome-go";
export const AWESOME_GO_REFERENCES:readonly GoReference[]=Object.freeze([
 {id:"mcp-go",name:"mcp-go",category:"agent",roles:["diana","detroit"],url:"https://github.com/mark3labs/mcp-go",summary:"Go 的 MCP server/client 實作，可評估作為獨立工具橋接服務",tradeoff:"須檢查 transport、權限邊界與 MCP 版本；不能取代既有 Detroit Bus",keywords:["mcp","agent","工具","調用","代理","tool"]},
 {id:"ollama",name:"Ollama",category:"inference",roles:["slime"],url:"https://github.com/ollama/ollama",summary:"自架模型推論服務；Slime 可考慮串接其既有 API，而非改寫推論核心",tradeoff:"模型運算仍受單一節點硬體限制；不是多機模型切分的保證",keywords:["llm","模型","推論","inference","ollama","節點"]},
 {id:"ollamafarm",name:"OllamaFarm",category:"inference",roles:["slime"],url:"https://github.com/avelino/awesome-go#artificial-intelligence",summary:"候選的多 Ollama 實例平衡與容錯方案，適合研究 Slime 節點調度",tradeoff:"需另行確認原始專案、維護狀態、可用性及安裝授權；不可直接上線",keywords:["負載","調度","節點","failover","cluster","多機"]},
 {id:"nats",name:"NATS",category:"message-bus",roles:["ceres","slime","detroit"],url:"https://github.com/nats-io/nats-server",summary:"低延遲事件傳遞，可用於 Ceres 訊息分派和 Slime 節點狀態事件",tradeoff:"需要獨立訊息服務與存取控制；少量裝置可能比現有 WebSocket 更複雜",keywords:["訊息","messaging","event","queue","pubsub","websocket","即時","通訊"]},
 {id:"otellix",name:"otellix",category:"observability",roles:["luca","diana","detroit"],url:"https://github.com/avelino/awesome-go#artificial-intelligence",summary:"OpenTelemetry 導向的 LLM 可觀測性及成本守門技術候選",tradeoff:"需確認上游原始碼及資料出口；LUCA 預設不得外傳私人追蹤內容",keywords:["trace","遙測","監控","效能","成本","token","otel","observability"]},
 {id:"syft",name:"Syft",category:"supply-chain",roles:["quirinus","detroit"],url:"https://github.com/anchore/syft",summary:"產出 SBOM，協助 Quirinus 檢視供應鏈依賴清單",tradeoff:"SBOM 不等於漏洞掃描或惡意軟體鑑定；仍需另接漏洞資料及審批",keywords:["sbom","資安","安全","漏洞","依賴","套件","license","授權"]},
 {id:"resty",name:"Resty",category:"http",roles:["ceres","slime","detroit","diana"],url:"https://github.com/go-resty/resty",summary:"Go 的 HTTP/REST 客戶端，適合新增獨立微服務時連接既有 Vanilla API",tradeoff:"現有 React/Python API 不需因此改寫；需管理超時、重試和憑證",keywords:["api","http","rest","連線","接口","bridge","整合"]}
]);

const rolePatterns:readonly {role:GoRole;pattern:RegExp}[]=[
 {role:"diana",pattern:/\bdiana\b|黛安娜/i},
 {role:"slime",pattern:/\bslime\b|史萊姆|節點|本地模型|分散式模型/i},
 {role:"ceres",pattern:/\bceres\b|Telegram|Discord|LINE\s*Bot|通訊平台/i},
 {role:"luca",pattern:/\bluca\b|可觀測性|追蹤|監控/i},
 {role:"quirinus",pattern:/\bquirinus\b|資安|漏洞|供應鏈/i},
 {role:"detroit",pattern:/\bdetroit\b|底特律|工具編排|能力總線/i}
];
const goTerm=/(?:\bawesome[\s-]?go\b|\bgolang\b|\bgo\b.{0,12}(?:套件|函式庫|框架|技術|選型|程式|微服務)|(?:套件|函式庫|框架|技術|選型).{0,12}\bgo\b)/i;
const actionTerm=/(?:安裝|部署|更新依賴|加入原始碼|修改程式|寫入程式|實作程式|開始執行|直接整合|合併|套用)/i;
const selectTerm=/(?:推薦|選型|評估|比較|挑選|適合|有哪些|什麼|介紹|研究|參考|可用|如何|怎麼|choose|recommend|select)/i;
export function isAwesomeGoQuestion(message:string):boolean{
 const q=message.trim().slice(0,1200);
 return q.length>0&&goTerm.test(q)&&!actionTerm.test(q)&&selectTerm.test(q);
}
export type GoSelection={reference:GoReference;score:number;why:string};
export type GoPlan={source:string;roles:readonly GoRole[];recommendations:readonly GoSelection[];mode:"reference-only"};
export function selectAwesomeGo(message:string,limit=3):GoPlan|null{
 if(!isAwesomeGoQuestion(message))return null;
 const q=message.slice(0,1200);
 const roles=rolePatterns.filter(x=>x.pattern.test(q)).map(x=>x.role);
 const ranked=AWESOME_GO_REFERENCES.map((reference,index)=>{
  const roleMatches=roles.filter(role=>reference.roles.includes(role));
  const wordMatches=reference.keywords.filter(word=>q.toLowerCase().includes(word.toLowerCase()));
  // Match actual module requirements before generic popularity; no fake telemetry/stars.
  const score=roleMatches.length*8+wordMatches.length*3+(roles.length===0?1:0);
  const why=roleMatches.length?"對應 "+roleMatches.join(" / ")+" 的功能需求":wordMatches.length?"對應 "+wordMatches.slice(0,2).join("、")+" 需求":"供後續評估的基礎候選";
  return {reference,score,why,index};
 }).filter(x=>!roles.length||x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index)
  .slice(0,Math.max(1,Math.min(5,Math.floor(Number.isFinite(limit)?limit:3))));
 return {source:AWESOME_GO_SOURCE,roles,recommendations:ranked.map(({reference,score,why})=>({reference,score,why})),mode:"reference-only"};
}
export function formatAwesomeGoPlan(message:string):string{
 const plan=selectAwesomeGo(message);
 if(!plan)return "";
 const intro="Awesome Go · Vanilla 技術選型參考（離線精選索引，非安裝結果）";
 const items=plan.recommendations.map(({reference,why},i)=>(i+1)+". "+reference.name+" — "+reference.summary+"\n   適用："+why+"；注意："+reference.tradeoff+"\n   專案／索引："+reference.url);
 return [intro,...items,"來源清單："+plan.source,"安全門檻：需核對原始專案、授權、維護情況、漏洞和效能；經 Quirinus/人工核准後才可新增依賴或部署。此功能不連網、不自動安裝、不執行上游程式碼。"].join("\n\n");
}
