/** Vanilla model tuning profiles.
 * One place that knows each model family's real limits (context window, thinking switch,
 * output length) and the sampling that works best per task. Values follow the model
 * vendors' published guidance where it exists (Qwen model cards, DeepSeek parameter table,
 * Gemini thinking docs) and conservative defaults elsewhere. Nothing here calls a network.
 */
import type {TaskKind} from "./task-kind";

export type ProfileSource="local"|"ollama"|"gemini"|"deepseek"|"openai"|"anthropic"|"openrouter";
export type ThinkingStyle="none"|"qwen3-switch"|"gemini-level"|"deepseek-switch"|"ollama-think"|"always";
export type TaskNumbers=Record<TaskKind,number>;
export type ModelProfile={
 source:ProfileSource;model:string;family:string;
 /** Total context window in tokens (prompt + answer). */
 contextTokens:number;
 /** Rough quality tier 0-100 used by the router. */
 tier:number;
 paramsB:number;
 /** Tiny models follow a short system prompt far better than a long one. */
 compactPrompt:boolean;
 thinking:ThinkingStyle;
 maxOutput:TaskNumbers;
 /** null = keep the provider default (Gemini 3+ is tuned for its default temperature). */
 temperature:Record<TaskKind,number|null>;
 topP:number|null;
 frequencyPenalty:number;
 presencePenalty:number;
};

export type LocalCatalogEntry={id:string;label:string;description:string;family:string;paramsB:number;vramMB:number;thinking:ThinkingStyle;recommended?:boolean};
/** Curated WebLLM models. The runtime still checks each id against the installed WebLLM
 * prebuilt list, so ids missing from an older/newer package are hidden, never fabricated. */
export const LOCAL_CATALOG:LocalCatalogEntry[]=[
 {id:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",label:"輕量 · Qwen2.5 0.5B",description:"約 1 GB。最省記憶體、反應最快；適合閒聊與簡單問題。",family:"qwen2.5",paramsB:0.5,vramMB:945,thinking:"none"},
 {id:"Qwen3-0.6B-q4f16_1-MLC",label:"OCTUBER FLATTERING · 0.6B",description:"Qwen3 0.6B 基底，模型下載約需 1.4 GB GPU 記憶體。裝置端離線運行，不代表已完成 OCTUBER 專屬權重微調。",family:"qwen3",paramsB:0.6,vramMB:1404,thinking:"qwen3-switch",recommended:true},
 {id:"Qwen3.5-0.8B-q4f16_1-MLC",label:"輕量最新 · Qwen3.5 0.8B",description:"約 1.6 GB。新一代小模型（需較新的 WebLLM 版本）。",family:"qwen3.5",paramsB:0.8,vramMB:1630,thinking:"qwen3-switch"},
 {id:"Qwen2.5-1.5B-Instruct-q4f16_1-MLC",label:"平衡 · Qwen2.5 1.5B",description:"約 1.6 GB。中文表現與速度平衡，多數新款 iPhone 可用。",family:"qwen2.5",paramsB:1.5,vramMB:1630,thinking:"none",recommended:true},
 {id:"Qwen3-1.7B-q4f16_1-MLC",label:"平衡新版 · Qwen3 1.7B",description:"約 2 GB。推理與中文更穩；建議 8 GB 記憶體以上裝置。",family:"qwen3",paramsB:1.7,vramMB:2037,thinking:"qwen3-switch"},
 {id:"Qwen3.5-2B-q4f16_1-MLC",label:"平衡最新 · Qwen3.5 2B",description:"約 2.2 GB。新一代平衡模型（需較新的 WebLLM 版本）。",family:"qwen3.5",paramsB:2,vramMB:2245,thinking:"qwen3-switch"},
 {id:"Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",label:"程式 · Qwen2.5 Coder 1.5B",description:"約 1.6 GB。程式碼專用，一般聊天較弱。",family:"qwen2.5-coder",paramsB:1.5,vramMB:1630,thinking:"none"},
 {id:"Qwen2.5-3B-Instruct-q4f16_1-MLC",label:"進階 · Qwen2.5 3B",description:"約 2.5 GB。品質較好，但手機可能記憶體不足。",family:"qwen2.5",paramsB:3,vramMB:2505,thinking:"none"},
 {id:"Qwen3-4B-q4f16_1-MLC",label:"進階新版 · Qwen3 4B",description:"約 3.4 GB。適合電腦或 iPad；手機多半無法載入。",family:"qwen3",paramsB:4,vramMB:3432,thinking:"qwen3-switch"},
 {id:"Llama-3.2-3B-Instruct-q4f16_1-MLC",label:"英文 · Llama 3.2 3B",description:"約 2.3 GB。英文較強，中文表現普通。",family:"llama3",paramsB:3,vramMB:2264,thinking:"none"},
 {id:"gemma-2-2b-it-q4f16_1-MLC",label:"Gemma 2 2B",description:"約 1.9 GB。Google 開源小模型，多語言尚可。",family:"gemma2",paramsB:2,vramMB:1895,thinking:"none"}
];
export const DEFAULT_LOCAL_MODEL="Qwen3-0.6B-q4f16_1-MLC";

/** Suggested cloud model ids (Oct 2026). Users can still type any id their account supports. */
export const GEMINI_SUGGESTIONS=[
 {id:"gemini-3.8-flash",label:"Gemini 3.8 Flash（建議・品質）"},
 {id:"gemini-3.5-flash-lite",label:"Gemini 3.5 Flash-Lite（建議・快速省額度）"},
 {id:"gemini-3.6-flash",label:"Gemini 3.6 Flash"},
 {id:"gemini-4-argon",label:"Gemini 4 Argon（旗艦、較慢較貴）"},
 {id:"gemini-2.5-flash",label:"Gemini 2.5 Flash（舊版，僅限近期使用過的帳號）"}
];
export const DEEPSEEK_SUGGESTIONS=[
 {id:"deepseek-flash",label:"DeepSeek Flash（V4.1，建議）"},
 {id:"deepseek-v4-pro",label:"DeepSeek V4 Pro（品質較高）"},
 {id:"deepseek-chat",label:"deepseek-chat（舊名稱）"}
];
export const DEFAULT_GEMINI_MODEL="gemini-3.8-flash";
export const DEFAULT_DEEPSEEK_MODEL="deepseek-flash";
/** The cheap/fast Gemini sibling Vanilla may offer as a second candidate. */
export function geminiLiteSibling(model:string):string{
 if(/^gemini-2\.5/i.test(model))return "gemini-2.5-flash-lite";
 return "gemini-3.5-flash-lite";
}
export function isGeminiLite(model:string):boolean{return /flash-lite/i.test(model);}

const T=(casual:number,general:number,writing:number,analysis:number,code:number,vision:number):TaskNumbers=>({casual,general,writing,analysis,code,vision});
const temp=(casual:number|null,general:number|null,writing:number|null,analysis:number|null,code:number|null,vision:number|null)=>({casual,general,writing,analysis,code,vision});

export function parseParamsB(model:string):number{
 const m=model.match(/(?:^|[^0-9.])([0-9]+(?:\.[0-9]+)?)\s*[bB](?![a-z])/);
 return m?Number(m[1]):0;
}

function localProfile(model:string):ModelProfile{
 const entry=LOCAL_CATALOG.find(x=>x.id===model);
 const paramsB=entry?.paramsB??(parseParamsB(model)||0.5);
 const family=entry?.family??(/qwen3/i.test(model)?"qwen3":/qwen/i.test(model)?"qwen2.5":"local");
 const tiny=paramsB<1.2;
 const qwen3=/qwen3/i.test(family);
 // Qwen3 non-thinking: model card suggests T≈0.7, top_p 0.8; Qwen2.5: T≈0.7, top_p 0.8.
 // Small quantized models drift at high temperature, so analysis/code stay low.
 const out=tiny?T(320,640,768,768,768,0):paramsB<2.5?T(400,900,1024,1024,1152,0):T(480,1024,1280,1280,1408,0);
 return {source:"local",model,family,contextTokens:/-1k$/i.test(model)?1024:4096,
  tier:tiny?(qwen3?36:30):paramsB<2.5?(qwen3?58:52):(qwen3?66:60),paramsB,compactPrompt:paramsB<2.5,
  thinking:entry?.thinking??(qwen3?"qwen3-switch":"none"),maxOutput:out,
  temperature:temp(0.7,0.55,0.75,0.3,0.15,null),topP:0.8,
  // Mild penalties only: strong penalties damage Chinese fluency (common particles repeat naturally).
  frequencyPenalty:tiny?0.15:0.05,presencePenalty:qwen3?0.3:tiny?0.1:0};
}

function ollamaProfile(model:string):ModelProfile{
 const name=model.toLowerCase();
 // Owner-hosted aliases hide the base Qwen model name. Without an explicit
 // lineage mapping, all three would be treated as unknown 7B models and
 // 14B/30B would silently lose their intended thinking configuration.
 const octoberBaseParams:Record<string,number>={
  "october:sm":4,"october:ml":14,"october:lg":30,
  "octuber:flattering":4,"octuber:modest":14,"octuber:sumptuous":30,
  "octuber:sumptuous-32b":32
 };
 const aliasParams=octoberBaseParams[name];
 const paramsB=aliasParams??(parseParamsB(name)||(/taide/.test(name)?8:7));
 const thinking:ThinkingStyle=/deepseek-r1|qwq/.test(name)?"always":
  (/qwen3|magistral/.test(name)||aliasParams!==undefined)?"ollama-think":"none";
 const scale=paramsB>=27?14:paramsB>=12?11:paramsB>=7?8:paramsB>=3?4:paramsB>=1.5?1:-5;
 const taide=/taide/.test(name);
 return {source:"ollama",model,family:taide?"taide":name.split(/[:/]/).pop()?.split(/[-_]/)[0]||"ollama",
  contextTokens:ollamaContextSetting(),tier:68+scale+(taide?2:0),paramsB,compactPrompt:paramsB<3,thinking,
  maxOutput:T(512,1536,2048,2048,3072,0),
  temperature:temp(0.7,0.55,0.75,0.3,0.15,null),topP:0.9,frequencyPenalty:0,presencePenalty:0};
}

function geminiProfile(model:string):ModelProfile{
 const m=model.toLowerCase();
 const v3=/gemini-(?:[3-9]|4)/.test(m)&&!/gemini-2/.test(m);
 const lite=isGeminiLite(m);
 const flagship=/argon|pro/.test(m);
 const tier=/gemini-4/.test(m)?97:/3\.8/.test(m)?92:/3\.6/.test(m)?89:flagship?93:lite?(v3?82:72):v3?88:85;
 return {source:"gemini",model,family:"gemini",contextTokens:1000000,tier,paramsB:0,compactPrompt:false,
  thinking:"gemini-level",
  // max_output_tokens includes thought tokens; keep it generous so answers aren't cut off mid-thought.
  maxOutput:T(2048,8192,8192,12288,16384,4096),
  // Gemini 3+ is tuned around its default temperature (lower values can cause looping).
  temperature:v3?temp(null,null,null,null,null,null):temp(0.8,0.6,0.8,0.35,0.2,0.4),
  topP:null,frequencyPenalty:0,presencePenalty:0};
}

function deepseekProfile(model:string):ModelProfile{
 const m=model.toLowerCase();
 const legacy=/deepseek-(?:chat|reasoner)/.test(m);
 // DeepSeek's own table: code/math 0.0, data analysis 1.0, conversation 1.3, creative writing 1.5.
 return {source:"deepseek",model,family:"deepseek",contextTokens:legacy?64000:1000000,tier:/pro/.test(m)?93:legacy?80:88,paramsB:0,compactPrompt:false,
  thinking:legacy?(/reasoner/.test(m)?"always":"none"):"deepseek-switch",
  maxOutput:T(2048,8192,8192,16384,16384,0),
  temperature:temp(1.3,1.3,1.3,1.0,0,null),topP:null,frequencyPenalty:0,presencePenalty:0};
}

export function profileFor(source:ProfileSource,model:string):ModelProfile{
 if(source==="local")return localProfile(model);
 if(source==="ollama")return ollamaProfile(model);
 if(source==="gemini")return geminiProfile(model);
 if(source==="deepseek")return deepseekProfile(model);
 // Generic cloud relay profiles are intentionally conservative: no invented
 // model capabilities or provider pricing. Actual limits are server enforced.
 const base=deepseekProfile(model);
 return {...base,source,model,family:source,contextTokens:32000,
   tier:85,thinking:"none"};

}

/* ---------- user-adjustable Ollama context window ---------- */
const OLLAMA_CTX_KEY="vanilla.ollama.num-ctx.v1";
export const OLLAMA_CTX_CHOICES=[4096,8192,16384,32768];
export function ollamaContextSetting():number{
 try{const n=Number(globalThis.localStorage?.getItem(OLLAMA_CTX_KEY));return OLLAMA_CTX_CHOICES.includes(n)?n:8192;}catch{return 8192;}
}
export function setOllamaContextSetting(n:number):void{
 if(!OLLAMA_CTX_CHOICES.includes(n))throw Error("不支援的上下文長度");
 try{globalThis.localStorage?.setItem(OLLAMA_CTX_KEY,String(n));}catch{}
}
