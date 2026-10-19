import {signedChatAccount} from "../vault/chat-sync";
import {TEACHER_DEFAULT,sanitizeTeacherState,addTeacherExample,createTeacherExample,exportTeacherJSONL,
 type TeacherExample,type TeacherState,type TeacherTask,type TeacherOrigin} from "./teacher-core.ts";
function key(){
 const email=signedChatAccount().trim().toLowerCase();
 if(!email)return {name:"vanilla.noodles.teachers.guest.session.v1",guest:true};
 let hash=2166136261;for(let i=0;i<email.length;i++)hash=Math.imul(hash^email.charCodeAt(i),16777619);
 return {name:"vanilla.noodles.teachers.account."+(hash>>>0).toString(16)+".v1",guest:false};
}
function scope(){
 const k=key();return {key:k,storage:k.guest?sessionStorage:localStorage};
}
export function readTeacherState():TeacherState{
 try{const {key,storage}=scope();return sanitizeTeacherState(JSON.parse(storage.getItem(key.name)||"null"));}
 catch{return {...TEACHER_DEFAULT,settings:{...TEACHER_DEFAULT.settings},examples:[]};}
}
export function updateTeacherState(state:TeacherState):TeacherState{
 const clean=sanitizeTeacherState(state);
 const {key,storage}=scope();
 storage.setItem(key.name,JSON.stringify(clean));
 window.dispatchEvent(new Event("vanilla-teacher-updated"));
 return clean;
}
export function setTeacherSettings(patch:Partial<TeacherState["settings"]>):TeacherState{
 const old=readTeacherState();
 const settings={...old.settings,...patch};
 // If training rights have been withdrawn, stop hinting as well.
 if(!settings.rightsConfirmed){settings.enabled=false;settings.allowCrossModelHints=false;}
 if(!settings.enabled)settings.allowCrossModelHints=false;
 return updateTeacherState({...old,settings});
}
export function recordTeacherSample(args:{
 task:TeacherTask;prompt:string;chosen:string;rejected?:string;provider:TeacherOrigin;model:string;
 selectedBy:"comparison"|"thumbs-up";
},privateMode=false):{saved:boolean;reason:string}{
 if(privateMode)return {saved:false,reason:"私密模式不擷取模型回答"};
 // Personal-by-default only for the bundled, user-operated local model.
 // Remote Gemini/DeepSeek/Ollama output licenses may forbid distillation.
 if(args.provider!=="local")return {saved:false,reason:"第三方模型只用於 NOODLES 匿名品質訊號，不自動保存輸出進訓練資料"};
 try{
  const current=readTeacherState();
  if(!current.settings.enabled||!current.settings.rightsConfirmed)return {saved:false,reason:"尚未啟用或確認訓練資料使用權"};
  const item=createTeacherExample({...args,rightsConfirmed:true});
  if(current.examples.some(e=>e.id===item.id))return {saved:false,reason:"重複的學習案例已略過"};
  const updated=addTeacherExample(current,item);
  updateTeacherState(updated);
  return {saved:true,reason:"已收錄一筆經使用者選擇的案例（尚未更新模型權重）"};
 }catch(error){return {saved:false,reason:error instanceof Error?error.message:String(error)};}
}
export function removeTeacherExample(id:string):TeacherState{
 const previous=readTeacherState();
 return updateTeacherState({...previous,examples:previous.examples.filter(x=>x.id!==id)});
}
export function clearTeacherExamples():void{
 const previous=readTeacherState();
 updateTeacherState({...previous,examples:[]});
}
export function teacherExport(mode:"sft"|"dpo",split:"train"|"eval"):string{
 return exportTeacherJSONL(readTeacherState(),mode,split);
}
export function teacherScope():string{return key().guest?"未登入：僅此分頁（session）":"目前登入帳戶：本瀏覽器（未加密 localStorage）";}
