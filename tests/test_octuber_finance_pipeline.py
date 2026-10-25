"""OCTUBER 30y finance regression tests; synthetic examples only, never real data."""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

FILE = Path(__file__).resolve().parents[1] / "training" / "octuber-finance" / "pipeline.py"
spec = importlib.util.spec_from_file_location("octuber_finance_pipeline", FILE)
fin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fin)


class FinancePipelineTests(unittest.TestCase):
    def setUp(self):
        self.market = fin.read_catalog()[1]["taiwan"]

    def test_exchange_catalog_unique_ranked_top_twenty(self):
        data, mapping = fin.read_catalog()
        self.assertEqual(len(mapping), 20)
        self.assertEqual(sorted(x["rank"] for x in mapping.values()), list(range(1, 21)))
        self.assertTrue(data["ranking_source"].startswith("https://"))

    def test_monthly_returns_not_misrepresented_as_daily(self):
        records = [
            {"date": date(2020, 1, 31), "close": 100.0, "ret": 1.0, "vol20": 15.0, "drawdown": 0.0},
            {"date": date(2020, 2, 28), "close": 110.0, "ret": 2.0, "vol20": 18.0, "drawdown": 0.0},
        ]
        p = {"file_sha256": "a" * 64, "provider": "test", "price_type": "price_index"}
        result = fin.monthly_samples(self.market, records, p)
        self.assertEqual(len(result), 1)
        self.assertIn("相較前一個月末交易日報酬 +10.00%", result[0]["assistant"])
        self.assertIn("當日相較前一個交易日報酬 +2.00%", result[0]["assistant"])
        self.assertFalse(result[0]["reviewed"])

    def test_missing_month_never_fabricates_return(self):
        records = [
            {"date": date(2020, 1, 31), "close": 100.0, "ret": 0.0, "vol20": None, "drawdown": 0.0},
            {"date": date(2020, 3, 31), "close": 400.0, "ret": 3.0, "vol20": None, "drawdown": 0.0},
        ]
        p = {"file_sha256": "b" * 64, "provider": "test", "price_type": "price_index"}
        self.assertEqual(fin.monthly_samples(self.market, records, p), [])

    def test_published_intraday_only_next_full_local_session(self):
        initial = date(2020, 1, 1)
        data = [{"date": initial + timedelta(days=i), "close": 100 + i, "ret": 1.0}
                for i in range(14)]
        e = {"_utc": datetime(2020, 1, 2, 7, 0, tzinfo=timezone.utc)}
        reaction = fin.first_reaction(self.market, data, e, {})
        self.assertIsNotNone(reaction)
        self.assertEqual(reaction[0]["date"], date(2020, 1, 3))

    def test_horizon_cannot_cross_temporal_holdout_boundary(self):
        initial = date(2021, 12, 26)
        data = [{"date": initial + timedelta(days=i), "close": 100 + i, "ret": 1.0}
                for i in range(18)]
        event = {"_utc": datetime(2021, 12, 27, 1, 0, tzinfo=timezone.utc)}
        self.assertIsNone(fin.first_reaction(self.market, data, event, {}))

    def test_price_feed_requires_explicit_rights(self):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root)
            (base / "taiwan.csv").write_text("date,close\n2020-01-01,100\n2020-01-02,101\n")
            manifest = base / "rights.json"
            manifest.write_text(json.dumps({"taiwan": {
                "provider": "Test", "rights_basis": "owned",
                "rights_reference": "owner-dataset-2026", "approved_for_training": False,
                "price_type": "price_index"}}))
            with self.assertRaisesRegex(ValueError, "RIGHTS_ATTESTATION_REQUIRED"):
                fin.load_prices(base, manifest, allow_partial=True)

    def test_approve_requires_matching_hash_and_review(self):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root)
            samples = [fin.candidate("fin_demo_" + str(i), d, "taiwan",
                      "請分析這個歷史市場事件", "這是有來源的歷史波動分析。", {})
                       for i, d in enumerate((date(2021, 1, 10),
                                              date(2024, 1, 10),
                                              date(2025, 1, 10)))]
            cpath = base / "candidates.jsonl"
            fin.write_new(cpath, samples)
            approvals = [{"id": r["id"], "candidate_sha256": r["candidate_sha256"],
                          "reviewed": True, "consent": True, "rights_basis": "owned",
                          "rights_reference": "owned-trial-dataset",
                          "reviewer": "Test reviewer"} for r in samples]
            apath = base / "approvals.jsonl"
            fin.write_new(apath, approvals)
            fin.approve(SimpleNamespace(candidates=cpath, approvals=apath,
                                         output_dir=base / "approved",
                                         min_train=1, min_eval=1))
            for part in ("train", "eval", "test"):
                rows = list(fin.read_jsonl(base / "approved" / (part + ".jsonl")))
                self.assertEqual(len(rows), 1)
                self.assertTrue(rows[0]["reviewed"])
                self.assertEqual(len(rows[0]), 7)
            bad = [{**r, "candidate_sha256": "0" * 64} for r in approvals]
            badpath = base / "bad-approvals.jsonl"
            fin.write_new(badpath, bad)
            with self.assertRaisesRegex(ValueError, "APPROVAL_CONTENT_HASH_MISMATCH"):
                fin.approve(SimpleNamespace(candidates=cpath, approvals=badpath,
                                             output_dir=base / "blocked",
                                             min_train=1, min_eval=1))


if __name__ == "__main__":
    unittest.main()
