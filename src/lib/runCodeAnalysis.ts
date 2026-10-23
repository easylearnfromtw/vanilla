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
}
/**
 * User-invoked analysis coordinator. No remote model inference, source execution,
 * or automatic background monitoring. Drive access is required only for save mode.
 */
export async function runCodeAnalysis(
  request: AnalyzeCodeRequest,
  history?: AnalysisHistoryStore,
): Promise<AnalyzeCodeReport> {
  const result = analyzeSourceFiles(request.repository, request.revision, request.files);
  if (request.mode !== "save") {
    return { ...result, trends: [], previousRevision: null, saved: false };
  }
  const store = history ?? new GoogleDriveCodeAnalysisHistoryStore();
  const previous = (await store.list(request.repository)).find(
    snapshot => snapshot.revision !== request.revision,
  ) ?? null;
  const trends = compareSnapshots(previous, result.snapshot);
  await store.save(result.snapshot);
  return {
    ...result,
    trends,
    previousRevision: previous?.revision ?? null,
    saved: true,
  };
}
