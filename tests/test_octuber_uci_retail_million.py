"""CPU-only toy fixtures for the UCI historical retail importer: NOT real prices."""
import csv
import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from uci_retail_million import extract,_partition,_category,_features

HEADER=["Invoice","StockCode","Description","Quantity","InvoiceDate","Price","Customer ID","Country"]


def _xml_sheet(rows):
    namespace="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    lines=[f'<worksheet xmlns="{namespace}"><sheetData>']
    for rownum,data in enumerate(rows,1):
        lines.append(f'<row r="{rownum}">')
        for col,v in enumerate(data):
            label=chr(ord("A")+col)
            if isinstance(v,(int,float)):
                lines.append(f'<c r="{label}{rownum}"><v>{v}</v></c>')
            else:
                lines.append(f'<c r="{label}{rownum}" t="inlineStr"><is><t>{escape(str(v))}</t></is></c>')
        lines.append('</row>')
    return "".join(lines)+"</sheetData></worksheet>"


def fixture(path):
    sheets=[
        [HEADER,
         ["INV001","SKU-1","Decorative Candle",2,40450,5.5,"ANON","United Kingdom"],
         ["CINV002","SKU-2","Returns are not sales",-2,40450,2.1,"","UK"],
         ["INV003","SKU-3","Sample Mug",1,40452,0.0,"","UK"],
         ["INV001","SKU-1","Decorative Candle",2,40450,5.5,"ANON","United Kingdom"]],
        [HEADER,
         ["INV004","SKU-4","Glass Bottle",2,40600,8.9,"ANON","United Kingdom"],
         ["INV005","POST","POSTAGE",1,40600,5.9,"ANON","United Kingdom"],
         ["INV006","SKU-5","Cotton Bag",1,40600,4.9,"ANON","United Kingdom"]],
    ]
    with zipfile.ZipFile(path,"w",zipfile.ZIP_DEFLATED) as out:
        for idx,data in enumerate(sheets,1):
            out.writestr(f"xl/worksheets/sheet{idx}.xml",_xml_sheet(data))


class BulkPriceWorkbook(unittest.TestCase):
    def test_real_xlsx_format_logic_does_not_inflate_rows(self):
        with tempfile.TemporaryDirectory() as t:
            raw=Path(t)/"tiny.xlsx";fixture(raw)
            out=Path(t)/"out"
            r=extract(raw,out)
            self.assertEqual(r["actual_processed_rows"],7)
            self.assertEqual(r["accepted_valid_unique_price_rows"],3)
            self.assertEqual(r["rejected_reason_counts"]["cancel_or_return"],1)
            self.assertEqual(r["rejected_reason_counts"]["invalid_price"],1)
            self.assertEqual(r["rejected_reason_counts"]["non_product"],1)
            self.assertEqual(r["rejected_reason_counts"]["identical_transaction_line"],1)
            self.assertFalse(r["million_training_rows_reached"])
            self.assertEqual(r["taiwan_market_prices"],0)
            vals=[]
            for part in ("train","validation","test"):
                with (out/(part+".csv")).open() as f:
                    vals.extend(csv.DictReader(f))
            self.assertEqual({row["stock_code"] for row in vals},
                             {"SKU-1","SKU-4","SKU-5"})
            self.assertEqual(len(vals),3)
            self.assertFalse(any("customer" in row or "invoice" in row for row in vals))
            with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
                extract(raw,out)

    def test_strict_partition_by_item(self):
        for sku in ["ABC-1","SKU-4","SKU-5"]:
            self.assertEqual(_partition(sku),_partition(sku))
            self.assertIn(_partition(sku),{"train","validation","test"})

    def test_no_laundering_legacy_uk_price_as_taiwan_quote(self):
        with tempfile.TemporaryDirectory() as t:
            raw=Path(t)/"tiny.xlsx";fixture(raw)
            receipt=extract(raw,Path(t)/"out")
            self.assertEqual(receipt["original_price_currency"],"GBP")
            self.assertTrue(receipt["not_a_twd_pricing_model"])
            self.assertEqual(receipt["biggo_feebee_lbj_feed_rows"],0)


if __name__=="__main__":
    unittest.main()
