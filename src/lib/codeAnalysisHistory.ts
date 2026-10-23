/** Standalone code-analysis history primitives. No model or UI coupling. */
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export interface CodeFinding {
  ruleId: string;
  path: string;
  line?: number;
  severity: Severity;
  title: string;
  explanation: string;
  suggestion: string;
}
export interface AnalysisSnapshot {
  id: string;
  repository: string;
  revision: string;
  createdAt: string;
  findings: CodeFinding[];
  /** Exact source paths inspected; omitted for legacy snapshots. */
  analyzedPaths?: string[];
  /** Pattern metadata, never the complete source or evidence excerpts. */
  patterns?: Array<{path:string;pattern:string;line:number}>;
}
export interface FindingTrend {
  fingerprint: string;
  status: "new" | "persistent" | "resolved";
  current?: CodeFinding;
  previous?: CodeFinding;
}
export function fingerprint(f: CodeFinding): string {
  // Line numbers are intentionally excluded: moving code should not create false regressions.
  return [f.ruleId, f.path.replace(/\\/g, "/").toLowerCase(), f.title.trim().toLowerCase()].join("::");
}
export function compareSnapshots(previous: AnalysisSnapshot | null, current: AnalysisSnapshot): FindingTrend[] {
  const old = new Map((previous?.findings ?? []).map(f => [fingerprint(f), f]));
  const now = new Map(current.findings.map(f => [fingerprint(f), f]));
  const output: FindingTrend[] = [];
  for (const [key, finding] of now) {
    output.push({ fingerprint: key, status: old.has(key) ? "persistent" : "new", current: finding, previous: old.get(key) });
  }
  for (const [key, finding] of old) {
    if (!now.has(key) && (!current.analyzedPaths || current.analyzedPaths.includes(finding.path))) output.push({ fingerprint: key, status: "resolved", previous: finding });
  }
  return output;
}
export interface AnalysisHistoryStore {
  list(repository: string): Promise<AnalysisSnapshot[]>;
  save(snapshot: AnalysisSnapshot): Promise<void>;
}
export class InMemoryAnalysisHistoryStore implements AnalysisHistoryStore {
  private snapshots = new Map<string, AnalysisSnapshot[]>();
  async list(repository: string): Promise<AnalysisSnapshot[]> {
    return [...(this.snapshots.get(repository) ?? [])];
  }
  async save(snapshot: AnalysisSnapshot): Promise<void> {
    const existing = this.snapshots.get(snapshot.repository) ?? [];
    this.snapshots.set(snapshot.repository, [...existing.filter(x => x.id !== snapshot.id), snapshot]);
  }
}
