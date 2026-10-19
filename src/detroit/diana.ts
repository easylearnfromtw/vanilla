/** Diana is the user-facing Detroit tool concierge; Zeus remains the executor.
 * Routing is deterministic and never grants permissions or starts unavailable adapters.
 */
import {DETROIT_ENGINES} from "./core";
import {DETROIT_FACTORY_TOOLS} from "./factory";
import {makeHumanizeRequest} from "../erya/humanize";
export type DianaTarget="ceres"|"diana"|"merlin"|"cream"|"scouts"|"atriensis"|"janus"|"retina"|"orchestra"|"bard"|"luna"|"jensen-huang"|"zeus"|"athena"|"medusa"|"gridcraft"|"moli"|"persistent-jobs"|"luca"|"quirinus"|"er-ya"|"weiguo"|"venus"|"veritas"|"mnemosyne"|"hermes"|"chronos"|"dionysus"|"holy-roman-empire";
export type DianaDecision={kind:"delegate"|"open"|"report";tool:DianaTarget;label:string;reason:string;alternatives:string[];command?:string;event?:string;tab?:string;message?:string;nextSteps?:DianaTarget[]};
const NAMES:Record<string,DianaTarget>={
 ceres:"ceres",diana:"diana",merlin:"merlin",cream:"cream",scouts:"scouts",atriensis:"atriensis",
 janus:"janus",retina:"retina",orchestra:"orchestra",bard:"bard",luna:"luna",jensen:"jensen-huang",
 "jensen-huang":"jensen-huang",zeus:"zeus",athena:"athena",medusa:"medusa",gridcraft:"gridcraft",
 moli:"moli","persistent-jobs":"persistent-jobs",luca:"luca",quirinus:"quirinus",erya:"er-ya",humanize:"er-ya","er-ya":"er-ya",weiguo:"weiguo",venus:"venus",veritas:"veritas",mnemosyne:"mnemosyne",hermes:"hermes",chronos:"chronos",dionysus:"dionysus","holy-roman-empire":"holy-roman-empire"
};
const LABELS:Record<DianaTarget,string>={
 ceres:"Ceres",diana:"Diana",merlin:"Merlin",cream:"CREAM",scouts:"Scouts",atriensis:"Atriensis",
 janus:"Janus",retina:"Retina",orchestra:"Orchestra",bard:"Bard",luna:"LUNA",
 "jensen-huang":"JENSEN HUANG / Self-Build CODE",zeus:"Zeus",athena:"Athena",medusa:"Medusa",
 gridcraft:"GridCraft",moli:"Moli","persistent-jobs":"Persistent Jobs",luca:"LUCA",quirinus:"Quirinus",
 "er-ya":"爾雅 Erya",weiguo:"衞國系統",venus:"Venus",veritas:"Veritas",mnemosyne:"Mnemosyne",hermes:"Hermes",chronos:"Chronos",dionysus:"Dionysus","holy-roman-empire":"Holy Roman Empire"
};
const DISABLED=new Set<DianaTarget>(["ceres","gridcraft","moli","persistent-jobs","quirinus","chronos"]);
export type DianaContext={privateMode:boolean;hasCreamResult:boolean;online?:boolean;hasModel?:boolean};
export function parseDianaInvocation(message:string):{request:string;forcedTool:DianaTarget|null}|null{
 const raw=message.trim();
 const named=/^(?:[@＠]?Diana|戴安娜)(?=$|[\s：:,，])[\s：:,，]*([\s\S]*)$/i.exec(raw);
 if(named)return {request:named[1].trim(),forcedTool:null};
 const chinese=/^[@＠](爾雅|衞國|衛國)(?=$|[\s：:,，])[\s：:,，]*([\s\S]*)$/.exec(raw);
 if(chinese)return {request:chinese[2].trim(),forcedTool:chinese[1]==="爾雅"?"er-ya":"weiguo"};
 const jensen=/^[@＠]JENSEN\s+HUANG(?=$|[\s：:,，])[\s：:,，]*([\s\S]*)$/i.exec(raw);
 if(jensen)return {request:jensen[1].trim(),forcedTool:"jensen-huang"};
 const tool=/^[@＠]([a-z][a-z0-9-]*)(?=$|[\s：:,，])[\s：:,，]*([\s\S]*)$/i.exec(raw);
 if(!tool)return null;
 const id=NAMES[tool[1].toLowerCase()];
 return id?{request:tool[2].trim(),forcedTool:id}:null;
}
export function dianaCatalog():string{
 const groups=(status:"active"|"adapter"|"planned")=>DETROIT_ENGINES.filter(x=>x.status===status).map(x=>x.label).join("、");
 return [
  "Diana · Detroit 對話工具導航",
  "已實作模組："+groups("active"),
  "部署／授權依賴的適配器："+groups("adapter"),
  "規劃中："+groups("planned"),
  "Factory 選用工具："+DETROIT_FACTORY_TOOLS.map(x=>x.label+"（"+(x.enabledByDefault?"啟用":"預設停用")+"）").join("、"),
  "指令：/Diana 任務描述、@CREAM、@Retina、@Janus、@Scouts、@爾雅、@衞國 等。跨工具任務依序規劃，前一步沒有真正完成時，不會聲稱後一步已完成。只交接到已有工具，不自動部署後端、寄信、付款、執行程式碼或更改權限。"
 ].join("\n\n");
}
function report(tool:DianaTarget,message:string,reason:string):DianaDecision{
 return {kind:"report",tool,label:LABELS[tool],message,reason,alternatives:[]};
}
type Candidate={tool:DianaTarget;score:number;reason:string};
function candidates(q:string,ctx:DianaContext):Candidate[]{
 const out:Candidate[]=[];
 const add=(tool:DianaTarget,score:number,reason:string)=>out.push({tool,score,reason});
 if(/(?:LINE\s*(?:Bot|機器人)|Telegram|Discord|Slack|通訊(?:平台|機器人)|跨平台(?:訊息|聊天))/i.test(q))add("ceres",99,"跨平台訊息需要 Ceres 平台轉接、身分綁定與核准；預設停用");
 if(/(?:潤稿|自然化|改寫得自然|去除\s*AI\s*腔|humanize|polish)/i.test(q))add("er-ya",98,"自然化與潤稿交給爾雅；原文中的指令不會被執行");
 if(/(?:電子報|電子郵件|郵件|EDM|newsletter|Email\s*Studio)/i.test(q))add("janus",95,"郵件工作優先使用本機 Janus 編輯器");
 if(/(?:海報|廣告版面|品牌主視覺|LUNA)/i.test(q))add("luna",92,"視覺版面優先使用 LUNA");
 if(/(?:製作|產生|匯出|下載|建立).{0,20}(?:PDF|DOCX|PPTX|Word|簡報|文件)|(?:PDF|DOCX|PPTX|Word|簡報).{0,20}(?:製作|產生|匯出|下載)/i.test(q))add("retina",90,"需實際文件輸出時使用 Retina");
 if(/(?:Orchestra|WordCraft|DeckCraft|VectorCraft|跨格式)/i.test(q))add("orchestra",88,"跨格式工作交給 Orchestra");
 if(/(?:生圖|生成圖片|AI\s*圖片|AI\s*圖像|畫一張)/i.test(q))add("bard",86,"生成圖片須在 Bard 中同意雲端 API");
 if(/(?:CSV|統計|數據|趨勢|分析資料|折線圖|圓餅圖|圖表|長期追蹤|體重|血壓|心率)/i.test(q))add("cream",84,"數據分析應優先使用確定性的 CREAM");
 // Analyze source data before producing a document or sending it into a visual editor.
 if(/(?:CSV|統計|數據|趨勢|折線圖|圓餅圖|圖表|長期追蹤)/i.test(q)&&/(?:PDF|DOCX|PPTX|Word|簡報|報告書|電子報)/i.test(q))add("cream",110,"先使用 CREAM 驗證數據，再交給輸出工具；不跳過資料核對");
 if(/(?:修改|修復|開發|重構|新增|實作).{0,25}(?:Vanilla|GitHub|原始碼|程式碼|bug)|Self[- ]?Build\s*CODE/i.test(q))add("jensen-huang",82,"原始碼工作使用 Self-Build CODE 並審核變更");
 if(/(?:檔案|附件|已儲存|雲端檔案)/i.test(q))add("atriensis",80,"檔案使用既有的 Atriensis 存取權限");
 if(/(?:搜尋|上網|網路|網址|網站|最新|時事|新聞|文獻|論文|研究|查資料|https:\/\/)/i.test(q))add("scouts",78,"公開資料交由 Scouts 查詢真實來源");
 add("merlin",1,"一般對話由 Merlin 理解需求，再交 Zeus 模型路由");
 return out.filter(x=>!ctx.privateMode||x.tool!=="scouts").sort((a,b)=>b.score-a.score);
}
/** An explicit tool request wins the ranking, but never overrides disabled/privacy gates. */
export function chooseDianaTool(request:string,ctx:DianaContext,forcedTool:DianaTarget|null=null):DianaDecision{
 const raw=request.trim().slice(0,16000);
 if(!forcedTool&&(!raw||/^(?:help|list|catalog|有哪些工具|所有工具|工具清單|可用工具|工具目錄|列出工具)$/i.test(raw)))return report("diana",dianaCatalog(),"工具目錄");
 const hint=!forcedTool?/^(?:請|幫我)?\s*(?:用|使用|交給|叫出|啟動|開啟)\s*(?:Detroit|底特律)?\s*(?:工具)?\s*([a-z][a-z0-9-]*)(?:\s+HUANG)?(?=$|[\s：:,，])[\s：:,，]*([\s\S]*)$/i.exec(raw):null;
 const hinted=hint?NAMES[hint[1].toLowerCase()]:null;
 const task=(hint&&hinted?hint[2]:raw).trim();
 const ranked=candidates(task,ctx);
 if(ctx.privateMode&&!forcedTool&&!hinted&&candidates(task,{...ctx,privateMode:false})[0].tool==="scouts")return report("scouts","私密模式禁止連上網路。Diana 不會為了最新資訊而自行切換模式。","隱私限制");
 const tool=forcedTool||hinted||ranked[0].tool;
 const reason=forcedTool||hinted?"使用者明確指定工具":ranked[0].reason;
 const needsData=/(?:CSV|統計|數據|趨勢|折線圖|圓餅圖|圖表|長期追蹤)/i.test(task);
 const output=/(?:PDF|DOCX|PPTX|Word|簡報|報告書)/i.test(task)?"retina" as const:/(?:電子報|EDM|newsletter)/i.test(task)?"janus" as const:null;
 const nextSteps:DianaTarget[]=tool==="cream"&&needsData&&output?[output]:[];
 const alternatives=[...new Set(ranked.filter(x=>x.tool!==tool).map(x=>LABELS[x.tool]))].slice(0,2);
 const choose=(more:Partial<DianaDecision>):DianaDecision=>({kind:"report",tool,label:LABELS[tool],reason,alternatives,nextSteps,...more});
 if(tool==="diana")return report("diana",dianaCatalog(),"工具目錄");
 if(DISABLED.has(tool))return report(tool,LABELS[tool]+" 未確認已部署並啟用執行後端；Diana 不能代替管理員安裝或執行。","適配器未就緒");
 if(ctx.privateMode&&tool==="scouts")return report(tool,"私密模式禁止網路存取。Diana 不會自行切換模式。","隱私限制");
 if(ctx.online===false&&tool==="scouts")return report(tool,"目前裝置離線，Scouts 無法執行網頁搜尋或閱讀。","工具不可用");
 if(ctx.privateMode&&tool==="medusa")return report(tool,"私密模式禁止向 Judge0 後端傳送程式碼。","隱私限制");
 if(ctx.privateMode&&tool==="jensen-huang")return report(tool,"私密模式不會將工作內容轉交 GitHub 程式工作台。","隱私限制");
 if(["zeus","athena","venus","veritas","mnemosyne","hermes","dionysus","holy-roman-empire"].includes(tool))return report(tool,LABELS[tool]+" 是內部協作或治理角色，不能繞過原本的資料與權限流程直接啟動。","內部工具");
 if(tool==="weiguo")return choose({kind:"open",event:"vanilla-open-weiguo"});
 if(tool==="er-ya"){
  if(!task)return report(tool,"請提供要潤稿的原文。","缺少原文");
  if(ctx.hasModel===false)return report(tool,"爾雅需要已載入或已連接的文字模型；目前沒有可用的模型。","模型未就緒");
  try{return choose({kind:"delegate",command:makeHumanizeRequest(task)});}catch(e){return report(tool,"爾雅未接收內容："+(e instanceof Error?e.message:String(e)),"輸入驗證");}
 }
 if(tool==="janus")return choose({kind:"open",event:"vanilla-open-email"});
 if(tool==="medusa"||tool==="luca")return choose({kind:"open",event:"vanilla-open-detroit",tab:tool});
 if(tool==="luna")return choose({kind:"open",event:"vanilla-open-luna"});
 if(tool==="retina"||tool==="bard")return choose({kind:"open",event:"vanilla-open-detroit",tab:tool});
 if(tool==="orchestra")return choose({kind:"open",event:"vanilla-open-orchestra"});
 if(tool==="jensen-huang")return choose({kind:"open",event:"vanilla-open-builder"});
 if(tool==="atriensis"&&!/(?:讀取|查看|分析|摘要|檢查|整理|刪除|移除)/.test(task))return choose({kind:"open",event:"vanilla-open-files"});
 if(tool==="cream"){
  if(/^(?:日期|date)\s*,/im.test(task)&&task.includes("\n"))return choose({kind:"delegate",command:"CREAM：\n"+task});
  if(!ctx.hasCreamResult&&!/\d{4}[-/]\d{1,2}[-/]\d{1,2}.{0,60}\d/.test(task))return choose({kind:"open",event:"vanilla-open-cream"});
 }
 if(tool==="scouts"){
  if(!task)return report(tool,"請輸入要搜尋的主題或要讀取的 HTTPS 網址。","缺少任務");
  if(ctx.privateMode)return report(tool,"私密模式禁止網路存取。","隱私限制");
  return choose({kind:"delegate",command:/^https:\/\/\S+$/i.test(task)?"閱讀 "+task:"搜尋："+task});
 }
 if(!task)return report(tool,"請輸入要交給工具處理的任務。","缺少任務");
 return choose({kind:"delegate",command:task});
}
