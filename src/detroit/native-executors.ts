/** Real Detroit executors. No model-generated function names, URLs, or code are executed.
 * All data/results flow back through the bus; optional adapters are NOT registered.
 */
import {detroitBus} from "./capability-bus";
import {searchLiveWeb} from "../search/live-search";
import {parseCreamCSV,analyzeCream} from "../cream/core";
import {createRetinaDocument,downloadRetina,type RetinaFormat} from "./retina";
import {buildEmailTemplate,type EmailTemplateKind} from "../email/email-templates";
import {promptLuna,parseLunaLibrary,lunaStorageKey,LUNA_MAX_PROJECTS} from "../luna/model";
import {lunaPNG,saveLunaFile} from "../luna/export";
import {bardGenerate,bardSave} from "./bard";
import {recallVictoria,isVictoriaEnabled} from "./victoria";
import {
 getMedusaStatus,runMedusa,executeQuirinusFamilyScan,
 getWeiGuoLucaSummary,getWeiGuoCeresStatus,getWeiGuoCeresEvents,
 type MedusaOutput,type QuirinusFamilyRun,type LucaSnapshot
} from "../weiguo/api";

type ScoutInput={query:string};
type CreamInput={csv:string;source?:string};
type RetinaInput={title:string;body:string;format:RetinaFormat;download:boolean};
type JanusInput={kind:EmailTemplateKind;title:string;body:string;brand:string;download:boolean};
type LunaInput={prompt:string;owner:string;download:boolean;save:boolean};
type VictoriaInput={query:string;owner:string};
type BardInput={prompt:string;download:boolean};
type MedusaInput={source_code:string;stdin?:string};
type QuirinusInput={approval_token:string};
type CeresInput={operation:"status"|"events"};
export type NativeRetinaResult={filename:string;format:RetinaFormat;sections:number};
export type NativeJanusResult={filename:string;format:"html";bytes:number};
export type NativeLunaResult={filename:string;format:"png";layers:number;savedEditable:boolean};
export type NativeBardResult={filename:string;mime:string;model:string};
export type NativeMedusaResult=MedusaOutput;
export type NativeQuirinusResult=QuirinusFamilyRun;
export type NativeLucaResult=LucaSnapshot;
export type NativeCeresResult=Awaited<ReturnType<typeof getWeiGuoCeresEvents>>|Awaited<ReturnType<typeof getWeiGuoCeresStatus>>;
let registered=false;
function assertObject(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Detroit 工具輸入不是物件");
 return value as Record<string,unknown>;
}
function limited(value:unknown,max:number):string{
 if(typeof value!=="string"||!value.trim()||value.length>max)throw Error("Detroit 工具輸入長度不符");
 return value.trim();
}
function downloadText(name:string,content:string,mime:string):void{
 const url=URL.createObjectURL(new Blob([content],{type:mime}));
 try{
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
 }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function registerDetroitNativeExecutors():void{
 if(registered)return;
 detroitBus.register("scouts",async(raw,ctx)=>{
  const data=assertObject(raw),query=limited(data.query,180);
  if(ctx.privateMode)throw Error("私密模式不可搜尋外網");
  return searchLiveWeb(query);
 });
 detroitBus.register("cream",async(raw)=>{
  const data=assertObject(raw),csv=limited(data.csv,2000000);
  return analyzeCream(parseCreamCSV(csv,typeof data.source==="string"?data.source:"Detroit 匯入資料"));
 });
 detroitBus.register("retina",async(raw)=>{
  const data=assertObject(raw);
  const title=limited(data.title,100),body=limited(data.body,160000);
  if(!["pdf","docx","pptx"].includes(String(data.format)))throw Error("Retina 不支援此輸出格式");
  const request:RetinaInput={title,body,format:data.format as RetinaFormat,download:data.download===true};
  const artifact=await createRetinaDocument({title:request.title,body:request.body,format:request.format});
  if(request.download)downloadRetina(artifact);
  const result:NativeRetinaResult={filename:artifact.name,format:request.format,sections:artifact.sections};
  return result;
 });
 detroitBus.register("janus",async(raw)=>{
  const data=assertObject(raw);
  if(!["invitation","newsletter","announcement"].includes(String(data.kind)))throw Error("Janus 模板類型不支援");
  const input:JanusInput={kind:data.kind as EmailTemplateKind,title:limited(data.title,160),
   body:limited(data.body,16000),brand:limited(data.brand,100),download:data.download===true};
  const output=buildEmailTemplate(input.kind,{brand:input.brand,title:input.title,
   message:input.body,buttonText:"了解更多",buttonUrl:""});
  const name="Janus-"+input.kind+"-"+new Date().toISOString().slice(0,10)+".html";
  if(input.download)downloadText(name,output.html,"text/html;charset=utf-8");
  const result:NativeJanusResult={filename:name,format:"html",bytes:new TextEncoder().encode(output.html).length};
  return result;
 });
 // Cloud image generation requires the browser's explicit per-invocation approval.
 detroitBus.register("bard",async(raw,ctx)=>{
  const data=assertObject(raw);
  const input:BardInput={prompt:limited(data.prompt,3000),download:data.download===true};
  const output=await bardGenerate(input.prompt,{privateMode:ctx.privateMode,approved:ctx.approved===true,signal:ctx.signal});
  const suffix=output.mime==="image/jpeg"?"jpg":output.mime==="image/webp"?"webp":"png";
  const filename="Bard-"+new Date().toISOString().slice(0,10)+"."+suffix;
  if(input.download)bardSave(output);
  const receipt:NativeBardResult={filename,mime:output.mime,model:output.model};
  return receipt;
 });
 // Each remote adapter still validates the signed-in owner and live backend status.
 // A registered method never grants entitlement or implies the server is deployed.
 detroitBus.register("medusa",async(raw)=>{
  const data=assertObject(raw);
  const status=await getMedusaStatus();
  if(!status.enabled||!status.connected)throw Error("Medusa 後端尚未啟用："+status.note);
  const source_code=limited(data.source_code,16000);
  const stdin=typeof data.stdin==="string"?data.stdin:"";
  return runMedusa(source_code,stdin,true);
 });
 detroitBus.register("quirinus",async(raw)=>{
  const data=assertObject(raw);
  return executeQuirinusFamilyScan(limited(data.approval_token,128),true);
 });
 detroitBus.register("luca",async()=>getWeiGuoLucaSummary());
 detroitBus.register("ceres",async(raw)=>{
  const data=assertObject(raw),input:CeresInput={operation:data.operation==="events"?"events":"status"};
  return input.operation==="events"?getWeiGuoCeresEvents():getWeiGuoCeresStatus();
 });
 detroitBus.register("victoria",async(raw,ctx)=>{
  const data=assertObject(raw);
  const input:VictoriaInput={query:limited(data.query,16000),owner:limited(data.owner,150)};
  return recallVictoria(input.query,{owner:input.owner,enabled:isVictoriaEnabled(input.owner),privateMode:ctx.privateMode});
 });
 detroitBus.register("luna",async(raw,ctx)=>{
  const data=assertObject(raw),prompt=limited(data.prompt,300);
  const input:LunaInput={prompt,owner:limited(data.owner,150),download:data.download===true,save:data.save===true};
  const design=promptLuna(input.prompt);
  const image=await lunaPNG(design);
  const filename="LUNA-"+new Date().toISOString().slice(0,10)+".png";
  if(input.download)saveLunaFile(filename,image);
  let savedEditable=false;
  if(input.save&&!ctx.privateMode){
   const key=lunaStorageKey(input.owner);
   const library=parseLunaLibrary(JSON.parse(localStorage.getItem(key)||"null") as unknown);
   if(library.projects.length<LUNA_MAX_PROJECTS){
    localStorage.setItem(key,JSON.stringify({projects:[...library.projects,design],activeId:design.id}));
    savedEditable=true;
   }
  }
  const result:NativeLunaResult={filename,format:"png",layers:design.layers.length,savedEditable};
  return result;
 });
 registered=true;
}
/** No implicit cloud, email sending or arbitrary plugins. Execution receipts only follow real tool completion. */
export async function executeDetroitNative<T>(id:"scouts"|"cream"|"retina"|"janus"|"luna"|"victoria"|"bard"|"medusa"|"quirinus"|"luca"|"ceres",
 input:ScoutInput|CreamInput|RetinaInput|JanusInput|LunaInput|VictoriaInput|BardInput|MedusaInput|QuirinusInput|CeresInput,
 context:{privateMode:boolean;approved?:boolean;signal?:AbortSignal}):Promise<T>{
 registerDetroitNativeExecutors();
 const receipt=await detroitBus.execute(id,input,context);
 return receipt.result as T;
}
