# Sign Well Agent Sandbox — 5 domains × Detroit ABC

This is an offline synthetic simulation and evaluation harness, NOT updated model weights, a real-world autonomous executor, or an automated financial trading or insurance-pricing product.

## Implemented

- Self-contained Node.js standard-library script: sandbox.mjs.
- Eight synthetic case families: economics, management, finance, accounting, actuarial science, A system operations, B data improvement, and C multi-tenant plugin policy.
- Deterministic train/eval split: 320 training demonstrations (40 per domain) and 80 held-out cases (10 per domain).
- Numeric answer, action selection, tool-plan and risk-note grading. Results are limited synthetic benchmark indicators, not real-world accuracy.
- Localhost-only Ollama JSON benchmarking, without credentials, trading, live deployments or arbitrary shell execution.

## Quick start

1. Run: node training/agent_sandbox/sandbox.mjs --test
2. Generate: node training/agent_sandbox/sandbox.mjs
3. Pull base: ollama pull qwen3:4b
4. Create configuration: ollama create signwell-agent:0.1 -f training/agent_sandbox/Modelfile
5. Benchmark: node training/agent_sandbox/sandbox.mjs --benchmark training/agent_sandbox/generated/eval.jsonl --model signwell-agent:0.1

### Key distinction

- Modelfile adapts behavior, NOT weights.
- Domain retrieval and deterministic calculators provide grounded answers; a backend plugin runtime must validate actual execution and authorization.
- Real fine-tuning using SFT/LoRA/QLoRA requires a compatible trainer, reviewed dataset, training hardware and license checks. Never train on held-out eval cases.

## Knowledge grounding (five professional disciplines)

- 25 concise original cards in knowledge.json: formula, interpretation, assumptions and search keywords.
- Offline retrieval: node training/agent_sandbox/retrieve.mjs "GDP 平減指數"
- Local model answer with retrieved context: node training/agent_sandbox/retrieve.mjs --chat --model signwell-agent:0.1 "請解釋 NPV 與折現率的關係"
- Retrieval is a simple lexical baseline, not full vector RAG, a live data feed, or trained weights.
## Combined ABC roadmap

- A: LUCA metrics -> Diana diagnostics -> persistent scheduler -> allowlisted tools -> verified result.
- B: CREAM analysis -> deterministic calculations -> risk-aware proposal -> preauthorized bounded action -> measured outcomes.
- C: isolated tenant -> backend-enforced scoped grants -> persistent tenant job -> signed audit -> authorized tool execution.
- Existing Detroit job worker supports allowlisted public webpage checks, NOT arbitrary recurring agents. Current Windows node proxies Ollama, NOT OS commands.

## Domain coverage and standards

- Economics: macro/micro, deflators, monetary transmission, causality, forecasting.
- Management: process optimization, KPIs, expected economics, controls.
- Finance: NPV, cost of capital, valuation, investments and sensitivity.
- Accounting: equation, financial statements, double-entry, managerial accounting, standards and dates.
- Actuarial: probability, frequency/severity, expected losses, reserves, stress testing and predictive models.

Curriculum pointers (no proprietary exam items or textbook pages copied):
- CFA: https://www.cfainstitute.org/programs/cfa-program/curriculum
- SOA: https://www.soa.org/education/
- IFRS 18: https://www.ifrs.org/issued-standards/list-of-standards/ifrs-18-presentation-and-disclosure-in-financial-statements/
- Ollama: https://ollama.com/blog/structured-outputs and https://ollama.com/blog/tool-support

## v0.2 — Integrated multi-step A/B/C autonomous sandbox (OFFLINE only)

The five subject areas are combined in a **single synthetic business decision**: macroeconomic inflation adjustment -> management contribution margin -> opening accounting equation -> discounted project cash flows (NPV) -> actuarial expected loss -> mock policy decision -> in-memory mock report.

A/B/C coverage:
- **A — Operations:** read node health mock metrics, compute failure rate, suggest bounded diagnostics without shell or deployment.
- **B — Data automation:** compute and verify business metrics; simulate scheduled, authorized mock reports.
- **C — Commercial plugins:** enforce tenant and scope isolation in executable policy checks, NOT model instructions.

Safety and recovery: execution requires schedule maturity, scoped permission and same-tenant access. Same job ID + same payload replays results rather than duplicating mock writes; altered payload blocks. Retry is simulated before the mock write. A kill switch blocks subsequent actions. Untrusted fields do not grant permission. **No persistent scheduler, remote plugin transport, customer access or real OS operations are supplied.**

**Data split (additional to 320/80 atomic exercises):**

| Dataset | Cases | Permitted use |
| --- | ---: | --- |
| Integrated SFT candidates | 256 | Human review, then opt-in model fine-tuning |
| Integrated trainer validation | 64 | Check loss during fine-tuning only |
| Integrated blind evaluation | 128 | Post-training, never exposed to trainer |
| Atomic practice | 320 | Additional generated demonstrations; not expert content |
| Atomic held-out | 80 | Base arithmetic/JSON regression evaluation |

The 320 integrated generated examples are split 256/64 when exporting to NOODLES. The 128 blind test scenarios have different index ranges and tenant identities; model memorization or data-contamination safeguards are still required. Dataset split alone cannot prove real generalization.

Run on a local Node.js 20+ machine from the repository root:

\`\`\`bash
node --test training/agent_sandbox/integrated.test.mjs training/agent_sandbox/integrated-dataset.test.mjs
node training/agent_sandbox/integrated.mjs --demo
node training/agent_sandbox/integrated-dataset.mjs
node training/agent_sandbox/to-noodles.mjs

python3 training/noodles_train.py --mode sft \
  --train training/agent_sandbox/generated/integrated-noodles-sft-train.jsonl \
  --eval training/agent_sandbox/generated/integrated-noodles-sft-validation.jsonl \
  --check-only
\`\`\`

Adapt an Ollama configuration (not model weights) and test on the computer **running Ollama**:

\`\`\`bash
ollama pull qwen3:4b
ollama create signwell-agent:0.2 -f training/agent_sandbox/Modelfile.integrated
node training/agent_sandbox/integrated-dataset.mjs --benchmark training/agent_sandbox/generated/integrated-eval.jsonl --model signwell-agent:0.2 --limit 16
\`\`\`

The benchmark samples all four scenario types when a small --limit is provided. It reports objective JSON/number/tool-sequence accuracy only, not production task-success rate. No actual Ollama inference or LoRA training has been executed in this PR. Real LoRA/QLoRA requires choosing a correctly licensed, compatible Hugging Face weight checkpoint, curated data, sufficient GPU VRAM and a separate training run. The existing NOODLES training system is only connected through **data export and validation**, never automatic weights deployment.

## Before customer usage

Server-side authz, isolation, idempotency, spend caps, signed audit, emergency stop, rollback, integration testing and customer consent for data reuse are mandatory. A model text response is never authorization. Financial/accounting/actuarial production use requires domain and jurisdiction review.
