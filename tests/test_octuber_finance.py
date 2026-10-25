"""No GPU, network, third-party packages or fake production market data."""
import csv
import importlib.util
import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / "training" / "octuber-finance"

def load(name):
    spec = importlib.util.spec_from_file_location(name, BASE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

pipeline = load("pipeline")
gdelt_import = load("gdelt_import")
train_tiers = load("train_tiers")

class FinancePipelineTests(unittest.TestCase):
    def test_wfe_top20_snapshot_ranked(self):
        doc, markets = pipeline.read_catalog()
        self.assertEqual(len(markets), 20)
        ranks = doc["markets"]
        self.assertEqual([m["rank"] for m in ranks], list(range(1, 21)))
        self.assertEqual([m["market_cap_usd_millions_feb_2026"] for m in ranks],
                         sorted([m["market_cap_usd_millions_feb_2026"] for m in ranks], reverse=True))
        self.assertIn("world-exchanges", doc["ranking_source"])
        self.assertEqual(doc["research_start"], "1996-10-25")

    def fixtures(self, folder):
        root = Path(folder)
        raw = root / "price"
        raw.mkdir()
        rights = {}
        for market in ("nyse", "taiwan"):
            filename = raw / f"{market}.csv"
            with filename.open("w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(["date", "close"])
                seq = 0
                for year in (2020, 2021, 2022, 2024, 2025):
                    for i in range(100):
                        day = date(year, 1, 1) + timedelta(days=i)
                        writer.writerow([str(day), f"{100 + seq*0.08:.5f}"])
                        seq += 1
            rights[market] = {
                "provider": "unit-test fixture (not real prices)",
                "price_type": "price_index",
                "rights_basis": "owned",
                "rights_reference": "https://example.org/test-fixture-owned",
                "approved_for_training": True,
            }
        rpath = root / "rights.json"
        rpath.write_text(json.dumps(rights), encoding="utf-8")
        return raw, rpath

    def test_partial_pipeline_has_temporal_splits_and_no_auto_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw, rights = self.fixtures(tmp)
            args = type("Args", (), {
                "prices_dir": str(raw), "rights": str(rights), "allow_partial": True,
                "require_top20": False, "events": None,
                "output_dir": str(Path(tmp) / "out"), "dry_run": False,
            })()
            pipeline.prepare(args)
            samples = list(pipeline.read_jsonl(Path(tmp) / "out" / "candidates.jsonl"))
            self.assertGreater(len(samples), 10)
            self.assertTrue(all(not x["reviewed"] and not x["consent"] for x in samples))
            self.assertEqual({s["split"] for s in samples}, {"train", "eval", "test"})
            self.assertTrue(all(pipeline.split_for(date.fromisoformat(x["as_of"])) == x["split"]
                                for x in samples))
            self.assertTrue(all(x["candidate_sha256"] == pipeline.digest({
                k:v for k,v in x.items() if k != "candidate_sha256"}) for x in samples))
            self.assertTrue(all("unit-test fixture" in x["evidence"]["source_provider"] for x in samples))

    def test_release_guard_and_individual_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw, rights = self.fixtures(tmp)
            _, prov = pipeline.load_prices(raw, rights, allow_partial=True)
            self.assertEqual(len(prov), 2)
            with self.assertRaisesRegex(ValueError, "MISSING_PRICE_CSV"):
                pipeline.load_prices(raw, rights)
            m = pipeline.read_catalog()[1]["nyse"]
            s = pipeline.monthly_samples(m, pipeline.returns(
                pipeline.load_prices(raw, rights, allow_partial=True)[0]["nyse"]), prov["nyse"])
            train = next(x for x in s if x["split"] == "train")
            evaluation = next(x for x in s if x["split"] == "eval")
            candidates = Path(tmp) / "candidates.jsonl"
            pipeline.write_new(candidates, [train, evaluation])
            approvals = Path(tmp) / "approvals.jsonl"
            payload = lambda x: {
                "id": x["id"], "candidate_sha256": x["candidate_sha256"],
                "reviewed": True, "consent": True, "rights_basis": "owned",
                "rights_reference": "Unit test authored and individually reviewed source",
                "reviewer": "Test Reviewer",
            }
            pipeline.write_new(approvals, [payload(train), payload(evaluation)])
            args = type("Args", (), {
                "candidates": str(candidates), "approvals": str(approvals),
                "output_dir": str(Path(tmp) / "approved"), "min_train": 1, "min_eval": 1,
            })()
            pipeline.approve(args)
            files = Path(tmp) / "approved"
            training = list(pipeline.read_jsonl(files / "train.jsonl"))
            holdout = list(pipeline.read_jsonl(files / "eval.jsonl"))
            self.assertEqual(len(training), 1)
            self.assertEqual(len(holdout), 1)
            self.assertFalse({r["id"] for r in training} & {r["id"] for r in holdout})
            self.assertEqual(set(training[0]), {"id","user","assistant","domain","source","reviewed","consent"})
            report = list(pipeline.read_jsonl(files / "approved-provenance.json"))[0]
            self.assertEqual(report["train_sha256"], pipeline.file_sha(files / "train.jsonl"))

    def test_event_after_close_not_merged_with_previous_return(self):
        market = pipeline.read_catalog()[1]["nyse"]
        points = [(date(2020, 5, 1) + timedelta(days=i), 100+i) for i in range(20)]
        records = pipeline.returns(points)
        # A headline after New York's close on May 5: first informed close May 6.
        event = {"_utc": datetime(2020, 5, 5, 22, 0, tzinfo=timezone.utc)}
        first, fifth = pipeline.first_reaction(market, records, event, {})
        self.assertEqual(str(first["date"]), "2020-05-06")
        self.assertEqual(str(fifth["date"]), "2020-05-11")

    def test_unknown_event_rights_and_60b_training_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "RIGHTS_ATTESTATION_REQUIRED"):
            pipeline.rights_check({"rights_basis": "permission", "rights_reference": "",
                                   "provider": "untested", "approved_for_training": True})
        with self.assertRaisesRegex(ValueError, "60B_TRAINING_BLOCKED"):
            train_tiers.train(type("Args", (), {"tier": "60b"})())

    def test_gdelt_import_never_auto_approves(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "events.tsv"
            row = [""] * 58
            row[0], row[1], row[26], row[30] = "123456", "20080915", "01", "0.0"
            row[6], row[16], row[56], row[57] = "ACTOR A", "ACTOR B", "20080916", "https://example.org/news"
            with src.open("w", encoding="utf-8") as out:
                out.write("\t".join(row) + "\n")
            dst = Path(tmp) / "source.jsonl"
            report = gdelt_import.process(src, dst, limit=5, first="19961025", last="20261025")
            self.assertEqual(report["evidence_cards"], 1)
            cards = list(pipeline.read_jsonl(dst))
            self.assertIs(cards[0]["training_approved"], False)
            self.assertIs(cards[0]["publication_timestamp_verified"], False)
            self.assertEqual(cards[0]["event_date"], "2008-09-15")

if __name__ == "__main__":
    unittest.main()
