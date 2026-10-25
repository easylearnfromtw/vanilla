# Vanilla × 阿土伯 — OpenAlex / arXiv citation policy

Implementation v1 (2026-10-25). **This is data preparation, not completed GPU/LLM training or a production RAG API.**

## Weight = citation priority ONLY

Use verified QS World University Rankings 2027, published June 18 2026, as the initial ranking edition. Supply an authorized ranking CSV; this repository does not scrape, copy or bundle the QS proprietary dataset.

| Confirmed university rank | Citation weight |
|---|---:|
| 1–100 | **5** |
| 101–300 | **4** |
| 301–500 | **3** |
| 501–700 | **2** |
| 701+ / unranked / unknown | **1** |

The best verified institutional tier wins for multi-university collaborations; missing institutional ID or ranking intervals never produce guessed ranks. OpenAlex ROR and institution IDs are used (no name guesses). arXiv papers with unknown affiliation remain unknown until verified via OpenAlex or human review.

For non-university-produced papers, verified recognized industry leaders, authoritative experts or influential theories may receive weight 5 only when a reviewer records an exact DOI, arXiv ID, OpenAlex Work ID or ORCID match with an evidence URL. All other non-university papers are weight 1. Absence of affiliation does not prove non-university origin.

**Every paper remains in the retrieval metadata index regardless of weight.** Weight is a citation-order preference, not a training-data filter, training loss multiplier or guarantee of scientific truth. Evidence validity and relevance prevail over institutional prestige. Retracted work must never be promoted.

## Implementation

- Python metadata source adapters and licensed corpus export: training/scholarly/prepare.py
- Python priority policy: training/scholarly/priority.py
- Browser-side reusable pure ranking module: src/search/scholarly-priority.ts
- Browser OpenAlex discovery, citation ordering, CSV / audited exception import: src/search/scholarly-discovery.ts
- Academic queries hook into src/search/live-search.ts; owners can import rankings and reviewed exceptions from the Search Settings panel
- Node unit tests: tests/scholarly-priority.test.mjs

### Ranking CSV: owner-supplied

private/qs2027_rankings.csv:

~~~csv
ror,openalex_id,rank
https://ror.org/012345678,https://openalex.org/I123456789,100
~~~

The identifiers above are examples, not actual QS ranking data. Load genuine data with verified ROR and/or OpenAlex IDs. Unknown institutions default to weight 1.

### Optional independently audited non-university exceptions

private/scholarly_authorities.jsonl:

~~~json
{"match_id":"doi:10.1234/example","category":"established_theory","evidence_url":"https://example.org/audited-evidence","reviewer":"Authorized reviewer","verified":true}
~~~

Allowed categories: industry_leader, authoritative_expert, established_theory. No author-name matching.

### Optional audited fulltext

private/scholarly_fulltext.jsonl:

~~~json
{"match_id":"doi:10.1234/example","fulltext":"Actual licensed source text...","license":"cc-by","fulltext_source_url":"https://example.org/document","rights_reference":"https://example.org/license","rights_reviewer":"Authorized reviewer","rights_verified":true}
~~~

Only genuinely supplied full texts with verified compatible licenses enter training candidates, **whether citation weight 1 or 5**. Conservative automatic training allowlist: cc-by, cc0, public-domain. NC/ND/SA and the arXiv non-exclusive distribution license need separate review; open access alone does not grant model-training rights.

## Commands

~~~sh
# Dry run — no network and no file writes
python3 training/scholarly/prepare.py \
  --rankings-csv private/qs2027_rankings.csv \
  --openalex-query "economics" --arxiv-query "economics" \
  --output-prefix private/scholarly/pilot

# Explicit bounded API metadata harvest (<=100 results per source)
OPENALEX_API_KEY=... python3 training/scholarly/prepare.py \
  --rankings-csv private/qs2027_rankings.csv \
  --authorities private/scholarly_authorities.jsonl \
  --openalex-query "economics" --arxiv-query "economics" \
  --fulltext-manifest private/scholarly_fulltext.jsonl \
  --max-results 50 --output-prefix private/scholarly/pilot --execute

# Offline OpenAlex JSON/arXiv Atom XML files
python3 training/scholarly/prepare.py \
  --rankings-csv private/qs2027_rankings.csv \
  --openalex-json private/openalex.json --arxiv-xml private/arxiv.atom \
  --output-prefix private/scholarly/offline --execute

node --experimental-strip-types --test tests/scholarly-priority.test.mjs
~~~

The outputs are: .index.jsonl with **every** indexed paper and citation weight; .training-candidates.jsonl with **all rights-reviewed compatible full texts regardless of weight**; .report.json with actual counts and model_weight_updates = 0. Paper text, ranking datasets and API keys must not be committed to the public repository.

The CLI is a limited pilot, not a million-paper harvester. For 100K–10M papers, deploy a permitted server-side cursor/OAI-PMH sync, database/object storage, deduplication, licensing review, retry/resume and GPU training separately. arXiv HTTPS availability depends on network and endpoint; do not fall back to plain HTTP.

**Now implemented on the feature branch:** academically scoped live OpenAlex metadata lookup through Vanilla's existing search route, arXiv location detection as preprint status, locally stored operator CSV rankings and reviewed non-university authority JSONL. These are metadata citations; none imply that the PDF was obtained or read. The branch must pass CI and merge to go live.

**Not yet performed:** importing a complete licensed QS ranking table, mass fulltext retrieval, a production fulltext/vector RAG backend, scheduled sync, direct arXiv Atom lookup from the static browser (CORS), or 0.6B / 4B / 14B / 30B GPU fine-tuning.

Sources: https://help.openalex.org/data/works/ ; https://help.openalex.org/data/locations/ ; https://info.arxiv.org/help/bulk_data.html ; https://info.arxiv.org/help/license/index.html ; https://www.topuniversities.com/world-university-rankings
