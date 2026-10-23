import type { AnalysisSnapshot, CodeFinding } from "./codeAnalysisHistory";

export interface SourceFile { path: string; content: string }
export interface AlgorithmInsight {
  path: string;
  pattern: string;
  confidence: "heuristic";
  evidence: { line: number; text: string }[];
  explanation: string;
  complexity: string;
  questions: string[];
}
export interface CodeAnalysisResult { snapshot: AnalysisSnapshot; insights: AlgorithmInsight[]; warnings: string[] }
type PatternRule = { name: string; tests: RegExp[]; explanation: string; complexity: string; questions: string[] };
const RULES: PatternRule[] = [
  { name:"binary-search",tests:[/\bwhile\s*\(\s*(?:left|lo|low)\s*<=?\s*(?:right|hi|high)/i,/\b(?:mid|middle)\s*=/i],explanation:"Search interval is reduced using a midpoint. Verify interval invariants and boundary updates.",complexity:"Often O(log n) iterations if interval shrinks by a constant factor; validate loop updates.",questions:["Does each iteration shrink the interval?","What happens for empty input and duplicates?"] },
  { name:"sliding-window",tests:[/\b(?:left|start)\s*\+\+|\b(?:left|start)\s*\+=\s*1/,/\b(?:right|end)\s*\+\+|\b(?:right|end)\s*\+=\s*1/],explanation:"Two moving bounds suggest a sliding window. Check that updates preserve the window invariant.",complexity:"Potential O(n) when each pointer advances at most n times; nested work can increase cost.",questions:["What invariant does the window maintain?","Are elements processed a bounded number of times?"] },
  { name:"dynamic-programming",tests:[/\b(?:dp|memo)\s*\[/i,/\b(?:for|while)\b/],explanation:"A state table is used in an iterative computation. Verify state definition, recurrence and initialization.",complexity:"Depends on state count and transition cost; cannot be established from pattern alone.",questions:["What does dp[i] represent?","Are all dependencies computed before use?"] },
  { name:"breadth-first-search",tests:[/\b(?:queue|deque)\b/i,/\b(?:shift|dequeue|popleft)\s*\(/i],explanation:"A queue-based traversal may implement BFS. Confirm visited handling and graph edges.",complexity:"Typically O(V+E) for adjacency lists when queue operations are O(1).",questions:["When are nodes marked visited?","Are queue operations constant time?"] },
  { name:"depth-first-search",tests:[/\b(?:dfs|depthFirstSearch)\s*\(/i,/\b(?:visited|seen)\b/i],explanation:"A recursive or stack-based traversal appears to track visited nodes.",complexity:"Typically O(V+E) for graph traversal; recursion stack can be O(V).",questions:["Is there a cycle guard?","Can recursion depth overflow?"] },
];
function normalizePath(path: string): string { return path.replace(/\\/g,"/"); }
export function analyzeSourceFiles(repository: string, revision: string, files: SourceFile[], now = new Date().toISOString()): CodeAnalysisResult {
  if (!repository.trim() || !revision.trim()) throw new Error("Repository and revision are required");
  if (files.length > 200) throw new Error("File count limit exceeded");
  const insights: AlgorithmInsight[] = [], findings: CodeFinding[] = [], warnings: string[] = [];
  for (const file of files) {
    const path = normalizePath(file.path);
    if (!path || path.startsWith("/") || path.split("/").includes("..")) { warnings.push("Skipped unsafe path"); continue; }
    if (file.content.length > 250_000) { warnings.push(`Skipped oversized file: ${path}`); continue; }
    if (!/\.(?:[cm]?[jt]sx?|py|java|go|rs|cpp|cc|c|h)$/.test(path)) continue;
    const lines = file.content.split(/\r?\n/);
    for (const rule of RULES) {
      const evidence = rule.tests.map(test => {
        const index = lines.findIndex(line => test.test(line));
        return index < 0 ? null : { line:index+1, text:lines[index].trim().slice(0,180) };
      });
      if (evidence.some(x=>x===null)) continue;
      insights.push({path,pattern:rule.name,confidence:"heuristic",evidence:evidence.filter((x):x is {line:number;text:string}=>x!==null),explanation:rule.explanation,complexity:rule.complexity,questions:rule.questions});
    }
    lines.forEach((line,index)=>{
      if (/\beval\s*\(/.test(line)) findings.push({ruleId:"dangerous-eval",path,line:index+1,severity:"high",title:"Dynamic eval call",explanation:"Executing strings as code can introduce injection risks depending on input provenance.",suggestion:"Replace eval with explicit parsing or a restricted interpreter."});
    });
  }
  return {snapshot:{id:`${repository}@${revision}`,repository,revision,createdAt:now,findings},insights,warnings};
}
