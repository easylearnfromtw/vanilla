# October Penteract Funnel — 5D geometric routing specification

Status: EXPERIMENTAL. This is a proposed routing architecture, not a trained 5D neural network or a measured efficiency improvement.

## Core principle

A five-dimensional mathematical coordinate is a routing *projection*, not five named business attributes. Retain original high-dimensional embeddings for retrieval and reranking. A learned projector maps a query embedding to q ∈ R^5 and candidates to c_i ∈ R^5. A deterministic baseline can use a seeded random projection, but must not be marketed as learned reasoning.

## Funnel pipeline (wide to narrow)

1. **Understanding basin (primary compute budget)**: detect intent, constraints, ambiguity, required evidence, authorization, data sensitivity, and acceptance criteria. Extract a structured task contract. When ambiguity changes the action, ask a question instead of guessing.
2. **5D geometric routing**: score candidate models, specialist adapters, memory scopes and tools by geometric distance plus policy and capability features. Select top-k, not all. Re-rank using the full-dimensional representation. Do not treat five-dimensional distance as a proof of semantic similarity.
3. **Sparse execution throat**: use one primary model and the minimum approved tools; parallelize only independent tasks. Route GPU requests to Slime only if a permitted available node meets VRAM/latency constraints.
4. **Verification outlet**: verify numeric outputs with deterministic functions, citations against retrieved sources, and tool receipts against server-side records. Failed verification returns a qualified answer or escalates; never invent successful tool execution.
5. **Response**: concise result, limitations, and action receipt. LUCA records aggregate timing/tokens and decision codes, never raw private prompts by default.

## Budget control

Reserve a *target* 40–55% of available per-request inference budget for understanding, 5–12% routing, 20–35% execution, 10–20% verification, 3–8% presentation. These are engineering hypotheses, NOT measured power fractions. Unused understanding budget is returned; do not force extra tokens. For simple deterministic questions, skip LLM deliberation. Optimize expected total cost, not the proportion of GPU utilization. Always cap clarification loops, retries and tools.

## Geometry

p ∈ R^5, candidate centers c_i ∈ R^5.
s_i = -||W(p-c_i)||² + α capability_i - β cost_i - γ risk_i.
Mask candidates lacking authorization or capability **before** ranking.
Choose top-k, then verify with original embeddings and policies.
A 5D hypercube has 32 vertices and 80 edges, and 10 independent coordinate rotation planes. Its 3D visualization is a projection; it is not the routing topology by itself.

## 3D visualization

Use Three.js to render a funnel shell with the wide understanding basin at top, narrowing to sparse tool/model activation and a verified result outlet. Overlay the mathematically correct 5D penteract projection and live route edges. Let the operator rotate any of the ten 5D planes and inspect 3D cross-sections. Rendering must not block chat: dynamic import, reduced-motion mode, 30fps low-power cap, adaptive pixel ratio, visibility pause, and a static SVG fallback. The 3D projection is a dashboard, not an extra neural-network inference stage.

## Acceptance gates

- A/B against the existing October planner and Diana router on identical held-out requests.
- Report task understanding accuracy, clarification precision, tool-policy violations, factual correctness, p50/p95 latency, actual input/output tokens, GPU joules/request where measurable, and peak VRAM.
- Test adversarial ambiguity, private-mode denial, malformed JSON, missing model, GPU exhaustion, retries, hallucinated receipts and disabled telemetry.
- No production rollout until the new router beats or matches the baseline on correctness and policy, with a measurable cost/latency benefit.
- No automatic high-privilege tool access, deployment, training or cloud transfers.
