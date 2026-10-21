# October Penteract 5D — CPU learning and independent-review acceptance protocol

**Status: experimental, advisory-only, fail-closed. No production promotion.**

## What was actually trained

The October five-dimensional space in \`src/detroit/penteract-learned.ts\` is a **1925-parameter (384 input features × 5 output coordinates + 5 biases)** CPU-trained linear+Tanh projection. Synthetic intent strings are encoded into bounded normalized Unicode 1–3-gram feature vectors. A softmax computed from distances to the six fixed 5D simplex prototypes supplies an **uncalibrated** expert suggestion, with abstention gates on mixed intents and low score margin. This is a new trainable routing adapter, **not** Qwen3/DeepSeek/Transformer language model training or an improvement in language understanding.

\`training/october/train-penteract-projector.mjs\` performs real deterministic SGD. Of 144 GPT-authored synthetic training cases, **120 train / 24 calibration** are used internally to choose number of epochs; it then retrains on all 144 cases. The 48 distinct single-domain + 20 unknown/mixed cases form a separate development evaluation suite. Their results have now been inspected by developers, so subsequent changes may **NOT** be described as blind evaluation on an untouched independent holdout. All training and report files are local; CI uploads only generated synthetic reports and numerical weights.

Training command from the repository root (Node.js 22+):

\`\`\`sh
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs training/october/train-penteract-projector.mjs --output training/october/generated/october-five-projector-weights.json --report training/october/generated/october-five-projector-report.json
\`\`\`

Look for GitHub Actions artifact \`october-penteract-learned-cpu-v0.1\` in the October Policy Real Training workflow. Weights are **not deployed**.

### Concrete negative finding

The initial 160-epoch pilot overfit: training loss ~0.0035 from ~1.80, while a stratified 24-case train-internal calibration loss remained ~1.49. On its 68 synthetic development items, observed expert-classification correct/coverage and unknown abstention were insufficient to replace the lexical rule. In particular, unknown/mixed abstention was **65% learned vs 90% lexical**, so the default learned route is blocked from promotion.

The \`syntheticSafetyVsLexical\` report gate must pass on held-out labeled cases **before** even considering future supervised evaluation; passing that one metric alone never authorizes production.

## Local side-by-side visualization

Detroit Studio → October 5D supports selecting a local JSON weight file (max 180 KB). It validates schema/shape/provenance declaration, computes five coordinates with CPU math and shows a second point beside the original heuristic 5D location. This is a read-only mathematical preview: **no model download, network upload, GPU worker, Diana tool call, permissions change or persistent save**. The declared training provenance is NOT cryptographically authenticated; do not accept unknown third-party files as trusted model evidence.

## Independently reviewed task design

To distinguish genuine intent parsing from memorizing domain keywords, a fresh external reviewer must select questions and have **at least two independent evaluators** label them without seeing either route prediction. Cases must be **explicitly consented to, manually de-identified**, and reviewed for private content (names, health details, phone numbers, financial records, API keys, internal URLs, etc.) before using the local evaluator. Its regex is only a coarse extra guard and does **not** independently guarantee anonymization or authentic human review.

Each JSONL line must contain exactly the following eight fields:

\`\`\`json
{"id":"example_001","question":"請將本月銷售資料計算平均值","expertLabel":"numbers","dianaToolLabel":"cream","reviewers":["reviewer_a","reviewer_b"],"adjudicated":true,"redacted":true,"consented":true}
{"id":"example_002","question":"請整理這件跨部門任務","expertLabel":null,"dianaToolLabel":null,"reviewers":["reviewer_a","reviewer_b"],"adjudicated":true,"redacted":true,"consented":true}
\`\`\`

Examples above are **illustrative**, NOT independently labeled benchmark cases. Allowed \`expertLabel\`: \`finance\`, \`research\`, \`code\`, \`design\`, \`writing\`, \`numbers\`, or \`null\` (no safe single expert). Allowed \`dianaToolLabel\`: existing exact Diana tool IDs or \`null\` (tool not labeled). These are **separate taxonomies**; never compare their accuracies as though they answer the same question.

Use the following command after supplying your *local* redacted/adjudicated JSONL and downloading the locally generated CPU weights:

\`\`\`sh
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs training/october/penteract-reviewed-eval.mjs --cases /path/to/consented-reviewed.jsonl --weights training/october/generated/october-five-projector-weights.json --output training/october/generated/october-external-review-report.json --diana-readonly
\`\`\`

The evaluator checks explicit opt-in flags, reviewer attestations, bounded schema, and some obvious secrets; it has **no external network request**. The optional Diana evaluation only calls \`chooseDianaTool\` to obtain an inert *proposal* under private/offline conditions. It never dispatches the tool, signs receipts, or changes permissions. Report contains only aggregate rates, Wilson 95% intervals and SHA-256 of the input; it does **not** serialize individual questions. Reviewer independence remains **self-attested and unverified by the software**.

## Production release criteria (not yet met)

- Independently consented and adjudicated tasks, including ambiguous/multi-domain tasks and varied paraphrases; target at least 100 meaningful cases, pre-register the failure criteria before any model iteration.
- Demonstrate unknown/mixed abstention **no worse than the current lexical baseline** and no material decline in correctness or policy compliance; report coverage to avoid a degenerate "always abstain" model.
- Report confusion matrix, score intervals and domain-by-domain failures. Never describe confidence as an empirically calibrated probability without separate calibration evidence.
- Paired real tool-intent evaluation against Diana for tools, not just 6 expert domains; no unauthorized dispatch.
- Hardware-specific inference p50/p95 latency, Ollama input/output tokens and **GPU energy only from an actual power meter**; do not infer joules from synthetic percentages.
- Explicit human release review, staged canary, feature flag, rollback and regression gates before changing any real routing.

The highest-efficiency choice today remains: **do not spend GPU time on this unproven learned route for ordinary conversations**. Keep deterministic lightweight routing and the deeper understanding pass only when requested/necessary.
