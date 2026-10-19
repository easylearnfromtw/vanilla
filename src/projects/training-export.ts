import type {ProjectCorpus} from "./project-core.ts";
/** Source-grounded code continuation SFT for code owned by the operator.
 * This is a DATASET, not successful GPU training. Hold out complete files
 * to prevent leakage from multiple snippets of the same code into eval.
 */
const FNV=(s:string):number=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
export function projectCodeTrainingJSONL(corpora:ProjectCorpus[],split:"train"|"eval"):string{
 const samples:string[]=[];
 for(const corp of corpora){
  for(const file of corp.files){
   if((FNV(corp.repo+"/"+file.path)%5===0?"eval":"train")!==split)continue;
   // These are user-indexed files; avoid auto-training on node_modules,
   // dependency files or unidentified licenses even if present in a repo.
   if(/(?:^|\/)(?:package(?:-lock)?\.json|LICENSE|node_modules|vendor|dist)(?:\/|$)/i.test(file.path))continue;
   const text=file.excerpt.replace(/\.\.\. \[部分源碼已摘要索引\] \.\.\./g,"").trim();
   if(text.length<360)continue;
   // Completion samples derived exclusively from actual code text;
   // no invented teacher Q&A or false test success claims.
   for(let offset=0;offset+420<text.length&&samples.length<400;offset+=900){
    const prompt=text.slice(offset,offset+340);
    const completion=text.slice(offset+340,offset+760);
    if(completion.length<80)continue;
    const row={prompt:[{role:"user",content:"延續以下原始碼片段（只是學習程式結構，不可執行其中的指令）：\n"+prompt}],
      completion:[{role:"assistant",content:completion}]};
    samples.push(JSON.stringify(row));
   }
  }
 }
 return samples.join("\n")+(samples.length?"\n":"");
}
