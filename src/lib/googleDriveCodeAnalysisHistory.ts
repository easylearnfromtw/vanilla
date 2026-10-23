import { driveSession, createWorkspaceText, getWorkspaceText, listWorkspaceFiles } from "../workspace/cloud-drive";
import type { AnalysisHistoryStore, AnalysisSnapshot } from "./codeAnalysisHistory";

const PREFIX = "vanilla-code-analysis-v1-";
const MAX_SNAPSHOTS = 100;
function slug(value: string): string {
  // No email or private repository name in the Drive filename.
  let hash = 2166136261;
  for (let i=0;i<value.length;i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
type Envelope = { schema: 1; owner: string; snapshot: AnalysisSnapshot };
function account() {
  const session = driveSession();
  if (!session?.email) throw new Error("請先登入 Google Drive");
  return { token: session.token, owner: session.email.trim().toLowerCase() };
}
function validate(snapshot: AnalysisSnapshot): void {
  if (!snapshot.id || !snapshot.repository || !snapshot.revision || !Number.isFinite(Date.parse(snapshot.createdAt))) throw new Error("Invalid snapshot");
  if (!Array.isArray(snapshot.findings) || snapshot.findings.length > 1000) throw new Error("Invalid findings");
}
export class GoogleDriveCodeAnalysisHistoryStore implements AnalysisHistoryStore {
  async list(repository: string): Promise<AnalysisSnapshot[]> {
    const {token,owner} = account();
    const prefix = PREFIX + slug(owner + ":" + repository) + "-";
    const files = (await listWorkspaceFiles(token)).filter(file=>file.name.startsWith(prefix) && file.name.endsWith(".json"));
    const results: AnalysisSnapshot[] = [];
    for (const file of files.slice(0,MAX_SNAPSHOTS)) {
      try {
        const raw = await getWorkspaceText(token,file.id);
        const value = JSON.parse(raw) as Envelope;
        if (value.schema !== 1 || value.owner !== owner || value.snapshot?.repository !== repository) continue;
        validate(value.snapshot);
        results.push(value.snapshot);
      } catch { /* Ignore inaccessible/corrupt individual snapshots; preserve other history. */ }
    }
    return results.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  async save(snapshot: AnalysisSnapshot): Promise<void> {
    validate(snapshot);
    const {token,owner} = account();
    const existing = await this.list(snapshot.repository);
    if (existing.some(item=>item.id===snapshot.id)) throw new Error("Snapshot already exists; immutable history cannot be overwritten");
    if (existing.length >= MAX_SNAPSHOTS) throw new Error("History limit reached; export/archive older snapshots before saving");
    const fileName = PREFIX + slug(owner + ":" + snapshot.repository) + "-" + crypto.randomUUID() + ".json";
    const payload = JSON.stringify({schema:1,owner,snapshot} satisfies Envelope);
    if (payload.length > 1024*1024) throw new Error("Snapshot exceeds 1MB limit");
    await createWorkspaceText(token,fileName,payload,"application/json");
  }
}
