# Atuber 0.1 | Standalone trained language model

**Current repo status: bootstrap-only / no independently trained weights.**
Atuber currently uses the standard prebuilt Qwen3-0.6B WebLLM engine with its
own system prompt and orchestration. It is not yet a unique neural checkpoint.

## Release definition

An **independently deployable Atuber model** is a trained derivative of the
Apache-2.0-licensed `Qwen/Qwen3-0.6B` base, with reviewed training data,
a real LoRA adapter, merged safetensors checkpoint, a GGUF derived from that
checkpoint, SHA-256 manifests and its own Ollama tag `atuber:0.1`.
It does not mean a foundation model trained from random weights.

The model family and training lineage must remain visible. **Renaming Qwen
in an Ollama Modelfile is not fine-tuning.**

## Data policy

Create `private/reviewed-atuber.jsonl` yourself, outside Git.
At least **100 genuinely reviewed and consented** records are required.
Each line is a JSON object with exactly these fields:

```json
{"id":"review_001","user":"可以幫我解釋這個數據嗎？","assistant":"請提供數據與單位，我才能正確分析。","domain":"general","source":"authored","reviewed":true,"consent":true}
```

Domains: `general`, `code`, `research`, `writing`, `tool-use`,
`abstention`. Sources: `authored`, `consented`.
No scraped private conversations, Gmail, passwords, API keys or medical records.
An automatic schema check cannot replace copyright and consent review.
Synthetic examples are useful to test the pipeline but not sufficient to
claim model quality. Do not put training or evaluation examples into Git.

## On your RTX 3050 or an approved Slime CUDA node

```sh
python3 -m venv .venv-atuber
. .venv-atuber/bin/activate
pip install -r training/atuber/requirements.txt
python training/atuber/train.py --dataset private/reviewed-atuber.jsonl --validate-only
python training/atuber/train.py --dataset private/reviewed-atuber.jsonl --output artifacts/atuber-adapter-v0.1 --train --steps 180 --max-length 512
python training/atuber/merge.py --adapter-root artifacts/atuber-adapter-v0.1 --output artifacts/atuber-merged-v0.1
```

Uses 4-bit NF4 QLoRA; 0.6B parameters; micro-batch 1; gradient accumulation
8; checkpoints kept locally; no automatic Hugging Face push or outbound tool
calls apart from explicit base-weight download. **RTX 3050 memory differs
between models:** verify VRAM, CUDA and compatibility locally. A smaller
sequence length may be required for limited VRAM.

## GGUF export & independent Ollama package

Use a compatible checked-out `llama.cpp` release; the actual converter and
quantizer are external programs, not bundled or secretly downloaded:

```sh
python path/to/llama.cpp/convert_hf_to_gguf.py artifacts/atuber-merged-v0.1 --outfile artifacts/atuber-f16.gguf --outtype f16
path/to/llama.cpp/build/bin/llama-quantize artifacts/atuber-f16.gguf artifacts/atuber-q4_k_m.gguf Q4_K_M
python training/atuber/package.py --merged artifacts/atuber-merged-v0.1 --gguf artifacts/atuber-q4_k_m.gguf --output artifacts/atuber-ollama-v0.1
cd artifacts/atuber-ollama-v0.1
ollama create atuber:0.1 -f Modelfile
ollama run atuber:0.1
```

The package step verifies GGUF magic, file size, merged-checkpoint file
digests, reviewed-data digest and adapter provenance. These checks establish
local artifact consistency, **not** third-party weight attestation or that
GGUF conversion was performed faithfully; evaluate real model behavior too.
Production deployment and registration in Vanilla are intentionally manual.

## Acceptance before replacing the bootstrap

1. At least 100 **held-out, human-reviewed and non-overlapping** task cases,
   including tool choice, abstention, Mandarin/Taiwanese style, factual evidence,
   dangerous instructions and privacy.
2. Compare to unmodified Qwen3-0.6B and Diana baseline. Record task success,
   JSON validity, hallucination rate, false tool invocation rate and latency.
3. Check independent checkpoint SHA-256, license attribution, and quantized
   model integrity, then run on Slime or an owner-approved Ollama endpoint.
4. Only then update the tracked Atuber manifest and user-facing version.
   iPhone WebLLM requires a separate **MLC conversion and real device test**;
   Ollama GGUF cannot simply be renamed to a WebLLM prebuilt model ID.
5. The private mode retains on-device-only behavior; deployment to an external
   host always requires a separately approved privacy boundary.

## Current execution constraints

GitHub Actions tests only standard-library dataset, provenance, package
policy, and UI state. **They do not download a 0.6B checkpoint, use a GPU or
claim training occurred.** Check actual trained weight files on the approved
host before announcing Atuber as an independent model.

Base-model source and license: https://huggingface.co/Qwen/Qwen3-0.6B
Training approach: https://huggingface.co/docs/trl/sft_trainer
