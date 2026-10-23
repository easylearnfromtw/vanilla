# October × NVIDIA Cosmos — integration and training gate

Status: proposal / evaluation only. No Cosmos model weights downloaded or trained.

## Objective
Extend October (阿土伯) with optional physical-world video reasoning via Retina → Detroit/Diana → a separately deployed Cosmos-compatible inference adapter. Do not replace October's existing text model or change privacy-mode guarantees.

## Architecture
1. Retina extracts media type and performs existing image understanding.
2. Diana selects the optional physical-reasoning capability only for video, temporal, spatial or action questions.
3. Detroit invokes a protected HTTPS adapter when explicitly configured and allowed by privacy settings.
4. The adapter returns structured observations, uncertainty, model/version and timing; October synthesizes the answer.
5. On timeout, unsupported hardware, refusal, or errors, fall back to existing Retina/text behavior. Never fabricate observations.

## Security and resource gates
- Feature disabled by default; no implicit third-party media upload.
- Never send private-mode inputs to a remote endpoint.
- Owner-controlled allowlisted HTTPS endpoint; credentials remain server-side.
- Limit media duration, payload size, concurrency, runtime and cost; redact logs.
- Slime scheduling is optional and requires verified available VRAM. Do not assume RTX 3050 can host full Cosmos.
- Check NVIDIA model license and deployment requirements before downloading or distributing weights.

## Evaluation before training
Build a consented benchmark with clips and human-verified labels:
- object permanence, motion direction, temporal ordering, collisions, spatial relationships, unsafe/uncertain cases.
- Compare Retina-only baseline versus Cosmos-assisted route.
- Track accuracy, hallucination rate, latency p50/p95, VRAM peak, cost per clip and fallback success.
- Require human review of failures and dataset rights/provenance.

## Distillation stage (separate opt-in)
Only after measurable improvement: export reviewed teacher outputs with provenance; deduplicate, split by source to prevent leakage, run small-student LoRA/SFT offline, compare with held-out evaluation, and permit rollback. Never train directly on unverified generated explanations.

## Acceptance checklist
- [ ] Confirm Retina/Diana/Detroit interfaces and add isolated adapter with tests
- [ ] Add opt-in configuration, privacy gates, timeout and fallback
- [ ] Create benchmark and baseline report
- [ ] Verify available deployment hardware and license
- [ ] Decide on student training only after evaluation
