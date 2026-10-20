/** Vanilla chat tool router.
 * One pure, ordered decision about which tool handles a message, instead of a long chain of
 * regex checks inside the chat component. Every pattern here is exercised by
 * tests/chat-router.test.mjs (the old inline versions had double-escaped `\\s`, which silently
 * broke "上網查…", "Self-Build CODE：…" and other phrasings).
 */
import {capabilityIntent} from "./capability-report";
import {toolKnowledgeIntent} from "./tool-knowledge";
import {parseDianaInvocation,type DianaTarget} from "../detroit/diana";
import {proposeProactiveDiana} from "../detroit/diana-auto";
import {makeHumanizeRequest,isHumanizeRequest} from "../erya/humanize";
import {extractTextMeasurements} from "../cream/longitudinal";
import {creamInstruction,creamChartFollowup,type CreamChartKind} from "../cream/core";
import {planConversationSave} from "./conversation-save";
import {selfInspectIntent} from "../builder/repo-inspector";
import {filenameFromQuestion} from "../local-ai/file-intent";
import {linkReadingIntent} from "../search/web-reader";
import {implicitResearchQuery} from "../search/search-evidence";
import {planAppIntent} from "./intent-router";

export const SEARCH_REQUEST=/^(?:(?:請幫我|請你幫我|請|請你|幫我|麻煩(?:你)?|可以(?:請你)?幫我)\s*)?(?:上網搜尋|網路搜尋|全網搜尋|Google\s*搜尋|搜尋(?:一下)?|上網查(?:一下)?|找資料|查網站|查一下|查詢(?:一下)?|幫我查(?:一下)?|幫我找資料|幫我找(?:一下)?|找一下)\s*[：:]?\s*(.{2,180})$/is;
export const CODE_BUILDER=/^(?:(?:請|幫我|我要|讓\s*Vanilla|你可以|可以)\s*)?(?:自主迭代|自我優化|改進\s*(?:Vanilla|自己|你的)?\s*(?:的)?\s*(?:程式碼|原始碼)|修復\s*(?:Vanilla|自己的)?\s*(?:的)?\s*(?:bug|程式碼)|修改\s*(?:Vanilla|自己|你的)\s*(?:的)?\s*(?:程式碼|原始碼)|Self[- ]?Build\s*CODE|幫我改程式碼|改程式碼|程式碼自主開發)(?:\s*[：:]?\s*([\s\S]{0,1600}))?$/i;
export const SAVED_FILE_READ=/^(?:請|幫我)?(?:讀取|查看|分析|摘要|檢查|整理)(?:一下)?(?:我)?(?:已儲存的|本機的|附件庫的|對話儲存的)(?:檔案|文件)?[：:\s]*(.{1,150})$/i;
export const BUILD_REQUEST=/^(?:新增功能|製作功能|建立功能|功能需求)\s*[：:]\s*(.{3,1800})$/s;
const CONVERSATIONAL_BUILD=/^(?:(?:我想|我要|幫我|幫Vanilla|請|讓Vanilla).{0,25})?(?:新增|建立|製作|做一個|設計一個).{2,150}(?:功能|模組|小工具|工具)$/i;
const END="[！!。.?？\\s]*$";
const OPEN:Array<{section:OpenSection;re:RegExp}>=[
 {section:"weiguo",re:new RegExp("^(?:開啟|打開|查看|前往)\\s*(?:衞國|衛國|Weiguo)(?:\\s*系統)?"+END,"i")},
 {section:"orchestra",re:new RegExp("^(?:(?:開啟|打開|查看|前往)\\s*(?:Vanilla\\s*)?)?(?:Orchestra(?:\\s*Studio)?|跨格式製作工作室|管弦工作室)"+END,"i")},
 {section:"email",re:new RegExp("^(?:(?:開啟|打開|查看|前往)\\s*(?:Vanilla\\s*)?)?(?:Janus|Email\\s*Studio|郵件工作室|郵件編輯器|電子郵件設計)"+END,"i")},
 {section:"cream",re:new RegExp("^(?:開啟|打開|查看|前往)\\s*(?:CREAM|長期分析|數據中心)"+END,"i")},
 {section:"projects",re:new RegExp("^(?:開啟|打開|查看|前往)\\s*(?:PROJECT\\s*HUB|專案庫|所有專案)"+END,"i")},
 {section:"sheets",re:new RegExp("^(?:開啟|打開|前往)\\s*(?:Vanilla\\s*)?(?:表格|Sheets)(?:編輯器)?"+END,"i")},
 {section:"files",re:new RegExp("^(?:開啟|打開|前往)\\s*(?:Vanilla\\s*)?(?:雲端檔案|Cloud\\s*Files)(?:管理)?"+END,"i")},
 {section:"builder",re:new RegExp("^(?:開啟|打開|前往)\\s*(?:Vanilla\\s*)?(?:Self[- ]?Build|自建功能|功能工作室)(?:Studio)?"+END,"i")},
 {section:"library",re:new RegExp("^(?:開啟|打開|前往|查看)\\s*(?:對話圖片與資料|附件庫|我的附件)"+END,"i")}
];
export type OpenSection="orchestra"|"email"|"weiguo"|"cream"|"projects"|"sheets"|"files"|"builder"|"library"|"settings";

export type ChatRoute=
 |{kind:"diana";request:string;forcedTool:DianaTarget|null}
 |{kind:"capability"}
 |{kind:"tool-knowledge"}
 |{kind:"cream-text"}
 |{kind:"cream-csv"}
 |{kind:"open";section:OpenSection}
 |{kind:"chart-followup";chart:CreamChartKind}
 |{kind:"save-conversation"}
 |{kind:"self-inspect"}
 |{kind:"named-file";name:string;action:"read"|"analyze"|"delete"}
 |{kind:"saved-file";name:string}
 |{kind:"app"}
 |{kind:"web-read";url:string}
 |{kind:"web-search";query:string;explicit:boolean}
 |{kind:"private-blocked";what:string}
 |{kind:"code-builder";idea:string}
 |{kind:"feature-builder";idea:string}
 |{kind:"continue"};
export type RouteContext={privateMode:boolean;hasCreamResult:boolean};

/** Ordered: deterministic local tools first, then explicit commands, then web, then the model. */
export function routeMessage(question:string,ctx:RouteContext):ChatRoute{
 const q=question.trim();
 // Questions about tools are answered from the registry, not treated as invocations.
 if(toolKnowledgeIntent(q))return {kind:"tool-knowledge"};
 const diana=parseDianaInvocation(q);
 if(diana)return {kind:"diana",...diana};
 // Explicit editing must not auto-search, run CREAM or execute commands quoted in the source.
 if(isHumanizeRequest(q))return {kind:"continue"};
 if(capabilityIntent(q))return {kind:"capability"};
 if(extractTextMeasurements(q))return {kind:"cream-text"};
 if(creamInstruction(q))return {kind:"cream-csv"};
 for(const item of OPEN)if(item.re.test(q))return {kind:"open",section:item.section};
 const chart=creamChartFollowup(q);
 if(chart&&ctx.hasCreamResult)return {kind:"chart-followup",chart};
 if(planConversationSave(q))return {kind:"save-conversation"};
 if(selfInspectIntent(q))return {kind:"self-inspect"};
 const named=filenameFromQuestion(q);
 if(named&&!/^(?:src|tests|docs)\//.test(named.name))return {kind:"named-file",name:named.name,action:named.action};
 const saved=SAVED_FILE_READ.exec(q);
 if(saved)return {kind:"saved-file",name:saved[1].trim()};
 const url=linkReadingIntent(q);
 const app=planAppIntent(q);
 // Memory, sheets, projects and integrations are explicit commands; they win over web search.
 if(app&&app.kind!=="search"&&!url)return {kind:"app"};
 if(url)return ctx.privateMode?{kind:"private-blocked",what:"讀取網頁"}:{kind:"web-read",url};
 const explicit=SEARCH_REQUEST.exec(q)?.[1]?.trim()||(app?.kind==="search"?app.query:"");
 if(explicit)return ctx.privateMode?{kind:"private-blocked",what:"網路搜尋"}:{kind:"web-search",query:explicit,explicit:true};
 // Diana proactively selects real editors or local deterministic tools for clear action requests.
 // Existing file, memory, search and CREAM routes above retain precedence and consent.
 if(proposeProactiveDiana(q,{privateMode:ctx.privateMode,hasCreamResult:ctx.hasCreamResult}))return {kind:"diana",request:q,forcedTool:null};
 const implicit=!ctx.privateMode?implicitResearchQuery(q):null;
 if(implicit)return {kind:"web-search",query:implicit,explicit:false};
 return {kind:"continue"};
}
/** Checked only after app intents declined (e.g. sheet-cell edits need the saved workbook). */
export function routeTail(question:string):ChatRoute{
 const q=question.trim();
 const code=CODE_BUILDER.exec(q);
 if(code)return {kind:"code-builder",idea:code[1]?.trim()||q};
 const build=BUILD_REQUEST.exec(q);
 if(build)return {kind:"feature-builder",idea:build[1].trim()};
 if(CONVERSATIONAL_BUILD.test(q)&&/(?:Vanilla|功能|工具|模組)/i.test(q))return {kind:"feature-builder",idea:q};
 return {kind:"continue"};
}

/* ---------- slash commands ---------- */
export type SlashCommand={cmd:string;label:string;hint:string;example:string;tone:"blue"|"red"|"yellow"|"ink"};
export const SLASH_COMMANDS:SlashCommand[]=[
 {cmd:"/Notion",label:"Notion（選用同步）",hint:"開啟 Vanilla 本地排程；Notion 僅手動同步",example:"/Notion",tone:"blue"},
 {cmd:"/排程",label:"Vanilla 本地排程",hint:"離線新增、查看與更新任務，不需要登入",example:"/排程",tone:"blue"},
 {cmd:"/Quirinus",label:"Quirinus · 資安掃描",hint:"先檢查家庭管理者權限，逐次核准後才提交 GitHub Actions",example:"/Quirinus",tone:"blue"},
 {cmd:"/Diana",label:"Diana · Detroit 工具導航",hint:"選擇並叫出最適合的實際工具",example:"/Diana 幫我分析年度數據",tone:"blue"},
 {cmd:"/潤稿",label:"爾雅 Erya 自然化",hint:"以現有模型潤稿，保留數據與引用",example:"/潤稿 這段文字...",tone:"yellow"},
 {cmd:"/Orchestra",label:"Orchestra · 跨格式工作室",hint:"進入本機 DOCX、PPTX、圖片及動圖製作介面",example:"/Orchestra",tone:"yellow"},
 {cmd:"/Janus",label:"Janus · Detroit 郵件工具",hint:"本機產製 HTML／JSON、選用拖曳編輯",example:"/Janus",tone:"yellow"},
 {cmd:"/郵件",label:"Janus 郵件設計",hint:"相容舊版 Email Studio 指令",example:"/郵件",tone:"yellow"},
 {cmd:"/衞國",label:"衞國瀏覽器工具",hint:"管理 Playwright 與自訂工具",example:"/衞國",tone:"blue"},
 {cmd:"/搜尋",label:"網路搜尋",hint:"查資料、讀前幾篇並附來源",example:"/搜尋 2026 健保部分負擔",tone:"blue"},
 {cmd:"/讀",label:"讀取檔案或網址",hint:"已保存的檔案名稱，或貼上網址",example:"/讀 報告.pdf",tone:"blue"},
 {cmd:"/記住",label:"存進雲端記憶",hint:"需要 Google 登入",example:"/記住 週三晚上游泳課",tone:"yellow"},
 {cmd:"/回憶",label:"搜尋記憶",hint:"從 Drive 記憶找",example:"/回憶 游泳課",tone:"yellow"},
 {cmd:"/表格",label:"建立表格",hint:"直接產生可編輯工作簿",example:"/表格 家庭收支",tone:"red"},
 {cmd:"/分析",label:"CREAM 數據分析",hint:"上傳檔案或貼上 CSV",example:"/分析",tone:"red"},
 {cmd:"/建立",label:"做一個小工具",hint:"Self-Build 宣告式工具",example:"/建立 喝水紀錄",tone:"ink"},
 {cmd:"/改程式",label:"改進 Vanilla 程式碼",hint:"產生 GitHub Draft PR",example:"/改程式 修正登入按鈕",tone:"ink"},
 {cmd:"/私密",label:"切換私密模式",hint:"只用手機本地模型",example:"/私密",tone:"ink"},
 {cmd:"/新對話",label:"開新對話",hint:"目前對話收進「最近」",example:"/新對話",tone:"ink"},
 {cmd:"/功能",label:"Vanilla 能做什麼",hint:"即時功能狀態",example:"/功能",tone:"ink"}
];
export type SlashResult={text:string;ui?:"attach"|"private"|"new-chat"|"prompt";hint?:string;prefill?:string};
export function matchSlashCommands(input:string):SlashCommand[]{
 // iOS Chinese keyboards may insert a fullwidth slash or a fullwidth space.
 const t=input.trimStart().replace(/^／/,"/");
 if(t==="/")return SLASH_COMMANDS;
 const m=/^\/([^\s：:]*)$/.exec(t);
 if(!m)return [];
 return SLASH_COMMANDS.filter(c=>c.cmd.startsWith("/"+m[1]));
}
/** Rewrites a slash command into the canonical phrase the router already understands. */
export function expandSlashCommand(input:string):SlashResult|null{
 const normalized=input.trim().replace(/^／/,"/");
 // Accept "/搜尋 keyword", "/搜尋：keyword" and the corresponding fullwidth slash.
 const m=/^\/\s*([^\s：:]+)\s*(?:[：:]\s*)?([\s\S]*)$/.exec(normalized);
 if(!m)return null;
 const [,cmd,rest]=m,arg=rest.trim();
 const missing=(name:string,example:string):SlashResult=>({
  text:"",ui:"prompt",hint:"請在 /"+name+" 後輸入內容，例如："+example,prefill:"/"+name+" "
 });
 switch(cmd){
  case "Notion":case "notion":case "排程":return {text:"@Notion"+(arg?" "+arg:"")};
  case "Quirinus":case "quirinus":return {text:"@Quirinus"+(arg?" "+arg:"")};
  case "Diana":case "diana":return {text:"@Diana"+(arg?" "+arg:"")};
  case "Orchestra":case "orchestra":case "製作":return {text:arg?"@Orchestra "+arg:"開啟 Orchestra Studio"};
  case "Janus":case "janus":case "郵件":case "email":return {text:"開啟 Janus"};
  case "潤稿":case "humanize":return arg?{text:makeHumanizeRequest(arg)}:missing("潤稿","/潤稿 請修改這段文章");
  case "衞國":case "衛國":return {text:"開啟 衞國系統"};
  case "搜尋":case "search":return arg.length>=2?{text:"搜尋："+arg}:missing("搜尋","/搜尋 2027 PGY 招募");
  case "讀":case "讀取":case "read":
   if(!arg)return missing("讀","/讀 report.pdf");
   if(/^https:\/\//i.test(arg))return {text:"閱讀 "+arg};
   return {text:"讀取 `"+arg.replace(/`/g,"")+"`"};
  case "記住":return arg?{text:"記住："+arg}:missing("記住","/記住 週三晚上游泳課");
  case "回憶":return arg?{text:"回憶："+arg}:missing("回憶","/回憶 游泳課");
  case "忘記":return arg?{text:"忘記："+arg}:missing("忘記","/忘記 舊備忘錄");
  case "表格":return {text:"幫我建立"+(arg||"新")+(/表$|清單$/.test(arg)?"":"表格")};
  case "分析":return arg?{text:(arg.includes("\n")?"CREAM：\n":"")+arg}:{text:"",ui:"attach"};
  case "建立":
   if(!arg)return {text:"開啟 自建功能"};
   if(/表格|試算|清單|預算表|行程表/.test(arg))return {text:"幫我建立"+arg+(/表$|清單$|表格$/.test(arg)?"":"表格")};
   return {text:"新增功能："+arg};
  case "改程式":return {text:"Self-Build CODE"+(arg?"："+arg:"")};
  case "私密":return {text:"",ui:"private"};
  case "新對話":return {text:"",ui:"new-chat"};
  case "功能":case "help":return {text:"你能做什麼？"};
  default:return null;
 }
}
