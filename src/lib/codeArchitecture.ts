import type { SourceFile } from "./algorithmCodeAnalyzer";
export interface DependencyEdge { from:string; to:string; kind:"import"|"require" }
const IMPORTS=/(?:^|\n)\s*(?:import|export)\s+(?:[^\n;]*?\s+from\s*)?["']([^"'\n]+)["']/g;
const REQUIRES=/\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g;
/** Read-only import references. Relative specifiers are not assumed to resolve. */
export function extractDependencyEdges(files:readonly SourceFile[],limit=200):DependencyEdge[]{
 const edges:DependencyEdge[]=[],seen=new Set<string>();
 for(const file of files){
  const add=(target:string,kind:DependencyEdge["kind"])=>{
   if(edges.length>=limit)return;
   const to=target.slice(0,220);if(!to)return;
   const key=file.path+"\0"+kind+"\0"+to;
   if(!seen.has(key)){seen.add(key);edges.push({from:file.path,to,kind});}
  };
  for(const match of file.content.matchAll(IMPORTS))add(match[1],"import");
  for(const match of file.content.matchAll(REQUIRES))add(match[1],"require");
 }
 return edges;
}
