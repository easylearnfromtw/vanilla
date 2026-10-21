/** Fit a conversation + attached context into a model's real context window.
 * Old behaviour silently cut every turn to 2,200 characters while telling the model it had
 * the "full" attachment. Here every cut is explicit, the question itself is never cut, and
 * the caller learns what was trimmed so the UI can say so.
 */
export type BudgetTurn={role:"user"|"assistant";content:string};
export type PromptContext={id:string;label:string;text:string;
 /** Lower = more important. Attachments/web evidence 1, memory 2, project code 3, CREAM 3, style hints 4. */
 priority:number};
export type ComposeResult={content:string;included:{id:string;label:string;chars:number;truncated:boolean}[];omitted:string[]};

const CJK=/[⺀-鿿豈-﫿＀-￯　-〿]/g;
/** Conservative estimate across Qwen/Llama/Gemma tokenizers: a CJK char ≈ 1 token, other text ≈ 3.6 chars/token. */
export function estimateTokens(text:string):number{
 if(!text)return 0;
 const cjk=(text.match(CJK)||[]).length;
 return Math.ceil(cjk+(text.length-cjk)/3.6);
}
/** Cut text to roughly `tokens` tokens, preferring a paragraph/sentence boundary. */
export function truncateToTokens(text:string,tokens:number):string{
 if(tokens<=0)return "";
 if(estimateTokens(text)<=tokens)return text;
 let lo=0,hi=text.length;
 while(lo<hi){const mid=(lo+hi+1)>>1;if(estimateTokens(text.slice(0,mid))<=tokens)lo=mid;else hi=mid-1;}
 let cut=text.slice(0,lo);
 const boundary=Math.max(cut.lastIndexOf("\n"),cut.lastIndexOf("。"),cut.lastIndexOf(". "));
 if(boundary>cut.length*0.7)cut=cut.slice(0,boundary+1);
 return cut;
}
const TRUNC_NOTE=(label:string,shown:number,total:number)=>
 "\n…（"+label+"共 "+total.toLocaleString("en-US")+" 字，受模型長度限制只提供前 "+shown.toLocaleString("en-US")+" 字。回答時請說明只根據這部分內容。）";

/** Compose the final user message: question first (never cut), then contexts by priority. */
export function composeUserPrompt(question:string,contexts:PromptContext[],guidance:string,budgetTokens:number):ComposeResult{
 const head=question.trim();
 let remaining=budgetTokens-estimateTokens(head)-estimateTokens(guidance)-24;
 const included:ComposeResult["included"]=[],omitted:string[]=[];
 const parts:string[]=[];
 // Blackhole: skip the exact same source ID and original text only after it was included.
 // Different sources remain distinct, even if their text happens to match.
 const includedExact=new Map<string,Set<string>>();
 const remembered=(id:string,text:string)=>{
  let texts=includedExact.get(id);
  if(!texts){texts=new Set<string>();includedExact.set(id,texts);}
  texts.add(text);
 };
 for(const ctx of [...contexts].filter(x=>x.text.trim()).sort((a,b)=>a.priority-b.priority)){
  if(ctx.id&&includedExact.get(ctx.id)?.has(ctx.text)){
   omitted.push(ctx.label+"（同一來源重複，已省略）");
   continue;
  }
  const cost=estimateTokens(ctx.text);
  if(cost<=remaining){parts.push(ctx.text);included.push({id:ctx.id,label:ctx.label,chars:ctx.text.length,truncated:false});remembered(ctx.id,ctx.text);remaining-=cost;continue;}
  // Only worth including a slice if it can carry real content.
  if(remaining>160&&ctx.priority<=2){
   const slice=truncateToTokens(ctx.text,remaining-60);
   if(slice.length>80){
    parts.push(slice+TRUNC_NOTE(ctx.label,slice.length,ctx.text.length));
    included.push({id:ctx.id,label:ctx.label,chars:slice.length,truncated:true});
    remembered(ctx.id,ctx.text);
    remaining=0;continue;
   }
  }
  omitted.push(ctx.label);
 }
 const content=[head,...parts].join("\n\n")+(guidance?guidance:"");
 return {content,included,omitted};
}

/** Keep the newest turns that fit; older long turns are summarised by truncation. The latest
 * user turn is always kept (callers compose it within budget first). */
export function fitHistory<T extends BudgetTurn>(turns:readonly T[],budgetTokens:number,perTurnTokens=700):T[]{
 if(!turns.length)return [];
 const last=turns[turns.length-1];
 let remaining=budgetTokens-estimateTokens(last.content);
 const kept:T[]=[last];
 for(let i=turns.length-2;i>=0&&remaining>40;i--){
  const turn=turns[i];
  let content=turn.content;
  if(estimateTokens(content)>perTurnTokens)content=truncateToTokens(content,perTurnTokens)+"…";
  const cost=estimateTokens(content)+4;
  if(cost>remaining)break;
  kept.unshift({...turn,content});
  remaining-=cost;
 }
 // A transcript must start with a user turn for chat templates.
 while(kept.length>1&&kept[0].role!=="user")kept.shift();
 return kept;
}
