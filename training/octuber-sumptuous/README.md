# OCTUBER SUMPTUOUS 30B — genuine model weight training (v0.1)

**Current release: PLANNED / UNTRAINED.** See `models/octuber-sumptuous/manifest.json`.
This directory is the first **executable model development pipeline** for OCTUBER
SUMPTUOUS, not a website skin, Ollama alias, API routing strategy or claimed
successful GPU run.

## Architecture and lineage

- **Real upstream base weights:** [Qwen/Qwen3-30B-A3B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507).
- **Architecture:** Qwen3 MoE, roughly **30.5B total / 3.3B active** parameters.
  It is *not* a 30B dense model, and 3B active does *not* mean it downloads as 3B.
- **License:** Apache-2.0 upstream; preserve attribution, changes, copyright and notices.
- **Development outcome:** a separately trained, provenance-tracked **fine-tuned
  derivative checkpoint**, not a new foundation model trained from random weights.
- 32B dense training is a distinct future target, **not** relabeled as SUMPTUOUS 30B.
- Attention QLoRA is intentionally limited to `q_proj,k_proj,v_proj,o_proj`;
  expert/router modules need separate validated research before being trainable.

## Step 1 — approved training data (on your own workstation)

Prepare a **private**, copyright-reviewed and consented JSONL file outside Git.
Use the exact seven-key schema of `training/atuber/dataset.py`. A minimum of 100
individually reviewed/consented examples is the syntax gate, **not** proof of
enough diversity for an effective 30B model. Production quality needs far more
well-distributed examples and a separate held-out human benchmark.
For example, the following is a format example **only**, not a training corpus:

```json
{"id":"sample_001","user":"請說明模型權重與 API 模型別名的差別。","assistant":"權重是實際的神經網路參數；別名只是存取名稱。沒有微調與獨立權重，就不能稱為新的模型。","domain":"general","source":"authored","reviewed":true,"consent":true}
```

```bash
python3 training/octuber-sumptuous/train.py \
  --dataset private/reviewed-sumptuous-30b.jsonl --validate-only
```

This CPU-only check does **not** install CUDA, pull a model, create weights,
send files anywhere, or change the release manifest.

## Step 2 — provision real 30B training capacity

A 4-bit, ~30.5B parameter MoE checkpoint still has to store all experts. A
desktop with a 6GB GPU that runs 0.6B **cannot be assumed to train 30B**.
Single-GPU 40+ GiB VRAM is a conservative *screening* heuristic for this
experimental QLoRA script, **not** a guarantee against OOM. A multi-GPU NeMo
recipe might be preferable to the experimental single-device run. Ensure
ample disk space (potentially >150GB for upstream weights, fp16 merge and GGUF),
system memory (~96GB or more for CPU merge), CUDA compatibility, and owner
authorization. The official NVIDIA Qwen3 MoE [training recipes](https://docs.nvidia.com/nemo/automodel/latest/model-coverage/large-language-models/qwen/Qwen3-30B-A3B)
include an alternative validated multi-GPU LoRA/SFT configuration.

```bash
python3 -m venv .venv-octuber30
source .venv-octuber30/bin/activate
pip install -r training/octuber-sumptuous/requirements.txt

# Resolve and record an immutable base-model commit (not 'main').
python -c 'from huggingface_hub import HfApi; print(HfApi().model_info("Qwen/Qwen3-30B-A3B-Instruct-2507").sha)'
```

Do not place private data, Hugging Face tokens or API secrets in GitHub issues,
repository history, or browser chat.

## Step 3 — deliberately train a *real* adapter

Run only on a GPU machine you control/are authorized to use. Copy the actual
40-character commit printed above into `--base-revision`.

```bash
python3 training/octuber-sumptuous/train.py \
  --dataset private/reviewed-sumptuous-30b.jsonl \
  --output artifacts/octuber-sumptuous-30b-adapter \
  --base-revision YOUR_REAL_40_CHAR_COMMIT_SHA \
  --steps 180 --max-length 512 \
  --allow-model-download --ack-license-and-data-rights --train
```

Do not add `--ack-low-vram-risk` unless knowingly accepting a high probability
of out-of-memory failures on an undersized GPU. Without `--allow-model-download`,
the model must already exist locally in cache. No automatic cloud billing,
GitHub Actions training, model publication or fallback to another provider.

```bash
python3 training/octuber-sumptuous/merge.py \
  --adapter-root artifacts/octuber-sumptuous-30b-adapter --verify-only
```

Training writes an actual `adapter/adapter_model.safetensors` and a checked
`training-provenance.json` with dataset digest, upstream base revision, holdout
loss and adapter digest **only after a real CUDA training run succeeds**.
These are *adapter weights*, not yet a standalone GGUF or released model.

## Step 4 — produce standalone safetensors / GGUF

A CPU merge loads **real fp16 30B upstream weights** and requires substantial
RAM. Actual downstream conversion support depends on a compatible llama.cpp
version with Qwen3 MoE support. Both are heavy, explicit processes.

```bash
python3 training/octuber-sumptuous/merge.py \
  --adapter-root artifacts/octuber-sumptuous-30b-adapter \
  --output artifacts/octuber-sumptuous-30b-merged \
  --allow-model-download --ack-merge --merge

python path/to/llama.cpp/convert_hf_to_gguf.py \
  artifacts/octuber-sumptuous-30b-merged \
  --outfile artifacts/octuber-sumptuous-30b-f16.gguf --outtype f16

path/to/llama.cpp/build/bin/llama-quantize \
  artifacts/octuber-sumptuous-30b-f16.gguf \
  artifacts/octuber-sumptuous-30b-q4.gguf Q4_K_M

python3 training/octuber-sumptuous/package.py \
  --merged artifacts/octuber-sumptuous-30b-merged \
  --gguf artifacts/octuber-sumptuous-30b-q4.gguf \
  --output artifacts/octuber-sumptuous-30b-package --package

cd artifacts/octuber-sumptuous-30b-package
ollama create octuber:sumptuous-30b-v0.1 -f Modelfile
ollama run octuber:sumptuous-30b-v0.1
```

`package.py` verifies actual merged checkpoints, upstream/adapter/dataset
hashes, GGUF header and reasonable 30B weight sizes, then records the
quantized-file SHA-256. **This still does not certify successful inference,
model quality, a genuine conversion, or independent ownership of upstream IP.**
These must be separately demonstrated and attributed.

## Step 5 — release gate (mandatory, not automated by this PR)

1. Test actual GPU inference on the **newly merged and quantized weights**;
   record device, RAM/VRAM, version, latency, model file digest and failures.
2. A separate, independently reviewed holdout set should assess real code,
   research, abstention, tool receipts, Taiwan Traditional Chinese, dangerous
   requests, hallucination rate and baseline regression vs upstream Qwen3.
3. Respect license/redistribution conditions and publish model provenance,
   model card, training datasets' origin/rights and safety limitations.
4. Only after all checks should a human update the `models/octuber-sumptuous/manifest.json`
   from `planned-untrained` and publish real downloadable model weights.
   Simply merging this PR / passing CI does not meet these conditions.

## CPU-only CI

```bash
python3 -m unittest discover -s tests -p 'test_octuber_sumptuous_30b.py'
```

GitHub Actions **never trains or merges a 30B model**; CI checks module syntax,
dataset validation and refusal of forged model artifacts. The user must supply
an approved GPU host and rights-reviewed dataset for the actual run.
