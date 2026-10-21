import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ATUBER_SINGLE_DRIVER,ATUBER_LOCAL_MODEL,isAtuberDriver,
 selectAtuberDriver,atuberFallback,atuberTier,ATUBER_TIERS} from "../src/ai/atuber-control-plane.ts";
import {vanillaSystemPrompt} from "../src/ai/prompts.ts";
const models=[
 {id:"local:"+ATUBER_LOCAL_MODEL,source:"local",model:ATUBER_LOCAL_MODEL,label:"阿土伯本機",location:"本機",note:""},
 {id:"local:Qwen2.5-0.5B-Instruct-q4f16_1-MLC",source:"local",model:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",label:"Other Local",location:"本機",note:""},
 {id:"ollama:october:0.3",source:"ollama",model:"october:0.3",label:"阿土伯自架",location:"自架主機",note:""},
 {id:"ollama:qwen3:4b",source:"ollama",model:"qwen3:4b",label:"Generic Ollama",location:"自架主機",note:""},
 {id:"gemini:gemini-3.8-flash",source:"gemini",model:"gemini-3.8-flash",label:"Gemini",location:"Google 雲端",note:""},
 {id:"deepseek:deepseek-chat",source:"deepseek",model:"deepseek-chat",label:"DeepSeek",location:"DeepSeek 雲端",note:""}
];
test("Only October / 阿土伯 runtimes may drive conversations",()=>{
 assert.equal(ATUBER_SINGLE_DRIVER,true);
 assert.deepEqual(models.filter(isAtuberDriver).map(x=>x.id),[models[0].id,models[2].id]);
 for(const x of models.slice(3))assert.equal(isAtuberDriver(x),false,x.id);
});
test("168 synthetic controller configurations never promote another model",()=>{
 let cases=0;
 const tasks=["casual","general","writing","analysis","code","vision"];
 for(const task of tasks)for(const privateMode of [false,true])for(const localOnly of [false,true])
 for(const restrictTinyModel of [false,true])for(const inclusion of [0,1,2,3,4,5,6]){
  // 6 × 2 × 2 × 2 × 7 = 336 (fixed synthetic adversarial permutations).
  const available=models.filter((_,i)=>inclusion===0?i!==0:inclusion===1?i!==2:inclusion===2?i!==0&&i!==2:
   inclusion===3?i<4:inclusion===4?i===0:inclusion===5?i===2:true);
  const d=selectAtuberDriver(available,{task,privateMode,localOnly,image:false,restrictTinyModel});
  assert.equal(d.policy,"atuber-single-driver-v1");
  if(d.controller){
   assert.ok(isAtuberDriver(d.controller));
   if(privateMode||localOnly)assert.equal(d.controller.source,"local");
   if(restrictTinyModel)assert.notEqual(d.controller.source,"local");
  }
  assert.ok(d.specialists.every(x=>!isAtuberDriver(x)));
  cases++;
 }
 assert.equal(cases,336);
});
test("Untrusted or non-self-hosted October names cannot impersonate the controller",()=>{
 const unofficial={...models[2],location:"Ollama Cloud"};
 const spoofed={...models[2],model:"deepseek:october"};
 assert.equal(isAtuberDriver(unofficial),false);
 assert.equal(isAtuberDriver(spoofed),false);
 assert.equal(selectAtuberDriver([unofficial,models[4]],{task:"general",privateMode:false,localOnly:false,image:false}).controller,null);
});
test("No Atuber available fails closed, including if generic providers are plentiful",()=>{
 const d=selectAtuberDriver(models.filter(x=>!isAtuberDriver(x)),{task:"general",privateMode:false,localOnly:false,image:false});
 assert.equal(d.controller,null);assert.equal(d.reason,"no-atuber-runtime");
});
test("Private chat refuses Ollama and cloud; no silent cross-location fallback",()=>{
 const d=selectAtuberDriver([models[2],models[4]],{task:"analysis",privateMode:true,localOnly:true,image:false});
 assert.equal(d.controller,null);
 assert.equal(atuberFallback(models,models[0],{privateMode:false,localOnly:false}),null);
 assert.equal(atuberFallback(models,models[2],{privateMode:false,localOnly:false}),null);
});
test("Atuber-only mode rejects unsupported vision in generic chat",()=>{
 const d=selectAtuberDriver(models,{task:"vision",privateMode:false,localOnly:false,image:true});
 assert.equal(d.controller,null);assert.equal(d.reason,"vision-needs-approved-adapter");
});
test("Only 阿土伯 receives single-driver identity prompt",()=>{
 const atuber=vanillaSystemPrompt({task:"general",compact:true,latestUserText:"你好",tongcheng:true});
 const other=vanillaSystemPrompt({task:"general",compact:true,latestUserText:"你好",tongcheng:false});
 assert.match(atuber,/你是阿土伯/);assert.match(atuber,/言有物/);
 assert.match(other,/你是 Vanilla/);assert.doesNotMatch(other,/唯一對話主控/);
});
test("Main chat and selector do not bypass single-driver policy",()=>{
 const chat=readFileSync(new URL("../src/local-ai/LocalChat.tsx",import.meta.url),"utf8");
 const picker=readFileSync(new URL("../src/local-ai/LocalModelPanel.tsx",import.meta.url),"utf8");
 assert.match(chat,/selectAtuberDriver\(candidates/);
 assert.match(chat,/atuberFallback\(ranked,primary/);
 assert.match(chat,/!ATUBER_SINGLE_DRIVER&&!nativeArtifact/);
 assert.match(chat,/!ATUBER_SINGLE_DRIVER&&automatic/);
 assert.match(picker,/visibleModels=ATUBER_SINGLE_DRIVER/);
});

test("Three owner-hosted tiers identify exact deployable aliases, never vendor cloud",()=>{
 assert.deepEqual(ATUBER_TIERS.map(x=>x.model),["october:sm","october:ml","october:lg"]);
 for(const t of ATUBER_TIERS){
  const candidate={...models[2],id:"ollama:"+t.model,model:t.model};
  assert.equal(isAtuberDriver(candidate),true);
  assert.equal(atuberTier(candidate),t.tier);
  assert.equal(atuberTier({...candidate,location:"Ollama Cloud"}),null);
 }
 assert.equal(atuberTier(models[0]),"phone");
 assert.equal(atuberTier(models[2]),"custom");
});
test("Automatically choose mid-small for writing, mid-large for research, large for code",()=>{
 const tierModels=ATUBER_TIERS.map(t=>({...models[2],id:"ollama:"+t.model,model:t.model}));
 const eligible=[models[0],...tierModels,models[4],models[5]];
 const pick=(task,restrictTinyModel=false)=>selectAtuberDriver(eligible,{task,privateMode:false,localOnly:false,image:false,restrictTinyModel});
 assert.equal(pick("casual").controller?.model,ATUBER_LOCAL_MODEL);
 assert.equal(pick("writing").controller?.model,"october:sm");
 assert.equal(pick("analysis").controller?.model,"october:ml");
 assert.equal(pick("code").controller?.model,"october:lg");
 assert.equal(pick("general",true).controller?.model,"october:ml");
});
test("A missing tier degrades to an available approved October model only",()=>{
 const small={...models[2],model:"october:sm",id:"ollama:october:sm"};
 const medium={...models[2],model:"october:ml",id:"ollama:october:ml"};
 const decision=selectAtuberDriver([small,medium,models[4],models[5]],
  {task:"code",privateMode:false,localOnly:false,image:false});
 assert.equal(decision.controller?.model,"october:ml");
 assert.equal(decision.specialists.length,2);
 assert.equal(selectAtuberDriver([models[0],small],{task:"analysis",privateMode:true,localOnly:true,image:false}).controller?.source,"local");
 assert.equal(selectAtuberDriver([models[0],small],{task:"analysis",privateMode:true,localOnly:true,image:false,restrictTinyModel:true}).controller,null);
});
