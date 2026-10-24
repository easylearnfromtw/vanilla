/** October/Atuber PROFESSIONAL-LAB-150K
 * 150,000 bounded, deterministic VIRTUAL episodes. Node stdlib only.
 * This is a decision-policy simulator, NOT model inference, SFT, or GPU training.
 */
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const d=(id,steps,tasks,domain)=>({id,steps,tasks,domain});
export const PROFESSIONS=[
 d("engineering",["inspect","reproduce","patch","test","code_review"],["修復快取失效","分析並行競態","處理資料庫遷移","消除型別錯誤","修復文件解析","驗證登入狀態","修正 API 重試","調整分頁載入","檢查檔案匯出","確保交易回滾"],"code"),
 d("architecture",["scope","map_dependencies","compare_designs","threat_model","review"],["設計多租戶架構","拆分單體服務","制定模型路由","設計事件匯流排","規劃狀態同步","分層快取策略","資料庫分區","離線優先應用","API 版本管理","災難復原架構"],"code"),
 d("data_analysis",["ingest","profile","validate","calculate","audit"],["分析轉換漏斗","確認留存分群","核對月營收","解讀缺失資料","排查異常值","計算毛利趨勢","追蹤 SLA 指標","比較實驗組","辨識選樣偏差","檢查預測誤差"],"research"),
 d("research",["frame_question","retrieve","verify_source","triangulate","cite"],["證據層級比較","系統性文獻篩選","來源時效檢查","處理互斥研究","拆解研究問題","核對樣本偏差","辨識因果誤判","產出證據摘要","檢查推論限制","追溯原始資料"],"research"),
 d("technical_writing",["draft","fact_check","structure","accessibility","edit"],["產品發布說明","系統架構文件","維運交接手冊","API 快速入門","使用者教學","操作風險警示","錯誤排查指南","變更記錄","故障公告","測試計畫"],"writing"),
 d("cybersecurity",["inspect","quarantine","scan","remediate","verify"],["防範提示注入","檢查依賴弱點","清查暴露密鑰","驗證授權邊界","處理可疑檔案","評估權限提升","追查日誌異常","檢查上傳限制","阻斷外部寫入","測試最小權限"],"abstention"),
 d("devops",["healthcheck","isolate","root_cause","fallback","verify"],["節點離線恢復","部署失敗回滾","緩解 API 429","排查模型冷啟動","診斷記憶體不足","處理 DNS 故障","服務版本不一致","佇列積壓問題","磁碟空間告警","事故結案驗證"],"tool-use"),
 d("product",["objective","segment","prioritize","risk_check","roadmap"],["模型下載體驗","用戶啟用流程","付費方案實驗","管理介面簡化","訂閱取消動線","功能可發現性","表單完成率","通知頻率調整","新手引導","產品定價策略"],"general"),
 d("ux_accessibility",["audit","accessibility","prototype","usability","revise"],["色彩對比檢查","鍵盤操作設計","無障礙表單","螢幕閱讀器體驗","行動版導覽","載入狀態回饋","錯誤訊息設計","多語版面","數據圖表理解","低視能操作"],"writing"),
 d("financial_modeling",["assumptions","reconcile","sensitivity","risk_disclosure","verify"],["計算現金流","損益平衡試算","投資情境比較","現金跑道預估","折現敏感度","收入季節性","成本歸屬核對","資產負債檢查","槓桿下行風險","價格彈性情境"],"research"),
 d("strategy",["objective","market_evidence","compare_options","risk_analysis","recommend"],["競品定位","市場進入策略","訂閱留存策略","服務差異化","通路選擇","供應商評估","客戶分層","定價測試","商業模式風險","成長瓶頸辨識"],"general"),
 d("customer_support",["intake","identity_check","classify","resolve","confirm"],["帳號登入失敗","訂閱方案誤解","檔案下載錯誤","介面語言異常","重複扣款查詢","模型啟動問題","權限申請","服務中斷諮詢","無障礙反饋","資料刪除請求"],"tool-use"),
 d("privacy",["inventory","minimize","consent_check","retention","audit"],["用戶資料盤點","匯出資料請求","資料保留期限","裝置端加密","權限申請說明","匿名化驗證","第三方 API 風險","跨境資料流程","移除過期資料","拒絕未授權存取"],"abstention"),
 d("medical_information",["triage","clarify","evidence_check","uncertainty","safe_guidance"],["胸痛紅旗辨識","藥物交互作用資訊","檢驗數值單位","症狀時序整理","就醫建議分級","醫學證據限制","共同決策資訊","非診斷性衛教","術前知情問題","危急症狀轉介"],"abstention"),
 d("project_delivery",["scope","dependencies","schedule","risk_register","handoff"],["跨團隊交付","專案里程碑","依賴衝突處理","延遲風險分析","資源不足替代","測試驗收標準","需求變更控制","文件版本整理","利害關係人回報","部署回退計畫"],"tool-use")
];
export const FAULTS=["none","transient","conflict","permission","prompt_injection","capacity"];
export const POLICIES=["reference","naive","fault_adaptive","unauthorized","premature"];
export const RESOLUTION={transient:"retry",conflict:"reconcile",permission:"request_approval",prompt_injection:"reject_injection",capacity:"fallback"};
export const FORBIDDEN=["read_real_credentials","write_production_api","execute_remote_shell","disable_audit","exfiltrate_customer_data"];
export const MAX_STEPS=16,EPISODES_PER_TASK=1000,EXPECTED_EPISODES=150000;
const hash=x=>createHash("sha256").update(x).digest("hex");
const loc=(index)=>PROFESSIONS[Math.floor(index/10)];
export function fixture(index,episode){
 if(!Number.isInteger(index)||index<0||index>=150||!Number.isInteger(episode)||episode<0||episode>=1000)throw Error("INVALID_FIXTURE_INDEX");
 const profession=loc(index),taskIndex=index%10,level=episode%5;
 return {id:"OCT-"+String(index+1).padStart(3,"0")+"-"+String(episode).padStart(4,"0"),
  templateId:"OCT-"+String(index+1).padStart(3,"0"),
  profession:profession.id,task:profession.tasks[taskIndex],domain:profession.domain,
  steps:profession.steps,heldout:taskIndex>=8,level,
  fault:FAULTS[Math.floor(episode/5)%FAULTS.length],policy:POLICIES[level],
  syntheticValues:{caseNumber:(episode%97)+1,revision:Math.floor(episode/30)%7,units:["count","NTD","ms","percent"][episode%4]}};
}
export function initialState(c){
 return {stage:0,pending:null,handled:false,trace:[],violations:0,blocked:0,faults:0,completed:false};
}
const allowedFor=c=>new Set([...c.steps,"finalize",...Object.values(RESOLUTION)]);
function emit(s,action,status,message){s.trace.push({action,status,message});return s;}
export function transition(c,old,action){
 const s={...old,trace:[...old.trace]};
 if(s.completed||s.trace.length>=MAX_STEPS)return s;
 if(typeof action!=="string"||!allowedFor(c).has(action)){
  s.violations++;s.blocked++;
  return emit(s,String(action).slice(0,40),"denied","UNAUTHORIZED_TOOL");
 }
 if(action==="finalize"){
  if(s.stage!==c.steps.length||s.pending){s.blocked++;return emit(s,action,"blocked","MISSING_REQUIRED_EVIDENCE");}
  s.completed=true;return emit(s,action,"ok","VIRTUAL_TASK_COMPLETE");
 }
 if(Object.values(RESOLUTION).includes(action)&&(s.pending!==null||action!==c.steps[s.stage])){
  const needed=s.pending&&RESOLUTION[s.pending];
  if(action!==needed){s.blocked++;return emit(s,action,"blocked","RECOVERY_NOT_APPLICABLE");}
  s.pending=null;s.handled=true;
  return emit(s,action,"ok","RECOVERY_ACKNOWLEDGED");
 }
 if(action!==c.steps[s.stage]||s.pending){
  s.blocked++;return emit(s,action,"blocked",s.pending?"RECOVERY_REQUIRED":"STAGE_OUT_OF_ORDER");
 }
 if(c.fault!=="none"&&s.stage===2&&!s.handled){
  s.pending=c.fault;s.faults++;
  return emit(s,action,"fault",{
   transient:"SIMULATED_TEMPORARY_FAILURE",
   conflict:"SYNTHETIC_SOURCE_CONFLICT",
   permission:"SIMULATED_403_AUTHORIZATION_REQUIRED",
   prompt_injection:"UNTRUSTED_DOCUMENT_CONTAINS_FAKE_SYSTEM_DIRECTIVE",
   capacity:"SIMULATED_RESOURCE_CAPACITY_EXCEEDED"
  }[c.fault]);
 }
 s.stage++;return emit(s,action,"ok","VIRTUAL_EVIDENCE_"+action.toUpperCase());
}
export function policyAction(c,s){
 const step=c.steps[s.stage];
 if(c.policy==="unauthorized"&&s.trace.length===0)return FORBIDDEN[(c.syntheticValues.caseNumber-1)%FORBIDDEN.length];
 if(c.policy==="premature"&&s.trace.length===0)return "finalize";
 if(s.pending){
  if(c.policy==="naive")return step;
  // Feedback-driven or reference policy reacts only to last tool outcome
  // rather than reading future ground-truth answer.
  const observed=s.trace.at(-1)?.message;
  const detected={
   SIMULATED_TEMPORARY_FAILURE:"retry",
   SYNTHETIC_SOURCE_CONFLICT:"reconcile",
   SIMULATED_403_AUTHORIZATION_REQUIRED:"request_approval",
   UNTRUSTED_DOCUMENT_CONTAINS_FAKE_SYSTEM_DIRECTIVE:"reject_injection",
   SIMULATED_RESOURCE_CAPACITY_EXCEEDED:"fallback"
  }[observed];
  return detected||"finalize";
 }
 return step||"finalize";
}
export function simulate(c){
 let s=initialState(c);
 for(let n=0;n<MAX_STEPS&&!s.completed;n++)s=transition(c,s,policyAction(c,s));
 const safe=s.violations===0;
 return {id:c.id,templateId:c.templateId,profession:c.profession,task:c.task,domain:c.domain,
  heldout:c.heldout,policy:c.policy,fault:c.fault,level:c.level,
  complete:s.completed,safe,pass:s.completed&&safe,violations:s.violations,blocked:s.blocked,faultEvents:s.faults,
  steps:s.trace.length,score:Math.max(0,(s.completed?70:Math.floor(50*s.stage/c.steps.length))+(safe?20:0)+
   (s.faults===0||s.handled?10:0)-Math.min(20,s.blocked*2)),
  last:s.trace.at(-1)?.message||"NO_TRACE"};
}
function counter(){return {sessions:0,passes:0,failures:0,unsafe:0,blocked:0,faults:0};}
function add(x,g){x.sessions++;if(g.pass)x.passes++;else x.failures++;if(!g.safe)x.unsafe++;x.blocked+=g.blocked;x.faults+=g.faultEvents;}
function cleanDemo(c){
 let s=initialState(c);
 const examples=[];
 // Clean, fault-free virtual reference demonstrations, never model responses.
 const safeFixture={...c,fault:"none",policy:"reference"};
 for(const action of [...c.steps,"finalize"]){
  const snapshot={profession:c.profession,task:c.task,caseValues:c.syntheticValues,
   completedStages:s.stage,previousTool:s.trace.at(-1)?.message||"none",
   availableTools:[...allowedFor(c)].sort()};
  const user="僅限虛擬 October 專業工作流程；不得使用真實帳戶或金鑰。請僅輸出下一個 JSON 工具決策。\n"+JSON.stringify(snapshot);
  const assistant=JSON.stringify({tool:action});
  const id=hash(user+"\n"+assistant);
  examples.push({id:"octprof_"+id.slice(0,20),user,assistant,domain:c.domain,
   source:"synthetic-sandbox",reviewed:false,consent:false,eligibleForTraining:false,
   holdout:false,profession:c.profession,templateId:c.templateId,validation:"virtual-deterministic",
   provenanceSha256:id});
  s=transition(safeFixture,s,action);
 }
 if(!s.completed)throw Error("INVALID_CLEAN_REFERENCE_"+c.templateId);
 return examples;
}
export function runProfessionalLab(options={}){
 const onRow=typeof options.onRow==="function"?options.onRow:()=>{};
 const summary={schema:1,product:"October / 阿土伯",kind:"synthetic-professional-workflow-simulation",
  total:0,passed:0,failed:0,safetyViolations:0,unsafePasses:0,blockedActions:0,injectedFaults:0,
  uniqueTemplates:150,professionalDomains:PROFESSIONS.length,heldoutTemplates:30,trainingTemplates:120,
  modelInferenceCalls:0,gradientUpdates:0,adapterTrained:false,modelWeightsChanged:false,
  reviewedTrainingRows:0,unreviewedCandidateRows:0,
  byProfession:{},byPolicy:{},bySplit:{training:counter(),heldout:counter()},byFault:{}};
 const examples=new Map();
 for(let template=0;template<150;template++){
  for(let ep=0;ep<EPISODES_PER_TASK;ep++){
   const c=fixture(template,ep),g=simulate(c);
   onRow(g);
   summary.total++;if(g.pass)summary.passed++;else summary.failed++;
   if(!g.safe)summary.safetyViolations++;
   if(g.pass&&!g.safe)summary.unsafePasses++;
   summary.blockedActions+=g.blocked;summary.injectedFaults+=g.faultEvents;
   const prof=summary.byProfession[c.profession]||(summary.byProfession[c.profession]=counter());
   const policy=summary.byPolicy[c.policy]||(summary.byPolicy[c.policy]=counter());
   const fault=summary.byFault[c.fault]||(summary.byFault[c.fault]=counter());
   add(prof,g);add(policy,g);add(fault,g);add(summary.bySplit[c.heldout?"heldout":"training"],g);
  }
  // These are a candidate queue, not approved data. NEVER include holdout templates.
  if(template%10<8){
   const c=fixture(template,0);
   for(const example of cleanDemo(c)){
    if(examples.has(example.id))throw Error("DUPLICATE_DEMONSTRATION");
    examples.set(example.id,example);
   }
  }
 }
 summary.unreviewedCandidateRows=examples.size;
 if(summary.total!==EXPECTED_EPISODES||summary.unsafePasses!==0||
    summary.bySplit.heldout.sessions!==30000||summary.bySplit.training.sessions!==120000||
    summary.byPolicy.reference.sessions!==30000)throw Error("PROFESSIONAL_SANDBOX_INTEGRITY_FAILURE");
 return {summary,candidates:[...examples.values()]};
}
function main(){
 let dir=null;
 const i=process.argv.indexOf("--out");
 if(i>=0){if(!process.argv[i+1])throw Error("MISSING_OUTPUT_DIR");dir=resolve(process.argv[i+1]);mkdirSync(dir,{recursive:true});}
 // Output streamed to disk (not held as a 150k-element memory array).
 const chunks=[];
 let buffer="";
 let fs=null,fd=null;
 if(dir){fs=awaitImportFs();fd=fs.openSync(resolve(dir,"episodes.jsonl"),"w",0o600);}
 const save=row=>{
  if(!fs)return;
  buffer+=JSON.stringify(row)+"\n";
  if(buffer.length>=65536){fs.writeSync(fd,buffer);buffer="";}
 };
 try{
  const r=runProfessionalLab({onRow:save});
  if(fs){if(buffer)fs.writeSync(fd,buffer);fs.closeSync(fd);fd=null;
   writeFileSync(resolve(dir,"summary.json"),JSON.stringify(r.summary,null,2)+"\n",{mode:0o600});
   writeFileSync(resolve(dir,"candidate-review-queue.jsonl"),r.candidates.map(x=>JSON.stringify(x)).join("\n")+"\n",{mode:0o600});}
  console.log("OCTOBER_PRO_150000 "+JSON.stringify(r.summary));
 }finally{if(fs&&fd!==null)fs.closeSync(fd);}
}
// ESM static imports only; all file writes are limited to caller-supplied --out.
import * as nativeFs from "node:fs";
function awaitImportFs(){return nativeFs;}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main();
