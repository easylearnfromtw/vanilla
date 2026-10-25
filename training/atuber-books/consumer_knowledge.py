#!/usr/bin/env python3
"""Knowledge-to-consumer-advice corpus, not full-book verbatim quotation.

Human-reviewed factual findings with valid original citations feed RAG and,
ONLY if ≥100 unique genuine reviewed licensed examples, existing Qwen SFT.
No metadata or abstract is silently promoted to proven advice. Requires
independent human epistemic review, limitations, and applicable consumer scope.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]/"atuber"
sys.path.insert(0,str(ROOT))
from dataset import validate_jsonl

FIELDS={"id","source_type","source_id","source_title","source_url","authors",
        "evidence_level","rights_basis","rights_reference","reviewer",
        "rights_reviewed","training_approved","evidence_verified",
        "question","knowledge_claim","limits","consumer_answer","evidence_hash"}
RIGHTS={"owned","permission","compatible-license"}
TYPES={"book","paper"}
LEVELS={"reviewed-fulltext","reviewed-finding"}
MAX_ROWS=25_000
MAX_LINE=12_000


def valid_url(value):
    if not isinstance(value,str):return False
    p=urlsplit(value)
    return p.scheme=="https" and bool(p.hostname) and not p.username and not p.password


def read_approved(path:Path):
    if not path.is_file() or path.stat().st_size>120_000_000:
        raise ValueError("REVIEWED_KNOWLEDGE_FILE_UNAVAILABLE")
    items=[]
    ids=set()
    questions=set()
    refusals=Counter()
    for ln,line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(),1):
        if not line.strip():continue
        if len(line)>MAX_LINE:raise ValueError("REVIEWED_KNOWLEDGE_LINE_TOO_LONG")
        if ln>MAX_ROWS:raise ValueError("REVIEWED_KNOWLEDGE_MAX_25000")
        try:item=json.loads(line)
        except json.JSONDecodeError as exc:raise ValueError("REVIEWED_KNOWLEDGE_BAD_JSON_"+str(ln)) from exc
        if not isinstance(item,dict) or set(item)!=FIELDS:
            raise ValueError("EVIDENCE_REVIEW_SCHEMA_MISMATCH_"+str(ln))
        if item["source_type"] not in TYPES or item["evidence_level"] not in LEVELS:
            refusals["no_reviewed_real_content"]+=1;continue
        if item["rights_basis"] not in RIGHTS or not isinstance(item["rights_reference"],str) or len(item["rights_reference"])<12:
            refusals["rights_missing"]+=1;continue
        if any(item[x] is not True for x in ("rights_reviewed","training_approved","evidence_verified")):
            refusals["unreviewed_evidence_or_training_rights"]+=1;continue
        if not valid_url(item["source_url"]):
            refusals["missing_original_url"]+=1;continue
        if not isinstance(item["reviewer"],str) or len(item["reviewer"])<3 or not item["reviewer"].strip():
            refusals["reviewer_missing"]+=1;continue
        if not isinstance(item["authors"],list) or not item["authors"] or not all(isinstance(x,str) and x for x in item["authors"]):
            refusals["original_author_missing"]+=1;continue
        for x in ("id","source_id","source_title","question","knowledge_claim","limits","consumer_answer"):
            if not isinstance(item[x],str) or not 3<=len(item[x].strip())<=2500:
                raise ValueError("REQUIRED_NONEMPTY_REVIEWED_FIELD_"+str(ln))
        if not isinstance(item["evidence_hash"],str) or not re.fullmatch(r"[0-9a-f]{64}",item["evidence_hash"]):
            refusals["evidence_sha_missing"]+=1;continue
        if not re.fullmatch(r"[a-zA-Z0-9_-]{3,80}",item["id"]) or item["id"] in ids:
            raise ValueError("DUPLICATE_OR_INVALID_KNOWLEDGE_ID")
        normalized=" ".join(item["question"].casefold().split())
        if normalized in questions:
            raise ValueError("DUPLICATE_CONSUMER_QUESTION")
        ids.add(item["id"]);questions.add(normalized)
        items.append(item)
    if not items:
        raise ValueError("NO_HUMAN_VERIFIED_RIGHTS_APPROVED_KNOWLEDGE_FINDINGS")
    return items,dict(refusals)


def require_actual_evidence(items, content_index:Path|None):
    """A reviewer flag alone is not a cryptographic proof of the original source."""
    if content_index is None or not content_index.is_file():
        raise ValueError("PRIVATE_RIGHTS_CLEARED_EVIDENCE_DATABASE_REQUIRED")
    conn=sqlite3.connect(content_index.resolve().as_uri()+"?mode=ro",uri=True)
    try:
        for item in items:
            match=conn.execute("""SELECT c.body,b.source_url
              FROM chunks c JOIN books b ON b.id=c.book_id
              WHERE c.book_id=? AND c.body_sha256=? LIMIT 1""",
              (item["source_id"],item["evidence_hash"])).fetchone()
            if match is None or match[1]!=item["source_url"]:
                raise ValueError("FULLTEXT_EVIDENCE_NOT_PROVEN_"+item["id"])
            actual=hashlib.sha256(match[0].encode()).hexdigest()
            if actual!=item["evidence_hash"]:
                raise ValueError("FULLTEXT_EVIDENCE_CONTENT_TAMPERED_"+item["id"])
    finally:
        conn.close()


def to_sft(item):
    origin="《"+item["source_title"]+"》" if item["source_type"]=="book" else item["source_title"]
    author="、".join(item["authors"][:4])
    provider="柳岸書城" if item["source_type"]=="book" else "霞海書院"
    # Output is a concise paraphrase / professional reasoning, NOT a full copied passage.
    expected=(
        item["consumer_answer"].strip()+
        "\n\n**依據與限制**："+
        item["limits"].strip()+
        "\n**引用自"+provider+"（索引）**："+author+"，"+origin+"。"+
        "原始來源："+item["source_url"]
    )
    return {
      "id":item["id"],
      "user":item["question"],
      "assistant":expected,
      "domain":"research",
      "source":"authored",
      "reviewed":True,
      "consent":True,
    }


def produce(source:Path,output:Path,min_rows:int=100,evidence_index:Path|None=None):
    if output.exists() or output.with_suffix(".provenance.json").exists():
        raise ValueError("REFUSE_OVERWRITE_REVIEWED_CONSUMER_DATASET")
    if not 100<=min_rows<=MAX_ROWS:
        raise ValueError("TRAINING_MIN_ROWS_BELOW_AUDIT_GATE")
    items,rejected=read_approved(source)
    if len(items)<min_rows:
        return {"state":"not-ready-for-training","reviewed_findings":len(items),
                "required":min_rows,"refused":rejected,
                "language_model_updates":0,"dataset_saved":False}
    require_actual_evidence(items,evidence_index)
    dataset=[to_sft(x) for x in items]
    target=output.parent
    target.mkdir(parents=True,exist_ok=True)
    data="".join(json.dumps(x,ensure_ascii=False)+"\n" for x in dataset)
    # Validate existing Atuber model's exact privacy/consent/domain schema and holdout split.
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        tmp=Path(d)/"approved.jsonl"
        tmp.write_text(data,encoding="utf-8")
        validate_jsonl(tmp,min_rows=100)
    output.write_text(data,encoding="utf-8")
    provenance={
        "state":"genuinely-reviewed-consumer-knowledge-sft-candidates-not-model-trained",
        "items":len(items),"source_sha256":hashlib.sha256(source.read_bytes()).hexdigest(),
        "output_sha256":hashlib.sha256(data.encode()).hexdigest(),
        "rights_reviewed":True,"source_ids":[x["source_id"] for x in items],
        "source_type_counts":dict(Counter(x["source_type"] for x in items)),
        "refused":rejected,"language_model_updates":0,
        "purpose":"consumer guidance based on conceptual understanding and original citations; no full book quotation",
        "limitation":"human-reviewed labels and real CUDA training are separate steps"
    }
    output.with_suffix(".provenance.json").write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return provenance


def main(argv=None):
    p=argparse.ArgumentParser(description="Real reviewed knowledge -> consumer QA SFT, no invented books or GPU")
    p.add_argument("--reviewed-jsonl",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--approved-fulltext-index",type=Path)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"state":"dry-run","model_updates":0,"review_required":True}))
        return 0
    result=produce(a.reviewed_jsonl,a.output,evidence_index=a.approved_fulltext_index)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if result.get("dataset_saved",True) is not False else 2

if __name__=="__main__":
    raise SystemExit(main())
