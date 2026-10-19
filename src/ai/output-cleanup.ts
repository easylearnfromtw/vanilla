/** Post-processing that makes small and "thinking" models usable in a family chat. */

/** Remove reasoning blocks. While a <think> block is still open (streaming), return what
 * precedes it so the UI never flashes raw chain-of-thought. */
export function stripThinking(text:string):{text:string;thinking:boolean}{
 let out=text.replace(/<think>[\s\S]*?<\/think>\s*/gi,"");
 const open=out.search(/<think>/i);
 if(open>=0)return {text:out.slice(0,open).trimEnd(),thinking:true};
 // Some templates omit the opening tag and only emit "...</think>".
 const close=out.search(/<\/think>/i);
 if(close>=0)out=out.slice(close+8);
 return {text:out.replace(/^\s+/,""),thinking:false};
}

const NOTE="\n\n（偵測到模型重複輸出，已自動截斷。可以換個問法，或改用較大的模型。）";
/** Small quantised models sometimes loop. Cut at the third consecutive repeat of a sentence,
 * the fourth overall repeat of a long sentence, or a long single-character run. */
export function collapseRepetition(text:string):{text:string;collapsed:boolean}{
 if(text.length<60)return {text,collapsed:false};
 const run=/(.)\1{29,}/su.exec(text);
 if(run)return {text:text.slice(0,run.index+6).trimEnd()+NOTE,collapsed:true};
 const pieces=text.split(/(?<=[。！？!?\n])/u);
 const seen=new Map<string,number>();
 let output="",previous="",streak=0;
 for(const piece of pieces){
  const key=piece.replace(/\s+/g,"").replace(/^[-*\d.、]+/,"");
  if(key.length>=6){
   streak=key===previous?streak+1:1;
   const count=(seen.get(key)||0)+1;seen.set(key,count);
   if(streak>=3||(key.length>=18&&count>=4))return {text:output.trimEnd()+NOTE,collapsed:true};
   previous=key;
  }
  output+=piece;
 }
 return {text,collapsed:false};
}

export function cleanModelOutput(raw:string):string{
 const thought=stripThinking(raw);
 return collapseRepetition(thought.text).text.trim();
}
