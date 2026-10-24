#!/usr/bin/env python3
"""OCTUBER: Licensed UCI Online Retail II bulk *historical* price-learning pilot.

UCI source: https://archive.ics.uci.edu/dataset/502/online+retail+ii
DOI: 10.24432/C5CG6D  License: CC BY 4.0 (credit Daqing Chen).
Not current Taiwan pricing or BigGo/Feebee/LBJ quotations.

Never invent data, multiply duplicate rows to meet a target, publish customer IDs,
or treat wholesale GBP historical unit prices as TWD retail live prices.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import re
import statistics
import tempfile
import zipfile
import zlib
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

SOURCE_URL = "https://archive.ics.uci.edu/dataset/502/online+retail+ii"
DOI = "10.24432/C5CG6D"
DATA_LICENSE = "CC BY 4.0"
EXCLUDED_CODES = {
    "POST", "DOT", "M", "D", "BANK CHARGES", "AMAZONFEE", "CRUK",
    "C2", "PADS", "S", "B", "ADJUST", "ADJUST2", "TEST001", "TEST002",
}
FIELDS = ["stock_code", "description", "unit_price_gbp", "quantity", "date", "country"]
MINI_QUALITY_TARGET = 1_000_000


def _text(x):
    return "".join(t.text or "" for t in x.iter() if t.tag.rsplit("}", 1)[-1] == "t")


def _shared_strings(book):
    result = []
    if "xl/sharedStrings.xml" not in book.namelist():
        return result
    with book.open("xl/sharedStrings.xml") as stream:
        for event, element in ET.iterparse(stream, events=("end",)):
            if element.tag.rsplit("}", 1)[-1] == "si":
                result.append(_text(element))
                element.clear()
    return result


def _sheet_rows(book, sheet, strings):
    with book.open(sheet) as stream:
        context = ET.iterparse(stream, events=("start", "end"))
        _, root = next(context)
        for event, element in context:
            if event != "end" or element.tag.rsplit("}", 1)[-1] != "row":
                continue
            row = {}
            for cell in element:
                if cell.tag.rsplit("}", 1)[-1] != "c":
                    continue
                ref = cell.get("r", "")
                m = re.match(r"([A-Z]+)", ref)
                if not m:
                    continue
                index = 0
                for letter in m.group(1):
                    index = index * 26 + ord(letter) - 64
                index -= 1
                raw = next((z.text for z in cell
                            if z.tag.rsplit("}", 1)[-1] == "v"), None)
                typ = cell.get("t")
                if typ == "s" and raw is not None:
                    raw = strings[int(raw)]
                elif typ == "inlineStr":
                    raw = _text(cell)
                row[index] = raw
            yield row
            element.clear()
            root.clear()


def _workbook(stream):
    """Use the raw OOXML streaming format, not a 1M-row in-memory workbook."""
    raw = stream.read()
    try:
        first = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise ValueError("INVALID_OFFICIAL_DATA_ARCHIVE") from exc
    nested = [name for name in first.namelist() if name.lower().endswith(".xlsx")]
    if nested:
        if len(nested) != 1:
            raise ValueError("AMBIGUOUS_WORKBOOK_IN_ARCHIVE")
        second = zipfile.ZipFile(io.BytesIO(first.read(nested[0])))
        first.close()
        return second
    return first


def _field(row, header, *names):
    for name in names:
        key = re.sub(r"[\s_-]", "", name.casefold())
        if key in header:
            return row.get(header[key])
    return None


def _date(raw):
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return (datetime(1899, 12, 30) + timedelta(days=float(raw))).date().isoformat()
    except (ValueError, OverflowError):
        try:
            return datetime.fromisoformat(str(raw)).date().isoformat()
        except ValueError:
            return None


def _partition(sku):
    # Split entirely by stock code, not by transaction row; prevents SKU memorization leakage.
    bucket = int.from_bytes(hashlib.blake2s(
        ("octuber-price-v2-" + sku).encode(), digest_size=4).digest(), "big") % 100
    return "test" if bucket < 5 else "validation" if bucket < 10 else "train"


def extract(source: Path, output: Path, max_source_rows: int = 0):
    if not source.is_file() or source.stat().st_size > 160_000_000:
        raise ValueError("SOURCE_FILE_MISSING_OR_TOO_LARGE")
    if output.exists() and any(output.iterdir()):
        raise ValueError("REFUSE_OVERWRITE_PAST_REAL_PRICE_RESULT")
    output.mkdir(parents=True, exist_ok=True)
    skipped = Counter()
    counts = Counter()
    sku_sets = defaultdict(set)
    seen = set()
    date_min, date_max = None, None
    inp_digest = hashlib.sha256(source.read_bytes()).hexdigest()
    paths = {part: output / (part + ".csv") for part in ("train", "validation", "test")}
    handles = {p: path.open("w", encoding="utf-8", newline="") for p, path in paths.items()}
    writers = {p: csv.DictWriter(handles[p], fieldnames=FIELDS) for p in paths}
    for writer in writers.values():
        writer.writeheader()
    try:
        with source.open("rb") as inp, _workbook(inp) as book:
            sheet_names = sorted(
                (name for name in book.namelist()
                 if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)),
                key=lambda n: int(re.search(r"sheet(\d+)", n).group(1))
            )
            if len(sheet_names) < 2:
                raise ValueError("EXPECTED_TWO_UCI_YEAR_SHEETS")
            strings = _shared_strings(book)
            stop = False
            for name in sheet_names:
                header = {}
                for excel_row in _sheet_rows(book, name, strings):
                    if not header:
                        header = {re.sub(r"[\s_-]", "", str(v or "").casefold()):k
                                  for k, v in excel_row.items()}
                        if not any(k in header for k in ("unitprice", "price")):
                            raise ValueError("OFFICIAL_PRICE_COLUMN_MISSING")
                        continue
                    counts["source_rows"] += 1
                    if max_source_rows and counts["source_rows"] > max_source_rows:
                        stop = True
                        break
                    sku = str(_field(excel_row, header, "StockCode") or "").strip()
                    desc = str(_field(excel_row, header, "Description") or "").strip()
                    invoice = str(_field(excel_row, header, "InvoiceNo", "Invoice") or "").strip()
                    day = _date(_field(excel_row, header, "InvoiceDate"))
                    country = str(_field(excel_row, header, "Country") or "").strip()
                    try:
                        qty = float(_field(excel_row, header, "Quantity") or "")
                        price = float(_field(excel_row, header, "UnitPrice", "Price") or "")
                    except ValueError:
                        skipped["bad_numeric"] += 1
                        continue
                    if not day or not sku or len(desc) < 2:
                        skipped["missing_identity_or_date"] += 1
                        continue
                    if invoice.upper().startswith("C") or qty <= 0:
                        skipped["cancel_or_return"] += 1
                        continue
                    if not (math.isfinite(price) and 0 < price <= 100000):
                        skipped["invalid_price"] += 1
                        continue
                    if sku.upper() in EXCLUDED_CODES or re.search(
                        r"\b(?:POSTAGE|CARRIAGE|BANK CHARGES|ADJUSTMENT|MANUAL)\b",
                        desc.upper()
                    ):
                        skipped["non_product"] += 1
                        continue
                    # Count exact *source-line* duplicates only; distinct invoices remain.
                    dedup_key = "\x1f".join(
                        (invoice, sku, desc, str(qty), str(price), day, country)
                    )
                    key = hashlib.blake2b(dedup_key.encode(), digest_size=12).digest()
                    if key in seen:
                        skipped["identical_transaction_line"] += 1
                        continue
                    seen.add(key)
                    part = _partition(sku)
                    writers[part].writerow(dict(stock_code=sku, description=desc,
                        unit_price_gbp=round(price, 4), quantity=qty,
                        date=day, country=country))
                    sku_sets[part].add(sku)
                    counts["valid_rows"] += 1
                    counts[part + "_rows"] += 1
                    date_min = min(date_min, day) if date_min else day
                    date_max = max(date_max, day) if date_max else day
                if stop:
                    break
    finally:
        for handle in handles.values():
            handle.close()
    assert not (sku_sets["train"] & sku_sets["validation"]
                or sku_sets["train"] & sku_sets["test"]
                or sku_sets["validation"] & sku_sets["test"]), "SKU_PARTITION_LEAKAGE"
    report = {
        "status": "historical-source-audited-not-a-current-quote",
        "source": SOURCE_URL,
        "doi": DOI,
        "author": "Daqing Chen",
        "license": DATA_LICENSE,
        "original_price_currency": "GBP",
        "historical_retail_market": "UK non-store giftware; some wholesale customers",
        "observed_start": date_min, "observed_end": date_max,
        "source_sha256": inp_digest,
        "raw_dataset_transactions_publisher_count": 1_067_371,
        "actual_processed_rows": counts["source_rows"] - int(bool(max_source_rows and stop)),
        "accepted_valid_unique_price_rows": counts["valid_rows"],
        "partition_rows": {p: counts[p + "_rows"] for p in ("train", "validation", "test")},
        "unique_skus_by_partition": {p: len(sku_sets[p]) for p in sku_sets},
        "rejected_reason_counts": dict(skipped),
        "million_valid_observations_reached": counts["valid_rows"] >= MINI_QUALITY_TARGET,
        "million_training_rows_reached": counts["train_rows"] >= MINI_QUALITY_TARGET,
        "distinct_product_names_not_guaranteed": True,
        "taiwan_market_prices": 0,
        "biggo_feebee_lbj_feed_rows": 0,
        "not_a_twd_pricing_model": True,
        "customers_or_invoice_ids_exported": False,
    }
    (output / "ingestion-summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    return report


def _category(name: str):
    """Loose analytical buckets; NOT authoritative marketplace categories."""
    n = name.upper()
    vocabulary = {
        "Christmas/seasonal": ("CHRISTMAS", "XMAS", "SNOWMAN", "SANTA"),
        "Containers": ("BOTTLE", "BOX", "JAR", "BASKET", "TIN"),
        "Housewares": ("MUG", "PLATE", "BOWL", "COASTER", "TEAPOT"),
        "Decor": ("CANDLE", "SIGN", "FRAME", "HANGING", "DECORATION"),
        "Textiles": ("BAG", "CUSHION", "TOWEL", "APRON", "SCARF"),
        "Stationery": ("NOTEBOOK", "PENCIL", "PEN ", "CARD", "STICKER"),
        "Jewelry": ("BRACELET", "NECKLACE", "EARRING", "RING"),
        "Lighting": ("LAMP", "LIGHT", "LANTERN"),
        "Toys": ("TOY", "DOLL", "GAME", "PUZZLE"),
    }
    return next((cat for cat, needles in vocabulary.items()
                 if any(ned in n for ned in needles)), "Unclassified")


def _features(description, quantity):
    import numpy as np
    x = np.zeros(131, dtype=np.float32)
    text = description.casefold()[:180]
    grams = [text[i:i+2] for i in range(max(1,len(text)-1))]
    for gram in grams:
        x[zlib.crc32(gram.encode())%128] += 1.0
    x[:128] /= max(1, len(grams))**0.5
    x[128] = min(1, len(text)/100)
    x[129] = math.log1p(max(0,min(100000,quantity)))/12
    x[130] = 1.0
    return x


def _load_csv(path, maximum=1_000_000):
    # Never upsample or count the same transaction multiple times.
    data=[]
    with path.open(encoding="utf-8",newline="") as f:
        for row in csv.DictReader(f):
            if len(data)>=maximum:
                break
            data.append((row["description"],float(row["quantity"]),
                         float(row["unit_price_gbp"])))
    return data


def train_network(output, *, epochs=1, batch_size=2048, max_train=1_000_000):
    import numpy as np
    if not 1 <= epochs <= 3 or not 128 <= batch_size <= 8192:
        raise ValueError("UNSAFE_COMPUTE_SETTINGS")
    training = _load_csv(output/"train.csv", max_train)
    validation = _load_csv(output/"validation.csv", 120_000)
    test = _load_csv(output/"test.csv", 120_000)
    if min(len(training),len(validation),len(test))<100:
        raise ValueError("INSUFFICIENT_REAL_TRAIN_EVAL_ROWS")
    tx = np.stack([_features(desc,qty) for desc,qty,_ in training])
    vy = np.stack([_features(desc,qty) for desc,qty,_ in validation])
    hx = np.stack([_features(desc,qty) for desc,qty,_ in test])
    ty = np.log(np.array([val for _,_,val in training],dtype=np.float32))
    true = np.array([val for _,_,val in test],dtype=np.float32)
    val_y = np.log(np.array([v for _,_,v in validation],dtype=np.float32))
    rng = np.random.default_rng(20261025)
    w1=rng.normal(0,.08,(131,24)).astype(np.float32)
    b1=np.zeros(24,dtype=np.float32)
    w2=rng.normal(0,.05,(24,1)).astype(np.float32)
    b2=np.array([np.median(ty)],dtype=np.float32)
    params=[w1,b1,w2,b2]
    moments_m=[np.zeros_like(p) for p in params]
    moments_v=[np.zeros_like(p) for p in params]
    best,best_mae=None,float("inf")
    step=0
    for epoch in range(epochs):
        indices=rng.permutation(len(training))
        for start in range(0,len(indices),batch_size):
            batch=indices[start:start+batch_size]
            x=tx[batch]; yy=ty[batch].reshape((-1,1))
            h=np.tanh(x@w1+b1)
            pred=h@w2+b2
            error=pred-yy
            # Robust Huber derivative in log-price space.
            grad=np.where(np.abs(error)<=1,error,np.sign(error))/len(batch)
            dw2=h.T@grad
            db2=grad.sum(axis=0)
            dh=(grad@w2.T)*(1-h*h)
            dw1=x.T@dh
            db1=dh.sum(axis=0)
            step+=1
            lr=.006
            for i,(p,g) in enumerate(zip(params,(dw1,db1,dw2,db2))):
                moments_m[i][:]=.9*moments_m[i]+.1*g
                moments_v[i][:]=.999*moments_v[i]+.001*(g*g)
                p[:]-=lr*(moments_m[i]/(1-.9**step)) / (
                    np.sqrt(moments_v[i]/(1-.999**step))+1e-8)
        pred_v=np.exp((np.tanh(vy@w1+b1)@w2+b2).ravel())
        mae=float(np.mean(np.abs(pred_v-np.exp(val_y))))
        if mae<best_mae:
            best_mae=mae;best=[p.copy() for p in params]
    w1,b1,w2,b2=best
    estimate=np.exp((np.tanh(hx@w1+b1)@w2+b2).ravel())
    by_cat=defaultdict(list)
    for desc,_,price in training:
        by_cat[_category(desc)].append(price)
    medians={cat:statistics.median(vals) for cat,vals in by_cat.items()}
    global_median=statistics.median([price for _,_,price in training])
    baseline=np.array([medians.get(_category(desc),global_median) for desc,_,_ in test])
    neural_mae=float(np.mean(np.abs(estimate-true)))
    median_mae=float(np.mean(np.abs(baseline-true)))
    payload={
      "source":SOURCE_URL,"doi":DOI,"license":DATA_LICENSE,
      "model":"historical-GBP-price-learning-neural-policy-NOT-QWEN",
      "training_records_actually_used":len(training),
      "model_optimizer_updates":step,
      "validation_rows":len(validation),"heldout_unseen_sku_rows":len(test),
      "neural_test_mae_gbp":round(neural_mae,4),
      "heuristic_category_median_baseline_mae_gbp":round(median_mae,4),
      "neural_beats_baseline":neural_mae < median_mae,
      "suitable_for_2026_taiwan_retail_quote":False,
      "suitable_for_automatic_merchant_repricing":False,
      "real_qwen_lora_steps":0,
      "data_era":"2009-2011",
      "trained_model_weight_count":sum(p.size for p in params),
    }
    model_path=output/"model-uk-historical-prices.npz"
    if model_path.exists():
        raise ValueError("REFUSE_OVERWRITE_REAL_MODEL")
    np.savez_compressed(model_path,w1=w1,b1=b1,w2=w2,b2=b2)
    payload["model_sha256"]=hashlib.sha256(model_path.read_bytes()).hexdigest()
    (output/"training-report.json").write_text(
        json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return payload


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument("--dataset",type=Path,required=True,
                        help="User-provided official licensed 43.5MB UCI zip or XLSX")
    parser.add_argument("--out",type=Path,required=True)
    parser.add_argument("--max-source-rows",type=int,default=0,
                        help="Development cap only; if >0 the run is NOT a million-row result")
    parser.add_argument("--train-neural",action="store_true")
    parser.add_argument("--epochs",type=int,default=1)
    args=parser.parse_args(argv)
    if args.max_source_rows < 0:
        parser.error("negative row cap")
    receipt=extract(args.dataset,args.out,args.max_source_rows)
    print("OCTUBER_REAL_PRICE_INGEST",json.dumps(receipt,ensure_ascii=False))
    if args.train_neural:
        trained=train_network(args.out,epochs=args.epochs)
        print("OCTUBER_REAL_PRICE_NEURAL",json.dumps(trained,ensure_ascii=False))


if __name__=="__main__":
    main()
