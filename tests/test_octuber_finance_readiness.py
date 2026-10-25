"""Offline market readiness and prohibited-provider checks; SYNTHETIC only."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parents[1] / "training" / "octuber-finance"
sys.path.insert(0, str(DIRECTORY))
import pipeline
import readiness


class FinanceReadinessTests(unittest.TestCase):
    def test_fred_sources_rejected_despite_claimed_permission(self):
        permitted = {"provider": "FRED® API", "rights_basis": "permission",
                     "rights_reference": "unverified-owner-assertion",
                     "approved_for_training": True, "price_type": "price_index"}
        with self.assertRaisesRegex(ValueError, "FRED_AI_TRAINING_TERMS"):
            pipeline.rights_check(permitted)
        permitted["provider"] = "Licensed-independent-vendor"
        permitted["source_url"] = "https://fred.stlouisfed.org/series/SP500"
        with self.assertRaisesRegex(ValueError, "FRED_AI_TRAINING_TERMS"):
            pipeline.rights_check(permitted)
        permitted["source_url"] = "https://independent-licensed-provider.example/data"
        pipeline.rights_check(permitted)

    def test_unobserved_market_never_counts_as_30y_ready(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            prices = root / "prices"
            prices.mkdir()
            (prices / "taiwan.csv").write_text(
                "date,close\n2024-01-01,100.0\n2024-01-02,101.0\n",
                encoding="utf-8"
            )
            rights = root / "rights.json"
            rights.write_text(json.dumps({"taiwan": {
                "provider": "owned unit fixture", "rights_basis": "owned",
                "rights_reference": "unit-test-original-synthetic",
                "approved_for_training": True, "price_type": "price_index"
            }}), encoding="utf-8")
            outcome = readiness.audit(prices, rights)
            self.assertEqual(outcome["market_count"], 1)
            self.assertEqual(len(outcome["missing_markets"]), 19)
            self.assertFalse(outcome["complete_market_coverage"])
            self.assertFalse(outcome["training_approved"])
            self.assertFalse(outcome["gpu_training_executed"])
            self.assertEqual(outcome["markets"]["taiwan"]["chronological_rows"]["eval"], 2)

    def test_complete_calendar_year_requires_180_distinct_observations(self):
        sparse = [(date(2020, 1, 1) + timedelta(days=i), 100 + i) for i in range(150)]
        summary = readiness.summarize_years(sparse)
        self.assertEqual(summary["complete_calendar_years_with_180_sessions"], 0)
        self.assertIn(2020, summary["incomplete_years"])
        self.assertFalse(summary["covers_1996_and_2026_boundaries"])


if __name__ == "__main__":
    unittest.main()
