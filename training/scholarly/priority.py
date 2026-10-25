"""Vanilla/Atuber scholarly citation weights. Never filter training by prestige."""
from __future__ import annotations
import csv, json, re
from pathlib import Path
from urllib.parse import urlsplit

RANKING = "QS-2027"
ALLOWED_TRAINING_LICENSES = frozenset(("cc-by", "cc0", "public-domain"))
CATEGORIES = frozenset(("industry_leader", "authoritative_expert", "established_theory"))

def rank_weight(rank):
    if isinstance(rank, bool) or not str(rank or "").strip().isdigit(): return 1
    n = int(str(rank))
    return 5 if 1 <= n <= 100 else 4 if n <= 300 else 3 if n <= 500 else 2 if n <= 700 else 1

def ror_key(value):
    v = str(value or "").lower().strip().rstrip("/").removeprefix("https://ror.org/")
    return "ror:" + v if re.fullmatch(r"0[a-z0-9]{8}", v) else ""

def openalex_key(value):
    match = re.search(r"(?:^|/)(I\d+)$", str(value or "").strip(), re.I)
    return "openalex:" + match[1].upper() if match else ""

def normalize_id(value):
    v = str(value or "").lower().strip()
    for base, prefix in (("https://doi.org/", "doi:"), ("https://arxiv.org/abs/", "arxiv:"),
                         ("http://arxiv.org/abs/", "arxiv:"), ("https://openalex.org/", "openalex:"),
                         ("https://orcid.org/", "orcid:")):
        if v.startswith(base):
            v = prefix + v[len(base):]
            break
    if v.startswith("10."): v = "doi:" + v
    if v.startswith("arxiv:"): v = re.sub(r"v\d+$", "", v)
    if re.fullmatch(r"(?:doi:10\.\d{4,9}/\S+|arxiv:(?:\d{4}\.\d{4,5}|[a-z.\-]+/\d{7})|openalex:w\d+|orcid:\d{4}-\d{4}-\d{4}-[\dx]{4})", v): return v
    return ""

def load_rankings(path: Path) -> dict:
    ranks = {}
    with Path(path).open(encoding="utf-8-sig", newline="") as file:
        for line, row in enumerate(csv.DictReader(file), 2):
            rank = str(row.get("rank") or "").strip()
            if not rank.isdecimal() or not 1 <= int(rank) <= 100000:
                raise ValueError(f"INVALID_EXACT_RANK_LINE_{line}")
            keys = [x for x in (ror_key(row.get("ror")), openalex_key(row.get("openalex_id"))) if x]
            if not keys: raise ValueError(f"RANKING_IDENTIFIER_REQUIRED_LINE_{line}")
            for key in keys:
                if key in ranks and ranks[key] != int(rank):
                    raise ValueError(f"CONFLICTING_INSTITUTION_RANK_LINE_{line}")
                ranks[key] = int(rank)
    if not ranks: raise ValueError("EMPTY_RANKINGS")
    return ranks

def load_authorities(path: Path | None) -> dict:
    result = {}
    if path is None: return result
    for n, raw in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip(): continue
        item = json.loads(raw)
        key = normalize_id(item.get("match_id"))
        url = str(item.get("evidence_url") or "")
        if (not key or item.get("verified") is not True or
            item.get("category") not in CATEGORIES or not str(item.get("reviewer") or "").strip()
            or not url.startswith("https://") or not urlsplit(url).hostname):
            raise ValueError(f"UNVERIFIED_AUTHORITY_LINE_{n}")
        result[key] = item
    return result

def citation_priority(paper: dict, rankings: dict, authorities: dict | None = None) -> dict:
    universities, nonuniversities, unknown = [], 0, 0
    for inst in paper.get("institutions", []):
        if not isinstance(inst, dict): continue
        rank = next((rankings[k] for k in (ror_key(inst.get("ror")), openalex_key(inst.get("openalex_id") or inst.get("id"))) if k in rankings), None)
        typ = str(inst.get("type") or "").lower()
        if rank is not None or typ in ("education", "university"):
            universities.append((rank_weight(rank), rank, inst.get("display_name") or ""))
        elif typ in ("company", "nonprofit", "government", "facility", "healthcare", "industry"):
            nonuniversities += 1
        else: unknown += 1
    if universities:
        weight, rank, name = max(universities, key=lambda x: x[0])
        return {"citation_weight": weight, "citation_basis": "university-ranking" if rank else "unranked-university",
                "university_rank": rank, "ranking_system": RANKING if rank else None, "attributed_university": name}
    if nonuniversities and not unknown:
        identifiers = [paper.get(k) for k in ("doi", "arxiv_id", "openalex_id")] + (paper.get("author_orcids") or [])
        for ident in identifiers:
            key = normalize_id(ident)
            if key and key in (authorities or {}):
                return {"citation_weight": 5, "citation_basis": "verified-nonuniversity-authority",
                        "authority": authorities[key]}
        return {"citation_weight": 1, "citation_basis": "nonuniversity-default"}
    return {"citation_weight": 1, "citation_basis": "affiliation-unverified"}

def training_rights(paper: dict) -> dict:
    lic = str(paper.get("license") or "").strip().lower()
    ok = (lic in ALLOWED_TRAINING_LICENSES and paper.get("rights_verified") is True and
          bool(str(paper.get("rights_reference") or "").strip()) and
          bool(str(paper.get("rights_reviewer") or "").strip()) and
          str(paper.get("fulltext_source_url") or "").startswith("https://") and
          bool(str(paper.get("fulltext") or "").strip()))
    return {"index_eligible": True, "fulltext_training_eligible": bool(ok),
            "training_hold_reason": None if ok else "missing-licensed-reviewed-fulltext"}

def order_citations(rows: list[dict], threshold: float = .5) -> list[dict]:
    rows = [r for r in rows if r.get("retracted") is not True and r.get("evidence_valid") is not False
            and float(r.get("relevance") or 0) >= threshold]
    return sorted(rows, key=lambda r: (-int(r.get("evidence_grade") or 0),
                                      -int(r.get("citation_weight") or 1), -float(r.get("relevance") or 0),
                                      -int(r.get("publication_year") or 0)))
