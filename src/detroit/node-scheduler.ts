/** Read-only Detroit node planner. Planning NEVER means an executor has run.
 * Nodes are sourced from authenticated, recent backend heartbeats—not LLM text.
 * No network calls, process execution, authorization grants or power changes here.
 */
export type DetroitNodeRole = "inference" | "tool" | "coordinator";
export type DetroitNodePlatform = "windows" | "macos" | "linux" | "raspberry-pi";
export type DetroitNodeSnapshot = {
  id: string;
  platform: DetroitNodePlatform;
  roles: DetroitNodeRole[];
  capabilities: string[];
  /** Exact model IDs verified from a real inference backend. */
  models: string[];
  trusted: boolean;
  health: "healthy" | "degraded" | "offline";
  network: "tailnet" | "lan" | "local";
  lastHeartbeatMs: number;
  availableRamGB: number | null;
  availableVramGB: number | null;
  activeJobs: number;
  maxConcurrentJobs: number;
  queueDepth: number;
  latencyMs: number;
  power: "ac" | "battery" | "unknown";
};
export type DetroitNodeRequest = {
  role: DetroitNodeRole;
  capability?: string;
  model?: string;
  minAvailableRamGB?: number;
  minAvailableVramGB?: number;
  requiresApproval?: boolean;
  approved?: boolean;
  /** Vanilla private mode remains device-only WebLLM. */
  privateMode: boolean;
  allowBattery?: boolean;
};
export type DetroitNodePlan =
  | {state: "planned"; nodeId: string; alternatives: string[]; reason: string}
  | {state: "unavailable"; reason: string};

const HEARTBEAT_MAX_AGE_MS = 45_000;
const HEARTBEAT_CLOCK_SKEW_MS = 5_000;
const finiteNonnegative = (v: number): boolean => Number.isFinite(v) && v >= 0;

/** Deterministic candidate selection; real dispatch belongs to authenticated Zeus/worker. */
export function planDetroitNode(
  request: DetroitNodeRequest,
  snapshots: readonly DetroitNodeSnapshot[],
  nowMs: number = Date.now()
): DetroitNodePlan {
  if (request.privateMode) return {state: "unavailable", reason: "私密模式只能使用當前裝置的 WebLLM，不可轉送遠端節點"};
  if (request.requiresApproval && !request.approved)
    return {state: "unavailable", reason: "遠端工作需要本次明確授權"};
  if (!Number.isFinite(nowMs) ||
      (request.minAvailableRamGB !== undefined && !finiteNonnegative(request.minAvailableRamGB)) ||
      (request.minAvailableVramGB !== undefined && !finiteNonnegative(request.minAvailableVramGB)))
    return {state: "unavailable", reason: "節點排程輸入無效";

  const eligible = snapshots.filter(node => {
    if (!node.trusted || node.health !== "healthy" || !node.id.trim() || node.network === "lan") return false;
    if (!finiteNonnegative(node.lastHeartbeatMs) || nowMs - node.lastHeartbeatMs > HEARTBEAT_MAX_AGE_MS ||
        node.lastHeartbeatMs - nowMs > HEARTBEAT_CLOCK_SKEW_MS) return false;
    if (!node.roles.includes(request.role)) return false;
    if (request.capability && !node.capabilities.includes(request.capability)) return false;
    if (request.model && !node.models.includes(request.model)) return false;
    if (!request.allowBattery && node.power === "battery") return false;
    if (![node.activeJobs, node.maxConcurrentJobs, node.queueDepth, node.latencyMs].every(finiteNonnegative)) return false;
    if (node.maxConcurrentJobs < 1 || node.activeJobs >= node.maxConcurrentJobs) return false;
    if (request.minAvailableRamGB !== undefined &&
        (node.availableRamGB === null || !finiteNonnegative(node.availableRamGB) || node.availableRamGB < request.minAvailableRamGB)) return false;
    if (request.minAvailableVramGB !== undefined &&
        (node.availableVramGB === null || !finiteNonnegative(node.availableVramGB) || node.availableVramGB < request.minAvailableVramGB)) return false;
    return true;
  });
  // Lower active load and queue depth first; AC mains and better latency break ties.
  eligible.sort((a,b) => {
    const al=a.activeJobs/a.maxConcurrentJobs, bl=b.activeJobs/b.maxConcurrentJobs;
    return al-bl || a.queueDepth-b.queueDepth || Number(a.power!=="ac")-Number(b.power!=="ac") ||
      a.latencyMs-b.latencyMs || a.id.localeCompare(b.id);
  });
  if (!eligible.length) return {state:"unavailable", reason:"沒有已驗證、在線且符合模型、資源與授權條件的 Detroit 節點；不得宣稱任務完成"};
  return {state:"planned", nodeId:eligible[0].id, alternatives:eligible.slice(1).map(n=>n.id), reason:"依真實心跳、負載、模型與可用資源選出候選節點；仍待受信任執行器確認"};
}
