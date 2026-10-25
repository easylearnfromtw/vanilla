"""Unit tests for OCTUBER 20-year corpus. Offline: no news download or GPU."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1] / "training" / "octuber-news-20y"


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pipeline = load("octuber_news_pipeline", "pipeline.py")
gdelt = load("octuber_gdelt_candidates", "gdelt_candidates.py")


def item(url="https://news.example.com/story?utm_source=x", **changes):
    row = {
        "url": url, "title": "Test historical market coverage",
        "published_at": "2020-05-06", "market": "TW", "source": "Licensed test publisher",
        "text": "Original authorized text for testing the corpus. " * 10,
        "rights_basis": "permission",
        "rights_reference": "Permission recorded by test publisher 2020-01-01",
        "reviewed": True, "training_approved": True,
    }
    row.update(changes)
    return row


class PipelineTests(unittest.TestCase):
    def test_url_tracking_and_unique_id(self):
        self.assertEqual(pipeline.clean_url("http://NEWS.example.com/a?utm_source=b&z=2"),
                         "https://news.example.com/a?z=2")
        self.assertEqual(pipeline.examine(item())["status"], "eligible")

    def test_unlicensed_cannot_train(self):
        row = pipeline.examine(item(rights_reference="", reviewed=False))
        self.assertEqual(row["status"], "metadata_only")
        self.assertEqual(row["text"], "")
        self.assertIsNone(row["content_sha256"])

    def test_invalid_window_market(self):
        with self.assertRaises(ValueError):
            pipeline.examine(item(published_at="2000-01-01"))
        with self.assertRaises(ValueError):
            pipeline.examine(item(market="EU"))

    def test_reject_unverified_license(self):
        row = pipeline.examine(item(rights_basis="compatible-license", license="copyright"))
        self.assertEqual(row["status"], "metadata_only")

    def test_ingestion_and_dedup(self):
        with tempfile.TemporaryDirectory() as t:
            base = Path(t)
            src = base / "input.jsonl"
            rows = [item(), item(url="https://news.example.com/story?utm_source=second"),
                    item(url="https://other.example.com/copy"),
                    item(url="https://news.example.com/metadata", reviewed=False),
                    item(url="https://news.example.com/korea", market="KR",
                         text="Another legally approved article with new text. " * 12)]
            src.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
            args = SimpleNamespace(input=str(src), db=str(base / "db.sqlite"),
                                   output=str(base / "approved.jsonl"),
                                   report=str(base / "status.json"), target=20_000_000,
                                   limit=0)
            report = pipeline.ingest(args)
            self.assertEqual(report["metadata_indexed"], 3)
            self.assertEqual(report["rights_reviewed_unique_full_articles"], 2)
            self.assertEqual(report["eligible_by_market"]["TW"], 1)
            self.assertEqual(report["eligible_by_market"]["KR"], 1)
            self.assertFalse(report["article_target_met"])
            self.assertFalse(report["real_model_weights_trained"])
            self.assertEqual(len((base / "approved.jsonl").read_text().splitlines()), 2)
            repeat = pipeline.ingest(args)
            self.assertEqual(repeat["metadata_indexed"], 3)
            self.assertEqual(len((base / "approved.jsonl").read_text().splitlines()), 2)


class GdeltTests(unittest.TestCase):
    def test_archive_periods(self):
        self.assertTrue(gdelt.archive_url("200610").endswith("200610.zip"))
        self.assertTrue(gdelt.archive_url("20150503").endswith("20150503.export.CSV.zip"))
        with self.assertRaises(ValueError):
            gdelt.archive_url("20061001")
        with self.assertRaises(ValueError):
            gdelt.archive_url("201510")

    def test_events_are_only_candidates(self):
        row = [""] * 58
        row[0], row[1], row[7], row[17], row[57] = (
            "id", "20150401", "TWN", "USA", "https://news.example.com/item")
        result = gdelt.parse_event("\t".join(row))
        self.assertEqual(result["about_markets"], ["TW", "US"])
        self.assertFalse(result["has_news_full_text"])
        self.assertFalse(result["training_approved"])
        self.assertIsNone(gdelt.parse_event("\t".join(row[:57])))


if __name__ == "__main__":
    unittest.main()
