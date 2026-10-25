#!/usr/bin/env python3
"""OCTUBER 30-year market evidence pipeline. Python stdlib, offline, NO training.

Input: a separate, rights-attested historical closing-price CSV per exchange,
optional reviewed event/news metadata (not article bodies), and item-by-item
human approvals. Output: chronologically isolated SFT JSONL + provenance.
NEVER retrieves websites, invents prices, auto-approves samples or runs a GPU.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import defaultdict
from datetime import date, datetime, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / "markets.json"
START, END = date(1996, 10, 25), date(2026, 10, 25)
TRAIN_END, EVAL_END = date(2021, 12, 31), date(2024, 12, 31)
RIGHTS = {"owned", "permission", "compatible-license", "public-domain"}
CAUSALITY = {"documented", "supported", "hypothesis", "unknown"}

def fail(message):
    raise ValueError(message)

def canon(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")

def digest(value):
    return hashlib.sha256(canon(value)).hexdigest()

def file_sha(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def iso_day(value):
    parsed = date.fromisoformat(value)
    if not START <= parsed <= END:
        fail("DATE_OUT_OF_RESEARCH_PERIOD")
    return parsed

def read_catalog():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    markets = data["markets"]
    if len(markets) != 20 or sorted(m["rank"] for m in markets) != list(range(1, 21)):
        fail("INVALID_WFE_TOP20_CATALOG")
    return data, {m["id"]: m for m in markets}

def read_jsonl(path, *, max_bytes=24_000_000):
    src = Path(path)
    if not src.is_file() or src.stat().st_size > max_bytes:
        fail("MISSING_OR_OVERSIZED_JSONL")
    for line_no, line in enumerate(src.read_text(encoding="utf-8-sig").splitlines(), 1):
        if line.strip():
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"BAD_JSONL_LINE_{line_no}") from exc
            if not isinstance(item, dict):
                fail(f"NON_OBJECT_JSONL_LINE_{line_no}")
            yield item

def write_new(path, rows):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("x", encoding="utf-8") as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")

def rights_check(obj):
    if (not isinstance(obj, dict) or obj.get("rights_basis") not in RIGHTS
        or not isinstance(obj.get("rights_reference"), str)
        or len(obj["rights_reference"].strip()) < 8
        or obj.get("approved_for_training") is not True):
        fail("RIGHTS_ATTESTATION_REQUIRED")
    if not isinstance(obj.get("provider"), str) or not obj["provider"].strip():
        fail("PROVIDER_REQUIRED")

def load_prices(folder, rights_path, *, allow_partial=False):
    _, markets = read_catalog()
    rights = json.loads(Path(rights_path).read_text(encoding="utf-8"))
    if set(rights) - set(markets):
        fail("UNKNOWN_MARKET_IN_RIGHTS_MANIFEST")
    output, provenance = {}, {}
    for market_id in markets:
        source = Path(folder) / f"{market_id}.csv"
        if not source.is_file():
            if allow_partial:
                continue
            fail(f"MISSING_PRICE_CSV:{market_id}")
        if source.stat().st_size > 3_000_000:
            fail(f"OVERSIZED_PRICE_CSV:{market_id}")
        meta = rights.get(market_id)
        rights_check(meta)
        if meta.get("price_type") not in {"price_index", "total_return_index"}:
            fail(f"UNDECLARED_INDEX_TYPE:{market_id}")
        rows, seen = [], set()
        with source.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            if not reader.fieldnames or not {"date", "close"} <= set(reader.fieldnames):
                fail(f"BAD_PRICE_HEADERS:{market_id}")
            for item in reader:
                day = iso_day(item["date"])
                if day in seen:
                    fail(f"DUPLICATE_MARKET_DATE:{market_id}:{day}")
                seen.add(day)
                price = float(item["close"])
                if not math.isfinite(price) or price <= 0:
                    fail(f"BAD_INDEX_CLOSE:{market_id}:{day}")
                rows.append((day, price))
        rows.sort()
        if len(rows) < 2:
            fail(f"INSUFFICIENT_PRICE_OBSERVATIONS:{market_id}")
        # Split/adjustment/total-return definitions are provided by the vendor,
        # not silently inferred from daily prices.
        output[market_id] = rows
        provenance[market_id] = {
            "file_sha256": file_sha(source), "rows": len(rows),
            "first": str(rows[0][0]), "last": str(rows[-1][0]),
            "provider": meta["provider"], "price_type": meta["price_type"],
            "rights_basis": meta["rights_basis"],
            "rights_reference": meta["rights_reference"],
        }
    return output, provenance

def load_events(path, markets):
    if not path:
        return []
    events, seen = [], set()
    for record in read_jsonl(path):
        required = {"id", "published_at", "title", "summary", "source_name",
                    "source_url", "causal_status", "market_ids", "rights_basis",
                    "rights_reference", "reviewed"}
        if not required <= set(record):
            fail("INVALID_EVENT_SCHEMA")
        eid = record["id"]
        if not isinstance(eid, str) or not eid.replace("_", "").replace("-", "").isalnum() or eid in seen:
            fail("DUPLICATE_OR_INVALID_EVENT_ID")
        seen.add(eid)
        stamp = datetime.fromisoformat(record["published_at"].replace("Z", "+00:00"))
        if stamp.tzinfo is None or stamp.utcoffset() is None:
            fail("EVENT_PUBLICATION_NEEDS_TIMEZONE")
        if not START <= stamp.date() <= END:
            fail("EVENT_OUT_OF_RESEARCH_PERIOD")
        if (record["causal_status"] not in CAUSALITY
            or record["rights_basis"] not in RIGHTS
            or len(str(record["rights_reference"]).strip()) < 8
            or record["reviewed"] is not True
            or not str(record["source_url"]).startswith("https://")
            or len(record["title"]) > 180 or len(record["summary"]) > 550
            or not record["market_ids"] or not set(record["market_ids"]) <= set(markets)):
            fail("UNREVIEWED_OR_INVALID_EVENT")
        record["_utc"] = stamp.astimezone(timezone.utc)
        events.append(record)
    return events

def split_for(day):
    if day <= TRAIN_END:
        return "train"
    if day <= EVAL_END:
        return "eval"
    return "test"

def returns(prices):
    output = []
    for idx, (day, close) in enumerate(prices):
        previous = prices[idx-1][1] if idx else None
        ret = 100 * (close / previous - 1) if previous else None
        trailing = [100 * (prices[j][1] / prices[j-1][1] - 1)
                    for j in range(max(1, idx-19), idx+1)]
        vol = statistics.stdev(trailing) * math.sqrt(252) if len(trailing) >= 10 else None
        peak = max(value for _, value in prices[max(0, idx-251):idx+1])
        drawdown = 100 * (close / peak - 1)
        output.append({"date": day, "close": close, "ret": ret, "vol20": vol, "drawdown": drawdown})
    return output

def fmt(num, digits=2):
    return "資料不足" if num is None else f"{num:+.{digits}f}%"

def candidate(item_id, day, market_id, user, assistant, evidence):
    out = {"id": item_id, "user": user, "assistant": assistant,
           "domain": "research", "source": "authored", "reviewed": False,
           "consent": False, "market_id": market_id, "as_of": str(day),
           "split": split_for(day), "evidence": evidence}
    out["candidate_sha256"] = digest({k: v for k, v in out.items() if k != "candidate_sha256"})
    return out

def monthly_samples(market, records, provenance):
    month_ends = {}
    for rec in records:
        month_ends[(rec["date"].year, rec["date"].month)] = rec
    results = []
    for rec in month_ends.values():
        if rec["ret"] is None:
            continue
        day = rec["date"]
        user = (f"截至 {day} 收盤，分析 {market['exchange']} 的"
                f"{market['representative_index']}；只根據當時已知行情判讀風險，不預測未來股價。")
        answer = (f"截至 {day}，指數收盤 {rec['close']:.4f}（原始指數點數）。"
                  f"相較前一個交易日報酬 {fmt(rec['ret'])}；"
                  f"過去約20交易日年化波動率 {fmt(rec['vol20'])}；"
                  f"相對近252筆觀測高點回撤 {fmt(rec['drawdown'])}。"
                  "這些是歷史統計，不足以單獨證明漲跌原因，也不保證未來報酬。"
                  "不同市場的點數、幣別與價格指數／含息指數不可直接比較。")
        evidence = {"kind": "market_stat", "source_sha256": provenance["file_sha256"],
                    "source_provider": provenance["provider"], "date": str(day),
                    "price_type": provenance["price_type"], "index_proxy": market["representative_index"]}
        results.append(candidate(f"fin_{market['id']}_{day:%Y%m}_market", day,
                                 market["id"], user, answer, evidence))
    return results

def first_reaction(market, records, event, provenance):
    zone = ZoneInfo(market["tz"])
    published = event["_utc"]
    # Conservative close times. If the real exchange closes early, exact
    # event-day alignment requires a licensed exchange calendar.
    close_time = time(16, 0)
    if market["id"] in {"shanghai", "shenzhen"}:
        close_time = time(15, 0)
    elif market["id"] in {"japan", "korea", "taiwan"}:
        close_time = time(15, 0) # conservative; may differ from actual
    elif market["id"] == "hong_kong":
        close_time = time(16, 0)
    elif market["id"] == "nse_india" or market["id"] == "bse_india":
        close_time = time(15, 30)
    for idx, rec in enumerate(records):
        closing = datetime.combine(rec["date"], close_time, zone)
        if closing.astimezone(timezone.utc) <= published:
            continue
        if rec["ret"] is None or idx + 5 >= len(records):
            return None
        # Do not associate extremely stale headlines with later sessions.
        if (closing.astimezone(timezone.utc) - published).days > 8:
            return None
        horizon = records[idx+5]
        # Keep labels strictly inside the same chronological partition:
        # an event near a split boundary must not see future data there.
        if split_for(rec["date"]) != split_for(horizon["date"]):
            return None
        return rec, horizon
    return None

def event_samples(market, records, provenance, events):
    result = []
    for e in events:
        if market["id"] not in e["market_ids"]:
            continue
        reacted = first_reaction(market, records, e, provenance)
        if reacted is None:
            continue
        first, fifth = reacted
        index0 = first["close"]
        # Performance after first fully informed trading close.
        follow5 = 100 * (fifth["close"] / index0 - 1)
        day = fifth["date"]    # answer is retrospective as of the end of window
        status = e["causal_status"]
        inference = ("官方文件直接記載之事件" if status == "documented" else
                     "有來源支持的背景脈絡" if status == "supported" else
                     "尚待交叉查證的假說" if status == "hypothesis" else "成因尚未確定")
        user = (f"以截至 {day} 的資料，回顧「{e['title']}」和"
                f" {market['representative_index']} 的短期關係；請提供新聞證據、"
                "波動數據並明確區分關聯與因果。")
        answer = (f"事件：{e['title']}。來源：{e['source_name']}（{e['source_url']}），"
                  f"刊布時間 {e['published_at']}。{e['summary']} "
                  f"證據狀態：{inference}。"
                  f"市場反應：首個事件資訊已公開後的交易日 {first['date']} 報酬 "
                  f"{fmt(first['ret'])}；此後五個交易日累計 {fmt(follow5)}（截至 {day}）。"
                  "事件與報酬同時發生不代表事件是唯一或已證明的漲跌原因；"
                  "對全球市場還須控制時差、同期政策、財報及其他消息。"
                  "以上為已發生市場變化的事後分析，不是當時可預知的未來結果。")
        ev = {"kind": "event_study", "source_url": e["source_url"],
              "published_at": e["published_at"], "causal_status": status,
              "first_informed_close": str(first["date"]), "as_of": str(day),
              "price_sha256": provenance["file_sha256"]}
        identifier = f"fin_{market['id']}_{e['id']}_{day:%Y%m%d}"
        if len(identifier) > 80:
            identifier = f"fin_{market['id']}_{digest(identifier)[:20]}"
        result.append(candidate(identifier, day, market["id"], user, answer, ev))
    return result

def prepare(args):
    catalog, markets = read_catalog()
    price_data, provenance = load_prices(args.prices_dir, args.rights, allow_partial=args.allow_partial)
    if args.require_top20 and len(price_data) != 20:
        fail("NOT_ALL_TOP20_MARKETS_PRESENT")
    events = load_events(args.events, markets)
    out, seen = [], set()
    for market_id, prices in price_data.items():
        market = markets[market_id]
        stats = returns(prices)
        candidates = monthly_samples(market, stats, provenance[market_id])
        candidates += event_samples(market, stats, provenance[market_id], events)
        for row in candidates:
            if row["id"] in seen:
                fail("DUPLICATE_CANDIDATE_ID")
            seen.add(row["id"])
            out.append(row)
    out.sort(key=lambda r: (r["as_of"], r["id"]))
    summary = {"status": "CANDIDATES_NOT_TRAINED", "window": [str(START), str(END)],
               "snapshot_basis": catalog["ranking_basis"], "market_count": len(price_data),
               "market_source": catalog["ranking_source"], "event_count": len(events),
               "rows": len(out),
               "split_counts": {s: sum(r["split"] == s for r in out) for s in ("train", "eval", "test")},
               "market_provenance": provenance, "reviewed_for_training": False,
               "trained_model_count": 0, "temporal_split_end": [str(TRAIN_END), str(EVAL_END)]}
    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    directory = Path(args.output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    write_new(directory / "candidates.jsonl", out)
    write_new(directory / "audit.json", [summary])
    print(json.dumps(summary, ensure_ascii=False, indent=2))

def approve(args):
    candidates = list(read_jsonl(args.candidates))
    approvals = list(read_jsonl(args.approvals))
    approved_by_id = {}
    for row in approvals:
        if row.get("id") in approved_by_id:
            fail("DUPLICATE_APPROVAL")
        if (row.get("reviewed") is not True or row.get("consent") is not True
            or row.get("rights_basis") not in RIGHTS
            or not isinstance(row.get("reviewer"), str) or len(row["reviewer"].strip()) < 3
            or len(str(row.get("rights_reference", "")).strip()) < 8):
            fail("INVALID_ITEM_APPROVAL")
        approved_by_id[row["id"]] = row
    split_rows = defaultdict(list)
    for row in candidates:
        claimed = row.pop("candidate_sha256", None)
        if claimed != digest(row):
            fail("CANDIDATE_CHANGED_AFTER_GENERATION")
        approval = approved_by_id.get(row["id"])
        if not approval:
            continue
        if claimed != approval.get("candidate_sha256"):
            fail("APPROVAL_CONTENT_HASH_MISMATCH")
        as_of = iso_day(row["as_of"])
        if split_for(as_of) != row["split"]:
            fail("TEMPORAL_SPLIT_TAMPERING")
        clean = {key: row[key] for key in ("id", "user", "assistant", "domain", "source")}
        clean.update(reviewed=True, consent=True)
        split_rows[row["split"]].append(clean)
    if set(approved_by_id) - {r["id"] for r in candidates}:
        fail("APPROVAL_REFERENCES_MISSING_CANDIDATE")
    if len(split_rows["train"]) < args.min_train or len(split_rows["eval"]) < args.min_eval:
        fail("INSUFFICIENT_CHRONOLOGICAL_TRAIN_AND_EVAL")
    directory = Path(args.output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    # Use explicit separate eval, never random-split the historical future.
    for split in ("train", "eval", "test"):
        write_new(directory / f"{split}.jsonl", split_rows[split])
    meta = {"state": "REVIEWED_SFT_NOT_TRAINED", "approved_rows": sum(map(len, split_rows.values())),
            "train": len(split_rows["train"]), "eval": len(split_rows["eval"]),
            "test": len(split_rows["test"]), "candidate_file_sha256": file_sha(Path(args.candidates)),
            "approvals_file_sha256": file_sha(Path(args.approvals)),
            "date_boundaries": [str(TRAIN_END), str(EVAL_END)],
            "train_sha256": file_sha(directory / "train.jsonl"),
            "eval_sha256": file_sha(directory / "eval.jsonl"),
            "test_sha256": file_sha(directory / "test.jsonl"),
            "trained": False}
    write_new(directory / "approved-provenance.json", [meta])
    print(json.dumps(meta, ensure_ascii=False, indent=2))

def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    subs = p.add_subparsers(dest="command", required=True)
    c = subs.add_parser("catalog", help="print independently sourced WFE ranking")
    b = subs.add_parser("prepare", help="create non-trainable evidence candidates")
    b.add_argument("--prices-dir", required=True)
    b.add_argument("--rights", required=True, help="market_id -> provider, rights_basis, rights_reference, approved_for_training, price_type")
    b.add_argument("--events", help="optional reviewed, rights-attested metadata JSONL")
    b.add_argument("--output-dir", required=True)
    b.add_argument("--allow-partial", action="store_true", help="research/debug only")
    b.add_argument("--require-top20", action="store_true", help="reject incomplete 20-exchange corpus")
    b.add_argument("--dry-run", action="store_true")
    a = subs.add_parser("approve", help="convert individually signed candidates into SFT train/eval/test")
    a.add_argument("--candidates", required=True)
    a.add_argument("--approvals", required=True)
    a.add_argument("--output-dir", required=True)
    a.add_argument("--min-train", type=int, default=100)
    a.add_argument("--min-eval", type=int, default=100)
    args = p.parse_args(argv)
    if args.command == "catalog":
        print(CATALOG.read_text(encoding="utf-8"))
    elif args.command == "prepare":
        prepare(args)
    else:
        approve(args)

if __name__ == "__main__":
    main()
