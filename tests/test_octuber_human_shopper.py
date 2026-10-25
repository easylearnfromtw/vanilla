"""Standard-library tests of human-style shopper actions and price truthfulness."""
import csv,io,json,sys,tempfile,unittest
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from human_shopper_sim import load_prices,simulate,run,PERSONAS

def write(path,rows):
 with path.open("w",encoding="utf-8",newline="") as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)

def ref(product,category="食品"):
 return {"product":product,"category":category,"spec":"100g",
   "price_min_twd":"50","price_max_twd":"70","observed_date":"2026-10-19",
   "source_url":"https://example.org/public-price-information",
   "currency":"TWD","evidence_class":"secondary-republication-of-government-prices"}

def offer(shop,source,platform,price,freight="40",rights="authorized",sku="SKU1"):
 return {"product":"Test A","sku":sku,"merchant":shop,
  "marketplace":platform,"source":source,"price":str(price),
  "shipping_fee":freight,"verified_discount":"0","currency":"TWD",
  "observed_at":"2026-10-25T00:00:00+08:00",
  "url":"https://example.org/verified-store-"+shop,"training_rights_status":rights}

NOW=datetime(2026,10,25,0,30,tzinfo=timezone.utc)

class HumanShoppingSandbox(unittest.TestCase):
 def test_public_reference_facts_not_fictional_sellers(self):
  with tempfile.TemporaryDirectory() as tmp:
   input=Path(tmp)/"reference.csv";write(input,[ref("Milk A"),ref("Milk B")])
   with self.assertRaisesRegex(ValueError,"SECONDARY_RESEARCH"):
    load_prices(input,"published-range")
   rows,digest,count=load_prices(input,"published-range",research_secondary=True)
   decisions,cats,reference_checks,examples=simulate(rows,episodes=20000,sample_limit=10,now=NOW)
   self.assertEqual(count,2)
   self.assertEqual(decisions["total"],20000)
   self.assertEqual(decisions["seek-verified-offers"],20000)
   self.assertEqual(len(examples),10)
   self.assertTrue(all(x["shop_choice"] is None for x in examples))
   self.assertTrue(all(x["human_preference_is_synthetic"] for x in examples))
   self.assertEqual(len(digest),64)
 def test_actual_retailer_is_explicit_not_aggregator(self):
  with tempfile.TemporaryDirectory() as tmp:
   input=Path(tmp)/"seller.csv"
   write(input,[offer("seller-a","biggo","shopee",100,freight="0"),
                offer("seller-b","feebee","coupang",110,freight="0"),
                offer("seller-a","lbj","shopee",130,freight="0")])
   with self.assertRaisesRegex(ValueError,"EXPLICIT_AUTHORIZED"):
    load_prices(input,"retail-offers")
   rows,_,count=load_prices(input,"retail-offers",ack_authorized=True)
   self.assertEqual(len(rows),1)
   self.assertEqual(len(rows[0]["quotes"]),2)  # same seller re-listed via another aggregator
   counts,_,reference_checks,example=simulate(rows,episodes=2000,sample_limit=100,now=NOW)
   self.assertEqual(counts["total"],2000)
   self.assertGreater(counts["would-buy"],0)
   buys=[x for x in example if x["decision"]=="would-buy"]
   self.assertTrue(buys)
   self.assertTrue(all(x["shop_choice"]["marketplace"] in ("shopee","coupang") for x in buys))
 def test_unknown_shipping_never_becomes_free_shipping(self):
  with tempfile.TemporaryDirectory() as tmp:
   file=Path(tmp)/"seller.csv"
   write(file,[offer("a","biggo","shopee",120,freight=""),
               offer("b","feebee","coupang",110,freight="")])
   rows,_,_=load_prices(file,"retail-offers",ack_authorized=True)
   counts,_,reference_checks,preview=simulate(rows,episodes=10000,now=NOW)
   self.assertEqual(counts["verify-more-stores"],10000)
   self.assertTrue(all(x["shop_choice"] is None for x in preview))
 def test_unlicensed_and_incomplete_quotes_are_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   file=Path(tmp)/"feed.csv"
   write(file,[offer("a","biggo","shopee",100,rights="unknown")])
   with self.assertRaisesRegex(ValueError,"ROW_TRAINING_RIGHTS"):
    load_prices(file,"retail-offers",ack_authorized=True)
   write(file,[offer("a","biggo","biggo",100)])
   with self.assertRaisesRegex(ValueError,"UNKNOWN_SELLING_PLATFORM"):
    load_prices(file,"retail-offers",ack_authorized=True)
 def test_bounded_one_million_and_immutable_quote_prices(self):
  with tempfile.TemporaryDirectory() as tmp:
   file=Path(tmp)/"prices.csv";write(file,[ref("Milk A")])
   rows,_,_=load_prices(file,"published-range",research_secondary=True)
   original=json.dumps(rows,sort_keys=True)
   counts,_,reference_checks,sample=simulate(rows,episodes=100000,seed=33)
   self.assertEqual(counts["total"],100000)
   self.assertEqual(original,json.dumps(rows,sort_keys=True))
   self.assertEqual(len(sample),250)
   with self.assertRaisesRegex(ValueError,"EPISODE_LIMIT"):
    simulate(rows,episodes=1000001)

 def test_actual_official_ndc_csv_is_a_reference_not_fake_shopee_offers(self):
  with tempfile.TemporaryDirectory() as tmp:
   filename=Path(tmp)/"ndc.csv"
   filename.write_text("日期,商品類別,商品名稱,最低價格,最高價格\n"
     "2024-11-10,米,天生好米-300g,100,150\n"
     "2024-11-10,米,天生好米-300g,100,150\n"
     "2024-11-09,鮮乳,光泉鮮乳 936ml,92,115\n"
     "2024-11-09,奶粉,無價產品,N/A,N/A\n",encoding="utf8")
   records,_,raw=load_prices(filename,"ndc-official")
   self.assertEqual(raw,4)
   self.assertEqual(len(records),2)
   self.assertFalse(records[0]["quotes"])
   counts,_,ranges,samples=simulate(records,episodes=1200,now=NOW)
   self.assertEqual(counts["seek-verified-offers"],1200)
   self.assertEqual(sum(ranges.values()),1200)
   self.assertTrue(all(x["shop_choice"] is None for x in samples))

 def test_cli_summary_distinguishes_behaviour_from_model_training(self):
  with tempfile.TemporaryDirectory() as tmp:
   file=Path(tmp)/"prices.csv";write(file,[ref("Milk A")])
   folder=Path(tmp)/"out"
   self.assertEqual(run(["--input",str(file),"--output",str(folder),
      "--mode","published-range","--research-secondary","--episodes","400"]),0)
   result=json.loads((folder/"summary.json").read_text())
   self.assertEqual(result["model_optimizer_steps"],0)
   self.assertEqual(result["live_web_access_calls"],0)
   self.assertEqual(result["counts"]["total"],400)
   with self.assertRaisesRegex(ValueError,"OUTPUT_NOT_EMPTY"):
    run(["--input",str(file),"--output",str(folder),
      "--mode","published-range","--research-secondary","--episodes","400"])
if __name__=="__main__":
 unittest.main()
