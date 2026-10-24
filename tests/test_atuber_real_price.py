"""Price calibration policy tests. Standard library only: no torch/network."""
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from real_price_train import read_observations, split_no_name_leakage, _quantity


def make(index, source="government-open-data"):
    return {
        "product":f"測試商品-{index}", "category":f"類別{index%5}",
        "spec":"500g/包","price_min_twd":"100","price_max_twd":"140",
        "observed_date":"2026-10-19","source_url":"https://data.gov.tw/dataset/8066",
        "evidence_class":source,"currency":"TWD","training_rights_status":"public-government-data"
    }


def write_csv(p,rows):
    with p.open("w",encoding="utf8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


class RealPricePriceSense(unittest.TestCase):
    def test_real_source_fields_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"prices.csv"
            rows=[make(i) for i in range(60)]
            write_csv(p,rows)
            observed=read_observations(p)
            self.assertEqual(len(observed),60)
            a,b,c=split_no_name_leakage(observed)
            self.assertEqual(len(a)+len(b)+len(c),60)
            self.assertGreater(len(c),0)
            self.assertFalse({x["product"] for x in a}&{x["product"] for x in c})
            rows[3]["price_min_twd"]="999999"
            write_csv(p,rows)
            with self.assertRaisesRegex(ValueError,"INVALID_REAL_PRICE"):
                read_observations(p)

    def test_public_republication_does_not_sneak_into_live_training(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"prices.csv"
            rows=[make(i,"secondary-republication-of-government-prices") for i in range(60)]
            write_csv(p,rows)
            with self.assertRaisesRegex(ValueError,"EXPLICIT_RESEARCH"):
                read_observations(p)
            self.assertEqual(len(read_observations(p,research_secondary=True)),60)

    def test_licensed_comparison_requires_real_authorization(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"prices.csv"
            rows=[make(i,"licensed-comparison-feed") for i in range(60)]
            write_csv(p,rows)
            with self.assertRaisesRegex(ValueError,"TRAINING_AUTHORIZATION_REQUIRED"):
                read_observations(p)
            for r in rows:r["training_rights_status"]="authorized"
            write_csv(p,rows)
            self.assertEqual(len(read_observations(p)),60)

    def test_synthetic_labels_and_source_spoofing_flags(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"prices.csv"
            rows=[make(i,"synthetic") for i in range(60)]
            write_csv(p,rows)
            with self.assertRaisesRegex(ValueError,"SYNTHETIC_OR_UNAUTHORIZED"):
                read_observations(p)
            rows=[make(i) for i in range(60)]
            rows[0]["source_url"]="http://example.invalid/anything"
            write_csv(p,rows)
            with self.assertRaisesRegex(ValueError,"HTTPS_PRICE_SOURCE"):
                read_observations(p)

    def test_quantity_unit_normalization(self):
        self.assertEqual(_quantity("1.5kg/罐"),(1500.0,"mass"))
        self.assertEqual(_quantity("200g*3支"),(600.0,"mass"))
        self.assertEqual(_quantity("2L"),(2000.0,"volume"))


if __name__=="__main__":
    unittest.main()
