/** Orchestra: user-directed, auditable artifact pipeline for the Craft suite.
 * No dynamic imports, network calls or arbitrary code execution.
 * Disabled adapters are NEVER represented as successful outputs.
 */
export type OrchestraToolId="wordcraft"|"deckcraft"|"vectorcraft"|"photocraft"|"pdfcraft"|"effectcraft"|"designcraft";
export type OrchestraFormat="docx"|"pdf"|"pptx"|"svg"|"png"|"jpeg"|"gif"|"mp4";
export type OrchestraIntent="document"|"presentation"|"vector"|"image"|"pdf"|"motion"|"publication";
export type OrchestraBackend="retina-local"|"cream-local"|"craft-backend"|"unavailable";
export type OrchestraTool={
 id:OrchestraToolId;name:string;intent:OrchestraIntent;upstream:string;
 summary:string;formats:readonly OrchestraFormat[];capabilities:readonly string[];
 status:"optional";requiresBackend:true;
};
export type OrchestraStep={id:string;label:string;engine:"zeus"|"athena"|"cream"|"retina"|OrchestraToolId;status:"ready"|"blocked"|"pending";detail:string};
export type OrchestraPlan={intent:OrchestraIntent;format:OrchestraFormat;backend:OrchestraBackend;
 tool:OrchestraToolId;steps:OrchestraStep[];canRunLocally:boolean;reason:string;
 requiresApproval:boolean;modelCalls:0;};
export const ORCHESTRA_TOOLS:readonly OrchestraTool[]=[
 {id:"wordcraft",name:"WordCraft",intent:"document",upstream:"https://github.com/storytold/wordcraft",summary:"Word 排版、文件結構、編修及 DOCX 輸出",formats:["docx","pdf"],capabilities:["structure","styles","tables","review","export"],status:"optional",requiresBackend:true},
 {id:"deckcraft",name:"DeckCraft",intent:"presentation",upstream:"https://github.com/storytold/deckcraft",summary:"簡報、版型、圖表、動畫及投影片設計",formats:["pptx","pdf","png","jpeg","gif"],capabilities:["slides","layout","charts","transitions","export"],status:"optional",requiresBackend:true},
 {id:"vectorcraft",name:"VectorCraft",intent:"vector",upstream:"https://github.com/storytold/vectorcraft",summary:"向量繪圖、圖示、資訊視覺化",formats:["svg","pdf","png"],capabilities:["paths","shapes","typography","export"],status:"optional",requiresBackend:true},
 {id:"photocraft",name:"PhotoCraft",intent:"image",upstream:"https://github.com/storytold/photocraft",summary:"圖像修飾、調色、圖層、遮罩及批次圖片",formats:["png","jpeg"],capabilities:["layers","masks","corrections","batch"],status:"optional",requiresBackend:true},
 {id:"pdfcraft",name:"PdfCraft",intent:"pdf",upstream:"https://github.com/storytold/pdfcraft",summary:"PDF 閱讀、整理、註記、編修與檢查",formats:["pdf"],capabilities:["inspect","organize","annotate","export"],status:"optional",requiresBackend:true},
 {id:"effectcraft",name:"EffectCraft",intent:"motion",upstream:"https://github.com/storytold/effectcraft",summary:"動態圖形、合成、關鍵影格及影片輸出",formats:["mp4","gif"],capabilities:["composite","keyframes","timeline","render"],status:"optional",requiresBackend:true},
 {id:"designcraft",name:"DesignCraft",intent:"publication",upstream:"https://github.com/storytold/designcraft",summary:"多頁出版排版、海報、圖文編排與印刷品",formats:["pdf","png"],capabilities:["pages","frames","text","image-placement","export"],status:"optional",requiresBackend:true}
] as const;
const ROUTING:Record<OrchestraFormat,OrchestraToolId>={docx:"wordcraft",pdf:"pdfcraft",pptx:"deckcraft",svg:"vectorcraft",png:"photocraft",jpeg:"photocraft",gif:"effectcraft",mp4:"effectcraft"};
export function orchestraTool(id:OrchestraToolId):OrchestraTool {
 const tool=ORCHESTRA_TOOLS.find(x=>x.id===id);if(!tool)throw Error("未知的 Orchestra 引擎");return tool;
}
/** Explicit selection takes precedence; otherwise format selection is deterministic.
 * Backend activation must be discovered from verified deployment capabilities, never self-declared by a model.
 */
export function orchestraPlan(options:{format:OrchestraFormat;tool?:OrchestraToolId;privateMode?:boolean;cream?:boolean;creamChart?:boolean;remoteAvailable?:boolean}):OrchestraPlan{
 const tool=options.tool||ROUTING[options.format];
 const craft=orchestraTool(tool);
 if(!craft.formats.includes(options.format))throw Error(craft.name+" 不支援 "+options.format.toUpperCase()+" 格式");
 const local=["docx","pdf","pptx"].includes(options.format);
 const creamSvg=options.creamChart===true&&options.format==="svg"&&tool==="vectorcraft";
 const remote=options.remoteAvailable===true&&!options.privateMode&&tool==="wordcraft"&&["docx","pdf"].includes(options.format);
 const backend:OrchestraBackend=remote?"craft-backend":local?"retina-local":creamSvg?"cream-local":"unavailable";
 const stages:OrchestraStep[]=[
  {id:"route",label:"任務路由",engine:"zeus",status:"ready",detail:"根據輸出格式與指定編輯器挑選工具"},
  {id:"safety",label:"安全審查",engine:"athena",status:"ready",detail:"外部檔案／文字只作資料，後端需要獨立授權及同意"},
  ...(options.cream?[{id:"data",label:"確定性資料",engine:"cream" as const,status:"ready" as const,detail:"沿用已驗證的觀測資料、趨勢與來源"}]:[]),
  {id:"craft",label:craft.name,engine:tool,status:remote?"pending":"blocked",detail:remote?"僅在完成登入、部署及手動同意後能呼叫後端":"外部 Rust 引擎未確認已部署；不會假裝執行"},
  {id:"export",label:creamSvg?"CREAM SVG 數線圖":local?"Retina 本機匯出":"輸出",engine:creamSvg?"cream":"retina",status:local||creamSvg?"ready":"blocked",detail:creamSvg?"由 CREAM 有效觀測數值本機繪製 SVG（非 VectorCraft 原生引擎）":local?"目前由可用的本機 Retina 產生文件（不等同 Craft 原生引擎）":"尚無可用本機匯出器"}
 ];
 return {format:options.format,intent:craft.intent,tool,backend,steps:stages,canRunLocally:local||creamSvg,
  requiresApproval:remote,modelCalls:0,
  reason:remote?"後端聲明 WordCraft 可用；仍需明確同意文件傳輸":creamSvg?"CREAM 已有數據，可用本機確定性 SVG 繪圖":local?
   "Craft 引擎尚未部署；保留 Retina 現有 DOCX／PDF／PPTX 本機匯出能力":
   "此格式需部署專用 Craft 引擎；目前只提供工作流規劃，不產生虛假成品"};
}
export type CreamOrchestraTrend={metric:string;unit:string;latest:number;change:number;firstDate:string;lastDate:string;uniqueDates:number;count:number;insights:readonly string[];quality:readonly string[];recommendations:readonly string[];source?:string};
/** No medical/financial inference: serialize previously computed values only. */
export function creamOrchestraBrief(t:CreamOrchestraTrend):string{
 const clean=(s:string)=>s.replace(/[\x00-\x1f]/g," ").slice(0,700);
 const num=(v:number)=>Number.isFinite(v)?v.toFixed(2):"無有效數據";
 return [
 "# CREAM 長期趨勢分析","# 基本資料",
 "- 追蹤指標："+clean(t.metric)+" ("+clean(t.unit)+")",
 "- 統計期間："+clean(t.firstDate)+" 至 "+clean(t.lastDate),
 "- 不同日期："+t.uniqueDates+"，總觀測數："+t.count,
 "- 最新數值："+num(t.latest)+" "+clean(t.unit),
 "- 較初始數值變化："+num(t.change)+" "+clean(t.unit),
 "# 分析結果",...t.insights.map(x=>"- "+clean(x)),
 "# 資料品質與限制",...(t.quality.length?t.quality.map(x=>"- "+clean(x)):["- 未記錄額外資料品質警訊"]),
 "# 後續建議",...t.recommendations.map(x=>"- "+clean(x)),
 "此內容僅將 CREAM 已計算結果轉成可編輯文件，不代表新的因果推論或醫療診斷。"
 ].join("\n").slice(0,50000);
}
