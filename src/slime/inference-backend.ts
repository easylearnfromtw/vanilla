/** Slime inference capability gate. Pure, side-effect-free; no network or node enrollment. */
export type EngineKind = "webllm" | "ollama" | "tensorrt_llm" | "cloud";
export type PrivacyMode = "device_only" | "trusted_nodes" | "cloud_allowed";
export interface InferenceNode {
  id: string;
  engine: EngineKind;
  modelIds: string[];
  trusted: boolean;
  authorized: boolean;
  healthy: boolean;
  deviceLocal: boolean;
  gpuVendor?: string;
  computeCapability?: number;
  driverCompatible?: boolean;
  runtimeCompatible?: boolean;
  modelCompatible?: boolean;
  freeVramMiB?: number;
  requiredVramMiB?: number;
  latencyMs?: number;
  queueDepth?: number;
}
export interface InferenceRequest {
  modelId: string;
  privacy: PrivacyMode;
  preferredEngine?: EngineKind;
}
export function eligibleNode(node: InferenceNode, request: InferenceRequest): boolean {
  if (!node.authorized || !node.trusted || !node.healthy) return false;
  if (!node.modelIds.includes(request.modelId)) return false;
  if (request.privacy === "device_only" && (!node.deviceLocal || node.engine !== "webllm")) return false;
  if (request.privacy === "trusted_nodes" && node.engine === "cloud") return false;
  if (node.engine === "tensorrt_llm") {
    if (node.gpuVendor?.toLowerCase() !== "nvidia") return false;
    if (node.driverCompatible !== true || node.runtimeCompatible !== true || node.modelCompatible !== true) return false;
    if (node.freeVramMiB === undefined || node.requiredVramMiB === undefined) return false;
    if (!Number.isFinite(node.freeVramMiB) || !Number.isFinite(node.requiredVramMiB)) return false;
    if (node.requiredVramMiB <= 0 || node.freeVramMiB < node.requiredVramMiB) return false;
  }
  return true;
}
export function rankInferenceNodes(nodes: readonly InferenceNode[], request: InferenceRequest): InferenceNode[] {
  return nodes.filter(node => eligibleNode(node, request)).sort((a, b) => {
    const preferred = (node: InferenceNode) => Number(node.engine === request.preferredEngine);
    if (preferred(a) !== preferred(b)) return preferred(b) - preferred(a);
    const score = (node: InferenceNode) =>
      (Number.isFinite(node.latencyMs) && (node.latencyMs ?? 0) >= 0 ? node.latencyMs! : 1e9) +
      (Number.isFinite(node.queueDepth) && (node.queueDepth ?? 0) >= 0 ? node.queueDepth! * 100 : 1e6);
    return score(a) - score(b) || a.id.localeCompare(b.id);
  });
}
