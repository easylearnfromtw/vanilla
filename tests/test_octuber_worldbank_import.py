"""Synthetic World Bank offline yearly evidence importer contracts."""
from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "training" / "octuber-finance"
sys.path.insert(0, str(SOURCE))
import worldbank_import as wb


class WorldBankIntakeTests(unittest.TestCase):
    def fixture(self, d):
        root = Path(d)
        export = root / "wb.json"
        license_file = root / "rights.json"
        indicator = "CM.MKT.LCAP.CD"
        export.write_text(json.dumps([
            {"page": 1, "pages": 1, "total": 2},
            [{"indicator": {"id": indicator, "value": "Market cap"},
              "countryiso3code": "USA", "date": "2008", "value": 1.234e12},
             {"indicator": {"id": indicator, "value": "Market cap"},
              "countryiso3code": "JPN", "date": "2008", "value": None}]
        ]), encoding="utf-8")
        license_file.write_text(json.dumps({
            "indicator": indicator, "provider": "World Bank Data Catalog",
            "verified_dataset_license_url": "https://datacatalog.worldbank.org/public-licenses",
            "license_verified_by_owner": True
        }), encoding="utf-8")
        return export, license_file, indicator

    def test_no_approval_or_daily_market_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, rights, indicator = self.fixture(tmp)
            output = Path(tmp) / "raw.jsonl"
            report = wb.convert(src, output, indicator, rights)
            self.assertEqual(report["unreviewed_evidence"], 1)
            self.assertEqual(report["raw_market_price_rows"], 0)
            row = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(row["value"], 1.234e12)
            self.assertFalse(row["training_approved"])
            self.assertFalse(row["publication_time_verified"])

    def test_unverified_license_blocks_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, rights, indicator = self.fixture(tmp)
            detail = json.loads(rights.read_text())
            detail["license_verified_by_owner"] = False
            rights.write_text(json.dumps(detail))
            with self.assertRaisesRegex(ValueError, "LICENSE_REVIEW"):
                wb.convert(src, Path(tmp) / "blocked.jsonl", indicator, rights)

    def test_mixed_series_or_duplicate_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, rights, indicator = self.fixture(tmp)
            payload = json.loads(src.read_text())
            payload[1][0]["indicator"]["id"] = "NY.GDP.MKTP.CD"
            src.write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError, "MIXED_OR_WRONG"):
                wb.convert(src, Path(tmp) / "blocked.jsonl", indicator, rights)


if __name__ == "__main__":
    unittest.main()
