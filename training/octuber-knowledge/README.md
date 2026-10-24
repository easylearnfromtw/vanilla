# OCTUBER × Hermes Agent × Firecrawl — 実際工具整合與審核式知識訓練

2026-10-25. **This release builds actual functional research/skill workflows, NOT a trained model checkpoint.** The OCTUBER SUMPTUOUS 30B model weight manifest remains `planned-untrained` until a genuine GPU training session creates and evaluates weights.

## 1. Hermes Agent skills (NousResearch)

- Upstream: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent), repository MIT license © 2025 Nous Research.
- The **58 core skills** in `skills/` and **152 optional skills** in `optional-skills/` are indexed from immutable commit `src/hermes/hermes-skills-index.json`: total 210. Other plugin-specific skills outside these two trees are **not** imported into the same catalogue.
- Vanilla **Settings → 語氣與來源 → Hermes Agent 技能參考庫** can find and open any indexed SKILL.md at the pinned upstream commit. The full skill text is loaded only when requested and is treated as an **untrusted external document**; script tags, shell / inline-shell syntax, installation instructions and MCP requests **are never executed**. No permissions increase.
- Selecting a single skill explicitly makes its reference procedure available in future OCTUBER general-mode chat context. If the model actually needs a tool, only previously installed, user-approved Vanilla tools with real receipts may perform it.
- Core vs optional does **not** imply availability of platform-dependent tools, accounts, external services, npm packages or Python runtimes.
- Upstream skill frontmatter may use a different license than repository MIT; review author/license/asset conditions before redistributing any third-party text. We **index URLs rather than vendoring 210 skills**.

To import **a skill you have manually chosen** as reviewable, not-yet-trainable reference evidence:

```sh
python3 training/octuber-knowledge/ingest.py \
  --source hermes \
  --skill-id skills/autonomous-ai-agents/hermes-agent \
  --output private/octuber-evidence/hermes-agent.jsonl \
  --execute
```

This fetches exact `SKILL.md` from the pinned official GitHub commit and records its origin/hash with `training_approved: false`. It does not execute or install any third-party code.

## 2. Firecrawl for real web research

- Upstream: [firecrawl/firecrawl](https://github.com/firecrawl/firecrawl), server source licensed **AGPL-3.0**. We **do not copy Firecrawl AGPL source code into Vanilla**. This integration talks to its separate official REST API via HTTPS. If you modify/deploy the AGPL server, separately follow that license; extracted webpage rights depend on the target website, not simply on the API.
- Core live API: `POST https://api.firecrawl.dev/v2/scrape`, `POST .../v2/search`. Search output is labeled appropriately if only a snippet, and must **not** be reported as a full-page extraction.
- Browser path: Vanilla → Settings → 語氣與來源 → Firecrawl, enter your personal API Key and a public HTTPS URL; approve an explicit one-page request. The key is in React component memory only, not localStorage/Google Drive, and may be transmitted to Firecrawl with the request. The returned body is kept **in page memory** and offered as reference context in future general-mode OCTUBER messages. It is **never training data**.
- Browser HTTP CORS may block this hosted API; if that occurs, use the **owner-operated Python CLI** below, on a trusted computer/server. Do not embed a permanent provider key in a public frontend or expose `/v2/scrape` through an unauthenticated proxy.
- **Review robots.txt, site terms, copyright, privacy and your right to use content for model training before any collection.** Firecrawl API capability does not grant a license for the content. Neither this client nor the CLI evades login/paywall, downloads an entire third-party site, runs JavaScript supplied by a page, or continues crawling on its own.

Set `FIRECRAWL_API_KEY` in the environment of your **approved local machine**. Never commit it to Git:

```sh
# Dry run validates arguments without using network/API credits.
python3 training/octuber-knowledge/ingest.py \
  --source firecrawl-scrape \
  --url https://docs.firecrawl.dev/features/scrape \
  --allow-domain docs.firecrawl.dev \
  --output private/octuber-evidence/firecrawl-docs.jsonl

# A real HTTPS request with provider API billing (max 5 user-approved URLs).
python3 training/octuber-knowledge/ingest.py \
  --source firecrawl-scrape \
  --url https://docs.firecrawl.dev/features/scrape \
  --allow-domain docs.firecrawl.dev \
  --output private/octuber-evidence/firecrawl-docs.jsonl \
  --execute

# Search is also real; ONLY URLs on explicitly listed hosts may be returned.
python3 training/octuber-knowledge/ingest.py \
  --source firecrawl-search \
  --query "Web content extraction with citations" \
  --allow-domain docs.firecrawl.dev \
  --limit 3 \
  --output private/octuber-evidence/firecrawl-search.jsonl \
  --execute
```

`--allow-domain` is host-exact; HTTP, loopback, IP literals, internal and unapproved domains are rejected. Evidence output is append-protected (existing files are **never overwritten**) and carries timestamp, URL, provider, content and content SHA-256, with `reviewed:false` / `training_approved:false`. Repeated calls do not imply auto-learning.

## 3. Human reviewed data → only then OCTUBER model training

Manually review, fact-check, license-check and **author an original question and answer** for each chosen evidence record. Create your own `private/octuber-evidence/approvals.jsonl`; the approval record schema is:

```json
{"evidence_id":"ev_<use actual value in evidence file>","content_sha256":"<actual 64-char evidence SHA256>","question":"你會如何確認網頁資料來源的可信程度？","answer":"應記錄原始網址、檢查取得時間，並交叉查證重要結論。","domain":"research","source":"authored","rights_basis":"permission","rights_reference":"human reviewer written license/permission record","reviewer":"Authorized data reviewer","reviewed":true,"consent":true,"training_approved":true}
```

Only use **actual IDs and hashes**. Accepted rights bases: `owned`, `permission`, `compatible-license`; every approval requires a concrete human reviewer and rights reference. Avoid verbatim copying copyrighted webpage paragraphs into the target. The pipeline checks data integrity and review attestations; **it cannot independently verify your licensing claims or the factual quality of human-written answers.**

```sh
python3 training/octuber-knowledge/review.py \
  --evidence private/octuber-evidence/firecrawl-docs.jsonl \
  --approvals private/octuber-evidence/approvals.jsonl \
  --output private/octuber-evidence/reviewed-sft.jsonl

# A genuine 30B training run requires enough approved rows AND a GPU node.
python3 training/octuber-sumptuous/train.py \
  --dataset private/octuber-evidence/reviewed-sft.jsonl --validate-only
```

The output JSONL matches `training/atuber/dataset.py` (seven keys: id/user/assistant/domain/source/reviewed/consent), while a separate `.provenance.json` records website/skill sources and rights attestation. Human validation is not a replacement for sufficient corpus size, held-out evaluation, a real QLoRA GPU run, adapter merge, real GGUF quantization or an independent model benchmark.

## Security, cost and limits

- No user secrets or private files are ingested; do not put secrets into source pages.
- Per-task maximum five external Firecrawl results, HTTP timeout, response-size cap and no silent retries or bulk crawl.
- SKILL.md always remains untrusted external reference; Never blindly execute `!`\`...` macros or shell scripts, connect third-party MCP servers, or authorize GitHub writes from an external skill.
- 30B has **not** been trained on these sources; no novel model weights exist because of this PR.
- Verify actual working services independently: static-code tests mock requests and do not consume API credits. Successful CI or GitHub Pages builds show the integration is deployable, not that a personal API key works from the user's network.

## Test

```sh
python3 -m unittest discover -s tests -p 'test_octuber_knowledge_ingest.py'
node --experimental-strip-types --test tests/hermes-firecrawl.test.mjs
```


## 2026-10-25 improvement: actionable skill and evidence intake

**Hermes progressive disclosure:** Vanilla now allows the owner to explicitly
select **up to 3 of the 210 pinned upstream core/optional skills** in the
settings panel. Each selected `SKILL.md` is read on demand only for
general-mode chat; it is bounded to 3,500 characters per skill to prevent
overwhelming the model context. The full 210 items remain discoverable through
the search box without downloading or executing them. This is *reference
retrieval*, not proof that OCTUBER neural weights have learned the skills.
Hermes' own layered design similarly lists skill summaries and loads specific
`SKILL.md` documents only as needed.

**Firecrawl scoped search:** Vanilla's Firecrawl panel adds an optional
`POST /v2/search` call restricted to one approved host with
`includeDomains`, `sources: ["web"]` and 3 results max. Full markdown pages
and search-result descriptions are labeled separately; domain-mismatched
results are silently discarded. Search results **do not** automatically
become conversation context. The owner must explicitly click “作為聊天參考”
to select one.

**Model-training evidence export:** In the same panel, after acquiring up to
5 research items, the owner may click “匯出未審核 JSONL 證據”. The browser
computes SHA-256 per item and outputs
`octuber-firecrawl-unreviewed-evidence.jsonl` with `reviewed:false` and
`training_approved:false`. The resulting evidence file is interoperable with
the existing human-approval conversion command:

```bash
python3 training/octuber-knowledge/review.py \
  --evidence private/octuber-evidence/octuber-firecrawl-unreviewed-evidence.jsonl \
  --approvals private/octuber-evidence/approvals.jsonl \
  --output private/octuber-evidence/reviewed-sft.jsonl

python3 training/octuber-sumptuous/train.py \
  --dataset private/octuber-evidence/reviewed-sft.jsonl --validate-only
```

Each approval must have a matching real evidence ID and content hash,
rights basis, reviewer and original Q/A. The exported JSONL alone is **not**
approved for training, and a model checkpoint does not exist until an approved
GPU run produces and validates actual weights.

**Execution boundary:** The GitHub Pages integration calls Firecrawl from
the owner's browser using a temporary user-supplied API key, which may be
blocked by browser CORS and may incur API charges; the owner-operated Python
CLI is the supported fallback. No Firebase, Firecrawl server source code,
Hermes shell commands or third-party MCP executable is installed in Vanilla.
There is no unattended five-hour learning job or bulk website crawling.
