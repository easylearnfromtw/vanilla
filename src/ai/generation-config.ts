/** Turns a model profile + task into concrete request parameters for each provider. */
import type {TaskKind} from "./task-kind";
import {profileFor,type ModelProfile} from "./model-profiles";

export type Sampling={temperature:number|null;topP:number|null;maxTokens:number;frequencyPenalty:number;presencePenalty:number};
export function samplingFor(profile:ModelProfile,task:TaskKind):Sampling{
 return {temperature:profile.temperature[task],topP:profile.topP,maxTokens:profile.maxOutput[task]||profile.maxOutput.general,
  frequencyPenalty:profile.frequencyPenalty,presencePenalty:profile.presencePenalty};
}

/* ---------- WebLLM ---------- */
export function webllmRequestOptions(model:string,task:TaskKind):Record<string,unknown>{
 const profile=profileFor("local",model),s=samplingFor(profile,task);
 const options:Record<string,unknown>={temperature:s.temperature??0.6,top_p:s.topP??0.9,max_tokens:s.maxTokens,
  frequency_penalty:s.frequencyPenalty,presence_penalty:s.presencePenalty};
 // Thinking burns most of a 4K window on a phone; answer directly.
 if(profile.thinking==="qwen3-switch")options.extra_body={enable_thinking:false};
 return options;
}

/* ---------- Ollama ---------- */
export function ollamaRequestExtras(model:string,task:TaskKind):{options:Record<string,number>;think?:boolean;keep_alive:string}{
 const profile=profileFor("ollama",model),s=samplingFor(profile,task);
 const options:Record<string,number>={temperature:s.temperature??0.6,top_p:s.topP??0.9,num_predict:s.maxTokens,
  // Ollama silently truncates prompts beyond num_ctx (its default is small); web/file context needs room.
  num_ctx:profile.contextTokens,repeat_penalty:1.05};
 const extras:{options:Record<string,number>;think?:boolean;keep_alive:string}={options,keep_alive:"30m"};
 if(profile.thinking==="ollama-think")extras.think=(task==="analysis"||task==="code")&&profile.paramsB>=7;
 return extras;
}

/* ---------- Gemini ---------- */
type GeminiLevel="minimal"|"low"|"medium"|"high";
export function geminiThinkingLevel(model:string,task:TaskKind):GeminiLevel|null{
 const m=model.toLowerCase();
 if(/flash-lite/.test(m)&&/gemini-2\.5/.test(m))return null; // thinking off by default; leave it.
 const minimalOk=/3\.6|3\.5-flash-lite|3-flash|3\.1-flash-lite/.test(m);
 const table:Record<TaskKind,GeminiLevel>={casual:"minimal",general:"low",writing:"low",analysis:"medium",code:"high",vision:"low"};
 let level=table[task];
 if(level==="minimal"&&!minimalOk)level="low";
 if(/flash-lite/.test(m)&&level==="high")level="medium";
 return level;
}
export function geminiGenerationConfig(model:string,task:TaskKind,withThinking=true):Record<string,unknown>{
 const profile=profileFor("gemini",model),s=samplingFor(profile,task);
 const config:Record<string,unknown>={maxOutputTokens:s.maxTokens};
 if(s.temperature!==null)config.temperature=s.temperature;
 const level=withThinking?geminiThinkingLevel(model,task):null;
 if(level)config.thinkingLevel=level;
 return config;
}

/* ---------- DeepSeek ---------- */
export function deepseekRequestExtras(model:string,task:TaskKind,withThinking=true):Record<string,unknown>{
 const profile=profileFor("deepseek",model),s=samplingFor(profile,task);
 const extras:Record<string,unknown>={max_tokens:s.maxTokens};
 if(profile.thinking==="deepseek-switch"&&withThinking){
  const deep=task==="analysis"||task==="code";
  extras.thinking={type:deep?"enabled":"disabled"};
  if(deep)extras.reasoning_effort=task==="code"?"high":"medium";
  else if(s.temperature!==null)extras.temperature=s.temperature;
 }else if(profile.thinking!=="always"&&s.temperature!==null)extras.temperature=s.temperature;
 return extras;
}
