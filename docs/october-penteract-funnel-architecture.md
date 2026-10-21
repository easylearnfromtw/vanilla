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

## Prototype implementation snapshot — October 2026

These are completed pieces on the experimental PR branch, not published model improvements:

- \`src/detroit/penteract-5d.ts\` implements genuine R5 vectors, 32 penteract vertices, 80 edges, ten rotation planes, a regular 5-simplex of six expert prototypes, and transparent deterministic lexical/hashed query embedding. The embedder is **not** a trained neural semantic projection. Rotations preserve true 5D distances.
- \`src/detroit/penteract-camera.ts\` rotates the *projected R3 geometry* with a bounded orbit camera, independent of R5 rotation. \`PenteractFunnelPanel.tsx\` renders R5→R3→R2 on-demand through lightweight SVG. Interactive yaw/pitch/zoom need no continuous GPU render loop.
- \`src/detroit/penteract-section.ts\` computes a mathematically exact intrinsic-axis intersection:
  \[[-1,1]^5 \cap \{w=w_0,v=v_0\}=[-1,1]^3\times\{(w_0,v_0)\}.\]
  For -1≤w₀,v₀≤1 this contains eight vertices, twelve edges. **Section first, then rotate:** this is NOT claiming to clip the rotated polytope against fixed world-axis hyperplanes. W/V sliders modify that exact embedded section.
- \`src/detroit/penteract-shadow.ts\` is read-only, local, non-authoritative: it **abstains** on missing lexical evidence or nearly tied geometric neighbors instead of routing a high-risk action to a guessed tool. It does not replace or bypass Diana, Ceres, Quirinus, Merlin, Veritas or Slime scheduling.
- \`training/october/penteract-routing-audit.mjs\` evaluates 50 fixed, **GPT-authored synthetic** prompts across six familiar domains and unknown/mixed requests. The CI report separates top-one classification accuracy and shadow abstention. This is a sanity check only: it cannot establish semantic generalization, real tool-choice accuracy or LLM improvement.
- \`src/detroit/penteract-telemetry.ts\` and October's explicit deep Ollama comprehension pass record provider-reported generation tokens and latency in volatile memory. A 55% comprehension-output-token target is a **reference threshold**, not verified GPU energy, not FLOPs, and not a reason to consume extra tokens on simple questions.

### Test and report commands

\`\`\`sh
npm run test:october-quality
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs training/october/penteract-routing-audit.mjs --output training/october/generated/october-penteract-shadow-audit.json
npm run build
\`\`\`

No background worker, model download, cloud call, new permission grant or real tool execution is performed by those tests. A real rollout requires blind operator-reviewed requests and a Diana baseline under identical hardware/model conditions, plus quantitative correctness/latency/energy measurements. GPU joules/request must remain unavailable until real host metering is installed.

## R5 learned shadow model — CPU training and safety gate

This optional model is **not a Qwen fine-tune**, and is **not a replacement for Diana or Merlin**:

- A hashed character 1–3-gram input of 384 features is learned into a true five-component coordinate in `R^5`. Six equal-distance five-simplex prototypes serve as class centers. The optimizer performs true SGD/backprop on **1,925 weights and biases** (5×384 + 5), entirely on CPU.
- Training uses **144 synthetic labeled prompts**, with an internal **120/24 calibration split** used for epoch selection only. After selection, it retrains on all 144 rows. An external **48 single-domain + 20 mixed/unknown synthetic** set is for reports, not optimizer updates. No model is trained on real private conversation content.
- A conservative understanding gate requires exactly one clear domain signal **and agreement** with the predicted learned domain. No evidence, multi-domain or disagreement produces **abstain**, returning the decision to existing Merlin/Diana understanding instead of blindly nominating a specialist.
- The fixed 68-case synthetic eval set has already been viewed during development and the gate revised in response. **It is no longer an untouched blind holdout for the combined model+gate.** Future comparisons require a newly frozen external human-adjudicated benchmark, including non-keyword paraphrases and adversarial wording. CI still treats this set as a useful regression test.
- October Studio supports an optional local JSON weight import, strict schema checking, R5 coordinate overlay and side-by-side old-versus-learned *advisory* routing. Imported weight metadata is a declaration, **not cryptographic authenticity**; no privilege or cloud inference occurs.
- The pipeline intentionally fails CI if the gated five-dimensional router creates more **false single-expert nominations on synthetic unknown/mixed cases** than the old lexical shadow, or if fewer known-domain cases are correctly routed. Passing this guard does not grant deployment eligibility.
- The next formal release gates are independently labeled intent and tool-choice benchmarks using task definitions comparable to Diana, privilege-denial tests, hardware-measured latency/token/energy, and shadow logging without raw private content.

### Explicit training commands

```sh
npm run test:october-quality
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs training/october/train-penteract-projector.mjs --output training/october/generated/october-five-projector-weights.json --report training/october/generated/october-five-projector-report.json
```

GitHub Actions uploads the `october-penteract-learned-cpu-v0.1` artifact containing an **experimental** weight file and the diagnostic report. Neither is automatically used to answer queries or authorize tools.

## R5 paired CPU latency measurement (experimental)

The Oct 21 CI now runs \`training/october/benchmark-penteract-cpu.mjs\` and archives the report together with CPU-trained weights. This is a **CPU benchmark**, not power draw, and not LLM token-generation time.

- 68 fixed GPT-authored synthetic requests, repeated 30 times each (**2,040 calls per implementation**).
- Run the same input through the lexical shadow router and the learned R5 router, alternating order between rounds to reduce systematic warmup/order bias.
- Record measured p50/p95/p99 and mean using local Node \`performance.now()\`. No prompts, model responses, or user identifiers appear in the report.
- CI sample from GitHub Actions run \`39615227386\`: lexical p95 **0.01901 ms**, learned R5 p95 **0.05704 ms**; the learned version was about **3.0× slower relative**, but remained below 0.1 ms p95 on that runner. These figures are one run of synthetic inputs on GitHub hardware, NOT a promise for phones, PCs, browsers, or real workloads.
- Relative and absolute CPU timing may shift due to JIT warmup, CPU load, power management and timer granularity. No GPU model, RTX 3050, NVIDIA watt counter or electrical energy was measured.

\`\`\`sh
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs training/october/benchmark-penteract-cpu.mjs --output training/october/generated/october-five-projector-cpu-latency.json
\`\`\`

The artifact \`october-penteract-learned-cpu-v0.1\` contains this CPU latency JSON alongside the experimental learned weights and task-routing diagnostic. Actual model-power allocation toward *understanding the user request* still requires host-level power metering for each inference stage and comparisons against correctness/latency baselines; a planned 55% token budget must not be presented as measured GPU energy.
