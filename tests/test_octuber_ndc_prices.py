"""Synthetic unit-test FIXTURES only. No fixture observations ever reach training."""
import csv,sys,tempfile,unittest
from datetime import date
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from ndc_taiwan_price_train import parse_date,read_prices,group_split

def item(n):
 return {"日期":"114/10/24","商品類別":"分類"+str(n%6),"商品名稱":f"測試商品編號{n:03d}",
         "最低價格":str(10+n),"最高價格":str(50+n)}
def fixture(path,rows):
 with path.open("w",encoding="utf-8-sig",newline="") as f:
  writer=csv.DictWriter(f,fieldnames=["日期","商品類別","商品名稱","最低價格","最高價格"])
  writer.writeheader();writer.writerows(rows)
class NDCTaiwanPricing(unittest.TestCase):
 def test_roc_and_gregorian_dates(self):
  self.assertEqual(parse_date("114年10月24日"),"2025-10-24")
  self.assertEqual(parse_date("2025-10-24"),"2025-10-24")
  with self.assertRaises(ValueError):parse_date("2099/01/01")
 def test_official_schema_and_group_holdout(self):
  with tempfile.TemporaryDirectory() as d:
   file=Path(d)/"ndc.csv";fixture(file,[item(i) for i in range(120)])
   records,skips,digest=read_prices(file)
   self.assertEqual(len(records),120)
   self.assertEqual(len(digest),64)
   self.assertEqual(skips,{})
   self.assertTrue(all(r["currency"]=="TWD" and r["merchant"] is None for r in records))
   parts=group_split(records)
   self.assertEqual(sum(map(len,parts.values())),120)
   names=[{(r["category"],r["product"]) for r in values} for values in parts.values()]
   self.assertFalse(names[0]&names[1]);self.assertFalse(names[0]&names[2]);self.assertFalse(names[1]&names[2])
   self.assertGreater(len(parts["test"]),0)
 def test_duplicate_item_date_is_not_a_new_training_observation(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/"source.csv";fixture(path,[item(3),item(3),item(4)])
   rows,skips,_=read_prices(path)
   self.assertEqual(len(rows),2)
   self.assertEqual(skips["DUPLICATE_PRODUCT_DAY"],1)
 def test_bad_prices_and_future_dates_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/"bad.csv"
   a=item(1);a["最低價格"]="99999";a["最高價格"]="1"
   b=item(2);b["日期"]="2099/01/01"
   fixture(path,[a,b])
   with self.assertRaisesRegex(ValueError,"NO_VALID_NDC"):
    read_prices(path)
 def test_cannot_launder_third_party_merchant_csv_as_ndc(self):
  with tempfile.TemporaryDirectory() as d:
   path=Path(d)/"merchant.csv"
   path.write_text("product,merchant,price\nApple,ABC,100\n",encoding="utf8")
   with self.assertRaisesRegex(ValueError,"NDC_EXPECTED_COLUMN"):
    read_prices(path)
if __name__=="__main__":unittest.main()
