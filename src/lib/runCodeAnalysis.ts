import { analyzeSourceFiles, type SourceFile, type CodeAnalysisResult } from "./algorithmCodeAnalyzer";
import { compareSnapshots, type AnalysisHistoryStore, type FindingTrend } from "./codeAnalysisHistory";
import { GoogleDriveCodeAnalysisHistoryStore } from "./googleDriveCodeAnalysisHistory";

export type AnalysisMode = "preview" | "save";
export interface AnalyzeCodeRequest {
  repository: string;
  revision: string;
  files: SourceFile[];
  mode?: AnalysisMode;
}
export interface AnalyzeCodeReport extends CodeAnalysisResult {
  trends: FindingTrend[];
  previousRevision: string | null;
  saved: boolean;
  alreadySaved: boolean;
}
/** Stable digest of inspected source content (not the time an index was made).
 * Includes analyzer-version prefix so reanalysis after a rule upgrade can be recorded.
 */
export async function codeRevision(files: readonly SourceFile[]): Promise<string> {
  if (!files.length) throw new Error("至少需要一個可讀取的原始碼檔案");
  const sorted=[...files].sort((a,b)=>a.path.localeCompare(b.path));
  const canonical="code-intelligence-v2\n"+sorted.map(file=>
    file.path.length+":"+file.path+":"+file.content.length+":"+file.content).join("\n");
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));
  return "sha256:"+Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
/** Preview requires no Google sign-in. Cloud writes require an explicit save mode. */
export async function runCodeAnalysis(
  request: AnalyzeCodeRequest,
  history?: AnalysisHistoryStore,
): Promise<AnalyzeCodeReport> {
  const result=analyzeSourceFiles(request.repository,request.revision,request.files);
  if (request.mode!=="save") {
    return {...result,trends:[],previousRevision:null,saved:false,alreadySaved:false};
  }
  const store=history??new GoogleDriveCodeAnalysisHistoryStore();
  const existing=await store.list(request.repository);
  const previous=existing.find(x=>x.revision!==request.revision)??null;
  const trends=compareSnapshots(previous,result.snapshot);
  if (existing.some(x=>x.id===result.snapshot.id)) {
    return {...result,trends,previousRevision:previous?.revision??null,saved:false,alreadySaved:true};
  }
  await store.save(result.snapshot);
  return {...result,trends,previousRevision:previous?.revision??null,saved:true,alreadySaved:false};
}
