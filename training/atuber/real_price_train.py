"""OCTUBER REAL PRICE learning lab.
Real optimizer updates on externally observed price ranges (never synthetic targets).
Does NOT modify Qwen weights, scrape sites, or publish merchant prices.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
import re
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REAL_FEED = {"licensed-comparison-feed", "government-open-data", "secondary-republication-of-government-prices"}
MIN_REAL_ROWS = 30
FEATURE_BUCKETS = 384


def read_observations(path: Path, *, research_secondary: bool = False):
    if not path.is_file() or path.stat().st_size > 20_000_000:
        raise ValueError("REAL_PRICE_DATASET_UNAVAILABLE_OR_TOO_LARGE")
    seen, rows = set(), []
    with path.open(encoding="utf-8-sig", newline="") as f:
        for line, row in enumerate(csv.DictReader(f), 2):
            required = ("product", "category", "spec", "price_min_twd", "price_max_twd",
                        "observed_date", "source_url", "evidence_class")
            if any(not str(row.get(k, "")).strip() for k in required):
                raise ValueError(f"PRICE_PROVENANCE_REQUIRED_LINE_{line}")
            status = row["evidence_class"]
            if status not in REAL_FEED:
                raise ValueError(f"SYNTHETIC_OR_UNAUTHORIZED_SOURCE_LINE_{line}")
            if status == "secondary-republication-of-government-prices" and not research_secondary:
                raise ValueError("SECONDARY_PRICE_FACTS_REQUIRE_EXPLICIT_RESEARCH_MODE")
            if status == "licensed-comparison-feed" and row.get("training_rights_status") != "authorized":
                raise ValueError("LICENSED_COMPARISON_TRAINING_AUTHORIZATION_REQUIRED")
            if not row["source_url"].startswith("https://"):
                raise ValueError("HTTPS_PRICE_SOURCE_REQUIRED")
            if row.get("currency") != "TWD":
                raise ValueError("ONLY_TWD_PRICE_DATA")
            try:
                low, high = float(row["price_min_twd"]), float(row["price_max_twd"])
                datetime.strptime(row["observed_date"], "%Y-%m-%d")
            except (ValueError, TypeError) as exc:
                raise ValueError(f"INVALID_PRICE_OR_DATE_LINE_{line}") from exc
            if not (0 < low <= high <= 100000000):
                raise ValueError("INVALID_REAL_PRICE_INTERVAL")
            key = (row["product"], row["spec"], row["observed_date"], row["source_url"])
            if key in seen:
                raise ValueError("DUPLICATE_REAL_PRICE_OBSERVATION")
            seen.add(key)
            rows.append({**row, "mid": (low + high) / 2, "low": low, "high": high})
    if len(rows) < MIN_REAL_ROWS:
        raise ValueError("NOT_ENOUGH_DISTINCT_REAL_OBSERVATIONS")
    return rows


def _quantity(raw):
    s = raw.casefold().replace(" ", "")
    m = re.search(r"(\d+(?:\.\d+)?)(kg|g|ml|l|張|抽|入|顆|包|組)", s)
    if not m:
        return 1., "unknown"
    qty = float(m.group(1))
    kind = ("mass" if m.group(2) in ("kg", "g") else
            "volume" if m.group(2) in ("l", "ml") else "count")
    if m.group(2) in ("kg", "l"):
        qty *= 1000
    multi = re.search(r"[*x](\d+)\s*(?:包|盒|支|卷|入|瓶|袋|罐)", s[m.end():])
    if multi:
        qty *= int(multi.group(1))
    return qty, kind


def split_no_name_leakage(rows):
    groups = defaultdict(list)
    for row in rows:
        groups[(row["category"], row["product"].strip().casefold())].append(row)
    train, validation, test = [], [], []
    categories = sorted({row["category"] for row in rows})
    for category in categories:
        names = sorted(
            [name for name in groups if name[0] == category],
            key=lambda pair: hashlib.sha256(("oct-price-v1" + str(pair)).encode()).digest())
        heldout_n = max(1, round(len(names)*.22)) if len(names) > 1 else 0
        rest = names[heldout_n:]
        validation_names = set(rest[:1]) if len(rest) >= 3 else set()
        for name in names:
            (test if name in names[:heldout_n] else
             validation if name in validation_names else train).extend(groups[name])
    group_ids = [{(r["category"], r["product"].casefold()) for r in batch}
                 for batch in (train, validation, test)]
    if group_ids[0]&group_ids[1] or group_ids[0]&group_ids[2] or group_ids[1]&group_ids[2]:
        raise RuntimeError("UNSEEN_PRODUCT_SPLIT_LEAKAGE")
    if min(len(train), len(validation), len(test)) < 3:
        raise ValueError("PRICE_DATA_DIVERSITY_INSUFFICIENT_FOR_EVAL")
    return train, validation, test


def report_error(actual, predicted):
    differences = [abs(a-b) for a,b in zip(actual,predicted)]
    return {
        "mae_twd": round(statistics.mean(differences),2),
        "mape_percent": round(statistics.mean(d/a for d,a in zip(differences,actual))*100,2),
    }


def train_price_model(rows, source_file: Path, output: Path, *, steps: int = 1500):
    # Heavy ML modules only loaded for user-requested real training, never at import.
    import numpy as np
    import torch
    from torch import nn
    if not 20 <= steps <= 10000:
        raise ValueError("PRICE_TRAINING_STEP_LIMIT")
    torch.set_num_threads(1)
    torch.manual_seed(20261025)
    np.random.seed(20261025)
    train, validation, test = split_no_name_leakage(rows)
    categories = sorted({r["category"] for r in train})

    def feature(row):
        feat=np.zeros(FEATURE_BUCKETS+len(categories)+4,dtype=np.float32)
        name=(row["product"]+" "+row["spec"]).casefold()
        ngrams=[name[i:i+2] for i in range(max(1,len(name)-1))]
        for gram in ngrams:
            code=hashlib.blake2s(gram.encode(),digest_size=4).digest()
            feat[int.from_bytes(code,"little")%FEATURE_BUCKETS]+=1
        feat[:FEATURE_BUCKETS]/=max(1,len(ngrams))**.5
        if row["category"] in categories:
            feat[FEATURE_BUCKETS+categories.index(row["category"])]=1
        quantity,kind=_quantity(row["spec"])
        feat[-4]=math.log1p(quantity)/10
        feat[-3:]=[float(kind==x) for x in ("mass","volume","count")]
        return feat
    batch=lambda rows:torch.tensor(np.stack([feature(r) for r in rows]),dtype=torch.float32)
    tx,vx,hx=batch(train),batch(validation),batch(test)
    ty=torch.tensor(np.log([r["mid"] for r in train]),dtype=torch.float32)
    vy=torch.tensor(np.log([r["mid"] for r in validation]),dtype=torch.float32)
    model=nn.Sequential(nn.Linear(tx.shape[1],48),nn.SiLU(),nn.Linear(48,16),
                        nn.SiLU(),nn.Linear(16,1))
    optimizer=torch.optim.AdamW(model.parameters(),lr=.005,weight_decay=.003)
    best, best_loss = None, float("inf")
    for update in range(steps):
        model.train()
        indices=torch.randperm(len(train))[:min(32,len(train))]
        loss=nn.functional.smooth_l1_loss(model(tx[indices]).squeeze(-1),ty[indices])
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        if (update+1)%100==0 or update+1==steps:
            model.eval()
            with torch.no_grad():
                held_val=nn.functional.smooth_l1_loss(model(vx).squeeze(-1),vy).item()
            if held_val<best_loss:
                best_loss=held_val
                best={k:v.detach().clone() for k,v in model.state_dict().items()}
    model.load_state_dict(best)
    model.eval()
    with torch.no_grad():
        pred=np.exp(model(hx).squeeze(-1).numpy()).tolist()
    actual=[r["mid"] for r in test]
    by_category={c:statistics.median([r["mid"] for r in train if r["category"]==c])
                 for c in categories}
    fallback=statistics.median([r["mid"] for r in train])
    baseline=[by_category.get(r["category"],fallback) for r in test]
    neural_err=report_error(actual,pred)
    baseline_err=report_error(actual,baseline)
    # Do not silently overwrite a prior training run or its provenance.
    if output.exists() and any(output.iterdir()):
        raise ValueError("PRICE_TRAINING_OUTPUT_MUST_BE_NEW_AND_EMPTY")
    output.mkdir(parents=True,exist_ok=True)
    weights=output/"price-model.pt"
    torch.save({"state":model.state_dict(),"categories":categories,
                "model_type":"small-real-price-calibrator-NOT-Qwen-LoRA"},weights)
    receipt={
        "task":"exploratory-real-price-neural-calibration",
        "real_observation_count":len(rows),
        "distinct_product_names":len({r["product"] for r in rows}),
        "price_categories":len({r["category"] for r in rows}),
        "training_rows":len(train),"validation_rows":len(validation),"heldout_rows":len(test),
        "optimizer_updates_confirmed":steps,
        "price_model_parameters":sum(t.numel() for t in model.parameters()),
        "published_price_source_dates":sorted({r["observed_date"] for r in rows}),
        "source_urls":sorted({r["source_url"] for r in rows}),
        "dataset_sha256":hashlib.sha256(source_file.read_bytes()).hexdigest(),
        "neural_test_error":neural_err,"category_median_baseline_error":baseline_err,
        "neural_beats_baseline":neural_err["mae_twd"]<baseline_err["mae_twd"],
        "ready_for_price_suggestions":False,
        "price_predictions_are_live_quotes":False,
        "qwen_lora_updates":0,
        "data_usage":"research_only; no real merchant repricing",
        "warning":"Never compare raw retail price with agricultural wholesale price. "
                  "60 public facts cannot establish 10000 distinct verified product prices."
    }
    (output/"price-training-report.json").write_text(
        json.dumps(receipt,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    return receipt


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument("--input",required=True)
    parser.add_argument("--output")
    parser.add_argument("--steps",type=int,default=1500)
    parser.add_argument("--research-secondary",action="store_true",
                        help="Explicitly limit a secondhand government-price republication to research")
    action=parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--validate-only",action="store_true")
    action.add_argument("--train",action="store_true")
    args=parser.parse_args(argv)
    rows=read_observations(Path(args.input),research_secondary=args.research_secondary)
    train,validation,test=split_no_name_leakage(rows)
    if args.validate_only:
        print(json.dumps({"status":"validated-no-training","real_rows":len(rows),
                          "train":len(train),"validation":len(validation),"heldout":len(test)}))
        return 0
    if not args.output:
        parser.error("--output required for real price training")
    result=train_price_model(rows,Path(args.input),Path(args.output),steps=args.steps)
    print(json.dumps(result,ensure_ascii=False))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
