import type {ChatTurn} from "../local-ai/engine";
import {vanillaSystemPrompt,STRUCTURED_SYSTEM_PROMPT,isAtuberModel} from "./prompts";
import {classifyTask,type TaskKind} from "./task-kind";
import {profileFor} from "./model-profiles";
import {ollamaRequestExtras} from "./generation-config";
import {fitHistory,estimateTokens} from "./context-budget";
import {readNDJSON} from "./stream-parsers";
import {stripThinking,cleanModelOutput} from "./output-cleanup";
import {ensureZhTw,toTaiwanese} from "./zh-tw";
import {availableNodes,authFor,hasNodes,selectNode} from "../nodes/registry";

const KEY="vanilla.ollama.connection.v1";
const SECRET_KEY="vanilla.ollama.proxy-token.v1";
export type OllamaConfig={endpoint:string;model:string;models:string[]};
export type OllamaModel={name:string;size?:number;details?:{parameter_size?:string;family?:string}};
export type OllamaTest={models:OllamaModel[];url:string};

function stored():OllamaConfig{
 try{
  const raw=localStorage.getItem(KEY);
  if(!raw)return {endpoint:"",model:"",models:[]};
  const value=JSON.parse(raw) as Partial<OllamaConfig>;
  return {endpoint:typeof value.endpoint==="string"?value.endpoint:"",model:typeof value.model==="string"?value.model:"",models:Array.isArray(value.models)?value.models.filter((m):m is string=>typeof m==="string").slice(0,4):[]};
 }catch{return {endpoint:"",model:"",models:[]};}
}
let config=stored();
let token="";
try{token=sessionStorage.getItem(SECRET_KEY)||"";}catch{}

export function getOllamaConfig():OllamaConfig{return {...config};}
export function getOllamaTokenConfigured():boolean{return Boolean(token);}
export function setOllamaConfig(next:OllamaConfig,accessToken?:string){
 const endpoint=next.endpoint.trim().replace(/\/+$/,"");
 const model=next.model.trim();
 if(endpoint)normalizeOllamaUrl(endpoint);
 if(endpoint!==config.endpoint&&accessToken===undefined)token="";
 const names=[model,...(next.models||[])].filter(Boolean);
 config={endpoint,model,models:[...new Set(names)].slice(0,4)};
 if(accessToken!==undefined)token=accessToken.trim();
 try{
  localStorage.setItem(KEY,JSON.stringify(config));
  if(token)sessionStorage.setItem(SECRET_KEY,token);
  else sessionStorage.removeItem(SECRET_KEY);
 }catch{}
 window.dispatchEvent(new Event("vanilla-ollama-changed"));
}
export function clearOllamaConfig(){
 config={endpoint:"",model:"",models:[]};token="";
 try{localStorage.removeItem(KEY);sessionStorage.removeItem(SECRET_KEY);}catch{}
 window.dispatchEvent(new Event("vanilla-ollama-changed"));
}
function normalizeOllamaUrl(value:string):string{
 let url:URL;
 try{url=new URL(value);}catch{throw new Error("請輸入完整的 Ollama HTTPS 連線網址");}
 if(url.username||url.password||url.search||url.hash)throw new Error("連線網址不可包含密碼、參數或片段");
 const loopback=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
 if(url.protocol!=="https:"&&!(url.protocol==="http:"&&loopback)){
  throw new Error("非本機 Ollama 必須經過 HTTPS 安全代理；請勿公開 11434 連接埠");
 }
 const pathname=url.pathname.replace(/\/+$/,"").replace(/\/api(?:\/chat|\/tags)?$/,"");
 return url.origin+pathname;
}
function headers(auth:string=token):HeadersInit{
 return {"Content-Type":"application/json",...(auth?{Authorization:"Bearer "+auth}:{})};
}
async function timedFetch(url:string,init:RequestInit={},auth=token):Promise<Response>{
 const controller=new AbortController();
 // Time out while waiting for the first byte (cold model load on a home host can be slow);
 // once streaming starts the caller's own signal governs cancellation.
 const timeout=setTimeout(()=>controller.abort(),240000);
 init.signal?.addEventListener("abort",()=>controller.abort(),{once:true});
 try{
  const response=await fetch(url,{...init,signal:controller.signal,headers:headers(auth)});
  if(!response.ok)throw new Error("Ollama HTTP "+response.status+"；請確認模型、代理授權與伺服器狀態");
  return response;
 }catch(e){
  if(e instanceof Error&&e.name==="AbortError")throw new Error(init.signal?.aborted?"已停止生成":"Ollama 連線逾時，請確認主機是否開機、網路及 HTTPS 代理設定");
  if(e instanceof TypeError)throw new Error("瀏覽器無法連接 Ollama：請檢查 HTTPS、CORS、網路或憑證設定");
  throw e;
 }finally{clearTimeout(timeout);}
}
export function isOllamaConfigured(){return Boolean((config.endpoint&&config.model)||hasNodes());}
export async function testOllama(endpoint=config.endpoint,accessToken?:string):Promise<OllamaTest>{
 const base=normalizeOllamaUrl(endpoint);
 const savedHost=config.endpoint?normalizeOllamaUrl(config.endpoint):"";
 const authorization=accessToken!==undefined?accessToken:(base===savedHost?token:"");
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(base+"/api/tags",{
   headers:authorization?{Authorization:"Bearer "+authorization}:{},
   signal:controller.signal
  });
  if(!response.ok)throw new Error("Ollama HTTP "+response.status+"，請檢查存取授權");
  const data=await response.json() as {models?:OllamaModel[]};
  if(!Array.isArray(data.models))throw new Error("伺服器沒有回傳有效 Ollama 模型清單");
  return {models:data.models.filter(x=>typeof x.name==="string"),url:base};
 }catch(e){
  if(e instanceof Error&&e.name==="AbortError")throw new Error("Ollama 偵測逾時");
  if(e instanceof TypeError)throw new Error("連接失敗：檢查 HTTPS、CORS 和網路；iPhone 的 localhost 並不是家裡的電腦");
  throw e;
 }finally{clearTimeout(timeout);}
}
/** Explicit user-triggered proof that an owner-configured October alias can infer.
 * A model appearing in /api/tags is NOT treated as a successful inference.
 * No paid cloud fallback, third-party credential, or persistent prompt logging.
 */
export async function probeAtuberModel(model:"october:sm"|"october:ml"|"october:lg"):
 Promise<{model:string;elapsedMs:number;responseTokens:number|null}>{
 if(!config.endpoint)throw new Error("尚未設定可連接的 Ollama HTTPS 主機");
 const base=normalizeOllamaUrl(config.endpoint);
 const available=await testOllama(config.endpoint);
 if(!available.models.some(x=>x.name===model))throw new Error(model+" 尚未安裝在這台主機");
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),120000);
 const started=performance.now();
 try{
  const res=await fetch(base+"/api/chat",{
   method:"POST",signal:controller.signal,
   headers:headers(),body:JSON.stringify({
    model,stream:false,think:false,keep_alive:"1m",
    options:{num_predict:32,num_ctx:2048,temperature:0},
    messages:[{role:"user",content:"請只回答：已連線"}]
   })
  });
  if(!res.ok)throw new Error("推論測試 HTTP "+res.status);
  const answer=await res.json() as {done?:boolean;message?:{content?:string};eval_count?:number};
  if(answer.done!==true||typeof answer.message?.content!=="string"||!answer.message.content.trim())
   throw new Error("模型未回傳完整的有效答案");
  return {model,elapsedMs:Math.round(performance.now()-started),
   responseTokens:Number.isInteger(answer.eval_count)?answer.eval_count!:null};
 }catch(error){
  if(error instanceof Error&&error.name==="AbortError")throw new Error("推論超過 120 秒，未驗證成功");
  throw error;
 }finally{clearTimeout(timeout);}
}

export type OllamaReplyOptions={task?:TaskKind;onText?:(text:string)=>void;signal?:AbortSignal;purpose?:"chat"|"structured";deep?:boolean;toolGrounding?:string};
/** Streams from Ollama /api/chat (NDJSON). Tuned per model: num_ctx large enough for web/file
 * context (Ollama silently truncates beyond it), keep_alive so a home host doesn't reload the
 * model every question, and thinking only where it pays off. */
export async function generateOllamaReply(history:ChatTurn[],model=config.model,options:OllamaReplyOptions={}):Promise<string>{
 const live=hasNodes()?await availableNodes():[];
 const candidate=selectNode(live,model||undefined);
 if(!model&&candidate)model=candidate.models[0];
 if((!config.endpoint&&!candidate)||!model)throw new Error("沒有已配對且具備模型的 Ollama 運算節點");
 const base=candidate?candidate.endpoint:normalizeOllamaUrl(config.endpoint);
 const activeToken=candidate?authFor(candidate.id):token;
 const latest=history[history.length-1]?.content||"";
 const structured=options.purpose==="structured";
 const task=options.task??(structured?"code":classifyTask(latest));
 const profile=profileFor("ollama",model);
 if(!structured)await ensureZhTw().catch(()=>undefined);
 const system=structured?STRUCTURED_SYSTEM_PROMPT:
  vanillaSystemPrompt({task,compact:profile.compactPrompt,latestUserText:latest,tongcheng:isAtuberModel(model)})+
  (options.toolGrounding?"\n\n[Vanilla 應用程式提供的可信任工具事實；僅用於解釋功能，非操作授權]\n"+options.toolGrounding:"");
 const turns=fitHistory(history.slice(-20).map(x=>({role:x.role,content:x.content})),Math.max(1024,profile.contextTokens-profile.maxOutput[task]-estimateTokens(system)-64));
 const send=async(withThink:boolean)=>{
  const extras=ollamaRequestExtras(model,task,Boolean(options.deep));
  if(!withThink)delete extras.think;
  // Ollama's grammar-constrained JSON mode makes Sheets/Self-Build drafts parse reliably.
  return timedFetch(base+"/api/chat",{method:"POST",signal:options.signal,body:JSON.stringify({model,stream:true,messages:[{role:"system",content:system},...turns],...extras,...(structured&&withThink?{format:"json"}:{})})},activeToken);
 };
 let res:Response;
 try{res=await send(true);}
 catch(error){
  // Older Ollama builds reject the `think` field; retry once without it.
  if(error instanceof Error&&/HTTP 400/.test(error.message))res=await send(false);else throw error;
 }
 let text="",failure="",completed=false,truncated=false;
 await readNDJSON<{message?:{content?:string};error?:string;done?:boolean}>(res,chunk=>{
  if(chunk.error){failure=chunk.error;return;}
  if(chunk.done){completed=true;truncated=(chunk as {done_reason?:string}).done_reason==="length";}
  const piece=chunk.message?.content||"";
  if(piece){
   text+=piece;
   if(options.onText){const view=stripThinking(text);options.onText(toTaiwanese(view.text)||(view.thinking?"（正在思考…）":""));}
  }
 });
 if(failure)throw new Error(failure);
 if(!completed)throw new Error("Ollama 串流未正常完成，已拒絕將不完整回答顯示成成功。");
 if(truncated)throw new Error("Ollama 達到生成長度上限，已拒絕將截斷的答案視為完成。");
 const answer=structured?stripThinking(text).text.trim():toTaiwanese(cleanModelOutput(text));
 if(!answer)throw new Error("Ollama 未回傳回答");
 return answer;
}
