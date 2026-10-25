# OCTUBER finance training: 20 exchanges, 1996–2026

**State: GitHub implementation prepared. No licensed 30-year historical corpus, approved news corpus, GPU updates or financial model checkpoints were created.** Source-code and CI success cannot be reported as model training.

## Universe and provenance

- Window: 1996-10-25 through 2026-10-25. The WFE February 2026 domestic equity market-capitalization snapshot fixes the **20 leading reporting exchanges** in markets.json. Source: https://focus.world-exchanges.org/issue/april-2026/market-statistics
- This is a 2026 top-20 snapshot projected into the past, **not** the true top 20 in 1996. Beware survivorship bias, later market launches, changes to index membership, country-level proxies and a divergence between exchange market cap and an index price.
- The representative index and ticker hints must be validated against the chosen licensed market-data provider; Euronext, Nasdaq Nordic and JPX are especially imperfect proxy mappings. Index price levels are not currency-adjusted total returns.
- For causal/economic context, prefer verifiable exchange notices, regulators, official central banks, IMF and BIS. Historical GDELT 1.0 event data extends to 1979, but GDELT 2.0 multilingual event/knowledge feeds began in 2015; coverage is not uniform and publicly indexed news is not necessarily licensed training text. Source: https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/deaths/methodologies/globaldatabaseofeventslanguageandtonegdeltappendix

## Required data: do not fabricate or silently download

Store all raw feeds under private/octuber-finance/; this directory is excluded from the repository. Required input:

- prices/ contains 20 daily CSV files named according to the market ids in markets.json; format is date,close with ISO-8601 dates, strictly positive finite market-index levels. Missing history must remain missing, not interpolated without methodology.
- price-rights.json maps each market id to provider, rights_basis, rights_reference, approved_for_training and price_type.
- Optional vetted-events.jsonl holds factual news/event metadata, not copyrighted article bodies. Each record needs id, timezone-aware published_at, original paraphrased title and summary, source_name, source_url, market_ids, causal_status, rights_basis, rights_reference and reviewed: true.
- Legal provenance must identify specific provider rights; the existence of a public URL or a purchased retail-data account does not imply permission for model training.

Illustrative authorization manifest entry (schema illustration ONLY, no claimed rights):

~~~json
{
  "taiwan": {
    "provider": "REPLACE_WITH_APPROVED_FEED",
    "rights_basis": "permission",
    "rights_reference": "REPLACE_WITH_DOCUMENTED_LICENSE",
    "approved_for_training": true,
    "price_type": "price_index"
  }
}
~~~

Do not set approved_for_training before verifying the actual entitlement. Supported rights_basis: owned, permission, compatible-license, public-domain. Price type: price_index or total_return_index.

## Data preparation and human signoff

~~~bash
python3 training/octuber-finance/pipeline.py catalog

# validates source inputs but does not create outputs:
python3 training/octuber-finance/pipeline.py prepare \
  --prices-dir private/octuber-finance/prices \
  --rights private/octuber-finance/price-rights.json \
  --events private/octuber-finance/vetted-events.jsonl \
  --output-dir private/octuber-finance/candidates \
  --require-top20 --dry-run

# remove --dry-run after review to create unapproved training candidates
python3 training/octuber-finance/pipeline.py prepare \
  --prices-dir private/octuber-finance/prices \
  --rights private/octuber-finance/price-rights.json \
  --events private/octuber-finance/vetted-events.jsonl \
  --output-dir private/octuber-finance/candidates \
  --require-top20
~~~

The events flag is optional; without vetted-events.jsonl the pipeline generates descriptive market-stat candidates ONLY. No sources are fetched or simulated. The risk statistics cover monthly returns, day-on-day returns, trailing 20-day annualized sample volatility and recent peak drawdown. A news event is conservatively aligned with the next full local trading day, never its potentially ambiguous intraday publication session. Event responses are retrospective and never represent an unknown future outcome as a past forecast.

Every proposed candidate is created reviewed:false, consent:false and candidate_sha256. A **human reviewer** must approve each candidate by exact id and matching SHA-256 in a separate approvals.jsonl:

~~~json
{"id":"REPLACE_WITH_ACTUAL_ID","candidate_sha256":"REPLACE_WITH_ACTUAL_SHA256","reviewed":true,"consent":true,"rights_basis":"permission","rights_reference":"SPECIFIC_VERIFIED_LICENSE","reviewer":"AUTHORIZED_PERSON"}
~~~

Then:

~~~bash
python3 training/octuber-finance/pipeline.py approve \
  --candidates private/octuber-finance/candidates/candidates.jsonl \
  --approvals private/octuber-finance/approvals.jsonl \
  --output-dir private/octuber-finance/approved \
  --min-train 100 --min-eval 100
~~~

The result uses the exact seven-field Atuber SFT schema: id, user, assistant, domain, source, reviewed, consent. Hashes and counts are recorded separately. The temporal partitions are:

| Data period | File | Permitted use |
|---|---|---|
| 1996-10-25 to 2021-12-31 | train.jsonl | optimizer updates |
| 2022-01-01 to 2024-12-31 | eval.jsonl | tuning and checkpoint selection |
| 2025-01-01 to 2026-10-25 | test.jsonl | BLIND backtest only, no optimization |

Cross-boundary event horizons are dropped; individual candidate approval is mandatory. The system cannot independently verify human assertions about licensing or factual causation.

## Independent training for every compatible tier

This branch integrates the existing OCTUBER five-size CUDA QLoRA trainer. A separate adapter, loss record, independent benchmark and release decision is mandatory for **each** size:

| Tier | Qwen base | Indicative single-GPU VRAM | Status |
|---|---|---:|---|
| 0.6b | Qwen3-0.6B | >=6 GiB | CUDA QLoRA configured |
| 4b | Qwen3-4B | >=12 GiB | CUDA QLoRA configured |
| 14b | Qwen3-14B | >=24 GiB | CUDA QLoRA configured |
| 30b-moe | Qwen3-30B-A3B | >=48 GiB | GPU and MoE compatibility unverified |
| 32b | Qwen3-32B | >=48 GiB | CUDA QLoRA configured |
| 60b | HyperNova-60B candidate | Unverified | **No working 60B trainer yet** |

These VRAM figures are only rough preflight thresholds, not training-capacity guarantees. GGUF inference weights cannot be used directly as HF QLoRA base weights.

~~~bash
# No GPU use, no download:
python3 training/atuber/multitier_train.py --tier 0.6b --steps 200

# Run ONLY on an authorized CUDA GPU, after rights review:
python3 training/atuber/multitier_train.py --tier 0.6b --train \
  --steps 200 \
  --dataset private/octuber-finance/approved/train.jsonl \
  --eval-dataset private/octuber-finance/approved/eval.jsonl \
  --output artifacts/octuber-finance-06b \
  --approve-gpu-compute --ack-model-license --allow-model-download
~~~

To train the other four supported tiers, repeat with tier 4b / 14b / 30b-moe / 32b and different output directories. Do not combine adapters across different bases or claim the 60B model is trained. Run a 100–200 step smoke test first, compare with baseline on the independent holdout, then scale only if justified. For >5000 steps the trainer requires at least 1000 approved training records and --approve-150k; excessive passes over small datasets can degrade accuracy.

## Acceptance gates

- All numbers, index names, times, sources and licensing attestations trace to a real feed and source record.
- Causal language distinguishes official documentation, supported attribution, hypotheses and unknown causes. Correlation is insufficient for sole-cause claims.
- Out-of-time evaluation must include return computation, financial reasoning, abstention, robustness to missing information, regional contagion, drawdown and error rate.
- Checkpoint lineage requires actual training-provenance.json, real adapter_model.safetensors, SHA-256, optimizer steps, valid evaluation metrics and human approval.
- No automatic acceptance threshold such as 92% is asserted without an independent measured benchmark.
- These tests do not reserve GPU capacity, license data, download articles, merge or deploy models.

## CI (synthetic test fixtures only)

~~~bash
python3 -m unittest discover -s tests -p 'test_octuber_finance_pipeline.py'
python3 -m unittest discover -s tests -p 'test_atuber_multitier_qlora.py'
python3 -m unittest discover -s tests -p 'test_octuber_multitier.py'
~~~
