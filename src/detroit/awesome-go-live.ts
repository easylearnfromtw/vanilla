/** A real, opt-in GitHub audit of Go candidates for Vanilla modules.
 * This makes network requests ONLY when the user activates the audit UI.
 * It never downloads executables, runs source code or claims compatibility.
 */
import {AWESOME_GO_REFERENCES,type GoReference,type GoRole} from "./awesome-go";
import {reviewAwesomeRepo,type AwesomeEntry,type AwesomeReview} from "./awesome-discovery";

export type GoAuditStatus="verified"|"blocked"|"unresolved"|"error";
export type GoAudit={reference:GoReference;role:GoRole;status:GoAuditStatus;reason:string;review?:AwesomeReview;checkedAt?:string};
const GITHUB_REPO=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/i;
export const GO_ROLE_LABELS:Readonly<Record<GoRole,string>>={
 diana:"Diana 工具協作",slime:"Slime 模型節點",ceres:"Ceres 通訊",luca:"LUCA 可觀測性",
 quirinus:"Quirinus 供應鏈安全",detroit:"Detroit 能力總線"
};
export function goAuditEntry(reference:GoReference):AwesomeEntry|null{
 const match=GITHUB_REPO.exec(reference.url);
 if(!match||match[1]==="."||match[2]==="."||match[2].endsWith(".git"))return null;
 return {name:reference.name,description:reference.summary,category:reference.category,
  url:reference.url,owner:match[1],repo:match[2]};
}
export function goRoleCandidates(role:GoRole):readonly GoReference[]{
 return AWESOME_GO_REFERENCES.filter(r=>r.roles.includes(role)).slice(0,5);
}
export function goAuditDecision(reference:GoReference,role:GoRole,review:AwesomeReview):GoAudit{
 const blocking=review.archived||review.license==="未確認";
 return {reference,role,status:blocking?"blocked":"verified",
  reason:blocking?"封存或授權未確認；不可交付安裝。":"已取得公開專案中繼資料，可進入隔離驗證；尚未驗證程式品質與相容性。",
  review,checkedAt:new Date().toISOString()};
}
export async function auditGoCandidates(role:GoRole,options?:{
 signal?:AbortSignal;
 check?:(entry:AwesomeEntry,signal?:AbortSignal)=>Promise<AwesomeReview>;
}):Promise<GoAudit[]>{
 const candidates=goRoleCandidates(role);
 const check=options?.check||reviewAwesomeRepo;
 // Explicitly do not dereference anchors pointing to Awesome Go itself.
 return Promise.all(candidates.map(async reference=>{
  const entry=goAuditEntry(reference);
  if(!entry)return {reference,role,status:"unresolved" as const,reason:"這是清單章節，不是可驗證的原始專案；請先定位真正的上游儲存庫。"};
  try{
   const review=await check(entry,options?.signal);
   if(options?.signal?.aborted)throw new Error("已取消查核");
   if(review.entry.owner!==entry.owner||review.entry.repo!==entry.repo)
    throw new Error("GitHub 回傳的專案身份與候選項目不符");
   return goAuditDecision(reference,role,review);
  }catch(e){
   return {reference,role,status:"error" as const,
    reason:e instanceof Error?e.message:"GitHub 查核失敗；不得當成已通過"};
  }
 }));
}
const TARGETS:Readonly<Record<GoRole,string>>={
 diana:"src/detroit/diana.ts / src/detroit/capability-bus.ts",
 slime:"services/weiguo/slime_runner_bridge.py / services/weiguo/slime.py",
 ceres:"services/weiguo/ceres_agent_bridge.py / services/weiguo/ceres_gateway.py",
 luca:"services/weiguo/luca.py / src/luca/",
 quirinus:"services/weiguo/quirinus_adapter.py",
 detroit:"src/detroit/capability-bus.ts / services/weiguo/"
};
export function goIntegrationTask(audit:GoAudit):string{
 const {reference,role,review,status}=audit;
 if(status!=="verified"||!review)throw Error("尚未完成授權和專案身分查核，禁止產生實作交接");
 const lines=[
  "Vanilla AI Go 技術實作任務（候選方案；尚未安裝）",
  "模組："+GO_ROLE_LABELS[role],
  "候選："+reference.name+" "+reference.url,
  "來源：avelino/awesome-go",
  "驗證資料：GitHub 更新日 "+(review.updated||"未知")+"；SPDX "+review.license+
   "；評估分數 "+review.score+"/100（僅初步維護與授權線索，非安全評分）",
  "現有整合點："+TARGETS[role],
  "目標：以最小可撤銷的適配器為此模組提供可實際呼叫的功能，不能只新增文件或關鍵字建議。",
  "驗收：在隔離環境提供真實 request/response 與失敗回執、timeout/cancel、安全及負載測試。",
  "安全門檻：先人工檢視 LICENSE/NOTICE、依賴樹、漏洞、供應鏈及輸入輸出敏感資料。",
  "權限：禁止任意 shell、任意外部程式執行、公開 API 金鑰、自動修改主分支。",
  "部署：任何需要 Go 常駐服務的功能必須部署至明確授權的運算節點；GitHub Pages 不會執行 Go 後端。",
  "流程：先製作最小程式碼 PR → CI → 管理者核准 → 有回滾方案後再部署。",
  "注意："+reference.tradeoff
 ];
 // App only transfers up to 1800 chars; keep task bounded without secrets.
 return lines.join("\n").slice(0,1750);
}
