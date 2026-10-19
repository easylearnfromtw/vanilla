/** Deterministic review-only code diff preview; never executes submitted source. */
export type CodeDifference={before:string;after:string;startLine:number;removed:number;added:number;unchanged:boolean};
export function summarizeCodeDiff(before:string|null,after:string,context=3):CodeDifference{
 const original=(before||"").replace(/\r\n/g,"\n").split("\n");
 const next=after.replace(/\r\n/g,"\n").split("\n");
 let prefix=0;
 while(prefix<original.length&&prefix<next.length&&original[prefix]===next[prefix])prefix++;
 let suffix=0;
 while(suffix<original.length-prefix&&suffix<next.length-prefix&&
  original[original.length-1-suffix]===next[next.length-1-suffix])suffix++;
 const removed=original.length-prefix-suffix,added=next.length-prefix-suffix;
 const start=Math.max(0,prefix-context),endOld=Math.min(original.length,original.length-suffix+context);
 const endNew=Math.min(next.length,next.length-suffix+context);
 return {startLine:start+1,removed,added,unchanged:before===after,
  before:original.slice(start,endOld).map((line,i)=>String(i+start+1).padStart(4," ")+" | "+line).join("\n"),
  after:next.slice(start,endNew).map((line,i)=>String(i+start+1).padStart(4," ")+" | "+line).join("\n")};
}
