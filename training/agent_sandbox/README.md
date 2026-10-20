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

## Before customer usage

Server-side authz, isolation, idempotency, spend caps, signed audit, emergency stop, rollback, integration testing and customer consent for data reuse are mandatory. A model text response is never authorization. Financial/accounting/actuarial production use requires domain and jurisdiction review.
