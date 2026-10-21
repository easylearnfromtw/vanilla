/** Live October→Diana handoff for a single bounded, user-invoked CSV task.
 * This is REAL Ollama Qwen inference, not fabricated tool execution. Model
 * output is always untrusted and can never grant backend permissions.
 */
import {generateOllamaReply,getOllamaConfig} from "../ai/ollama";
import {isOctoberModel} from "../ai/october-persona";

export type OctoberModelPlan={
 status:"proposed"|"blocked";capability:"cream"|null;
 modelInvoked:boolean;reason:string;
};
export type OctoberCsvMetadata={rows:number;columns:number;serverRequested:boolean;privateMode:boolean};
export function validateOctoberModelPlan(output:unknown):OctoberModelPlan{
 let parsed:unknown=output;
 try{if(typeof output==="string")parsed=JSON.parse(output);}catch{
  return {status:"blocked",capability:null,modelInvoked:true,reason:"INVALID_MODEL_JSON"};
 }
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
  return {status:"blocked",capability:null,modelInvoked:true,reason:"INVALID_MODEL_PLAN"};
 const p=parsed as Record<string,unknown>;
 const keys=Object.keys(p).sort();
 if(keys.join(",")!=="decision,readOnly,tool"||p.readOnly!==true)
  return {status:"blocked",capability:null,modelInvoked:true,reason:"UNTRUSTED_MODEL_FIELDS"};
 if(p.decision==="analyze"&&p.tool==="cream")
  return {status:"proposed",capability:"cream",modelInvoked:true,reason:"MODEL_PROPOSED_READONLY_CREAM"};
 return {status:"blocked",capability:null,modelInvoked:true,reason:"MODEL_REFUSED_OR_UNSUPPORTED"};
}
export async function planOctoberCsvWithQwen(meta:OctoberCsvMetadata):Promise<OctoberModelPlan>{
 if(meta.privateMode||!Number.isInteger(meta.rows)||meta.rows<1||meta.rows>3000||
    !Number.isInteger(meta.columns)||meta.columns<2||meta.columns>12||
    typeof meta.serverRequested!=="boolean"){
  return {status:"blocked",capability:null,modelInvoked:false,reason:"TASK_METADATA_OR_PRIVACY_BLOCK"};
 }
 const model=getOllamaConfig().model;
 if(!isOctoberModel(model))
  return {status:"blocked",capability:null,modelInvoked:false,reason:"OCTOBER_MODEL_NOT_SELECTED"};
 try{
  // NEVER include raw CSV, cell contents, account identity, tokens or URLs.
  const prompt=JSON.stringify({kind:"csv-descriptive-statistics",rows:meta.rows,
   columns:meta.columns,serverRequested:meta.serverRequested});
  const answer=await generateOllamaReply([{role:"user",content:prompt}],model,{
   task:"analysis",purpose:"october-plan"
  });
  return validateOctoberModelPlan(answer);
 }catch{
  return {status:"blocked",capability:null,modelInvoked:false,reason:"OCTOBER_MODEL_UNAVAILABLE"};
 }
}
