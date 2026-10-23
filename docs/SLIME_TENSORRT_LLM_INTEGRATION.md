# Slime inference backend integration — TensorRT-LLM (proposal)

Status: **design only**. No inference engine is installed, no node is enrolled, and no benchmark has been performed by this change.

## Goals
- Preserve existing WebLLM, Ollama, and cloud provider routes.
- Add a capability-gated TensorRT-LLM adapter for supported NVIDIA hosts, not as a universal replacement.
- Keep October aliases `october:sm`, `october:ml`, `october:lg` independent of engine implementation.
- Keep private mode strictly on-device; never route its prompts to Slime, Ollama, or cloud APIs.

## Capability advertisement (future node protocol)
A Slime node should report: node ID, owner authorization state, operating system, CPU architecture, GPU vendor/model, compute capability, total/free VRAM, driver/CUDA versions, available engines and versions, available model IDs/quantizations, max context, measured warm/cold latency, tokens/sec, queue depth, and heartbeat timestamp. Treat all claims as untrusted until authenticated and validated by the coordinator. Do not log prompts or tokens.

## Routing rules
1. Enforce privacy, owner authorization, node trust, model availability, and policy before scoring performance.
2. Reject TensorRT-LLM when GPU, driver, CUDA, engine build, model architecture, or quantization are unsupported. Do not infer compatibility merely from NVIDIA branding.
3. For small heterogeneous hosts prefer existing Ollama/llama.cpp-compatible serving; WebLLM remains device-local.
4. Route only to nodes that can fit weights **and** runtime KV cache/context and have adequate free memory.
5. Rank compatible candidates by measured end-to-end latency, queue wait, tokens/sec, reliability, and energy/cost; never advertise estimated performance as measured.
6. Fail over only for retry-safe requests. Streaming retries must avoid duplicated user-visible output. Apply a circuit breaker with exponential backoff and bounded retries.
7. No automatic cross-household tensor parallelism. Distributed model sharding requires an explicitly supported engine, compatible hardware, bandwidth tests, and separate authorization.

## Suggested adapter contract
```ts
type EngineKind = 'webllm' | 'ollama' | 'tensorrt_llm' | 'cloud';
type InferenceCapability = {
  engine: EngineKind;
  modelId: string;
  maxContextTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  quantization?: string;
};
type RoutingConstraints = {
  privacy: 'device_only' | 'trusted_nodes' | 'cloud_allowed';
  maxLatencyMs?: number;
  maxCost?: number;
};
```
The actual adapter must normalize streaming, cancellation, timeout, tool-call semantics, health checks and usage accounting to the existing Vanilla interfaces, rather than adding a second chat API.

## Rollout and validation
- Phase 0: inspect current Slime implementation, existing provider adapters and API contracts; add tests before integration.
- Phase 1: add read-only capability reporting and health probes. Keep TensorRT-LLM disabled by default.
- Phase 2: implement adapter against an authenticated HTTPS inference endpoint, not a publicly exposed raw model port.
- Phase 3: test supported NVIDIA host with a real compatible model; compare to the existing Ollama baseline at the same context and quantization, recording TTFT, p50/p95 latency, output tokens/sec, peak VRAM, errors and power.
- Phase 4: enable opt-in routing only when it passes correctness, stability and measured-benefit gates. Provide one-switch rollback.
- CI: mock-only tests for unsupported GPU, offline node, authorization denial, private mode, model mismatch, OOM, interrupted stream and circuit breaker. GPU benchmarks require real owner hardware and cannot be claimed by CI.

## Safety
No credentials in source control; encrypted node credentials and short-lived tokens; mTLS or authenticated private overlay; scoped per-node authorization and revocation; rate limits; no unsolicited remote wake or execution; audit events without prompt content.

Official upstream: https://github.com/NVIDIA/TensorRT-LLM
