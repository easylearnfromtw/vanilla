#!/usr/bin/env python3
"""October human-shopper simulator; REAL price observations, SYNTHETIC preferences.

Two input modes:
  published-range: verified historical price intervals, without seller identities
  retail-offers: user-provided authorized exact-SKU seller quotes, with merchant,
                 marketplace, observed_at and known shipping/discount fields

No browsing, scraping, captcha evasion, purchase, fake quotes, or Qwen training.
"""
from __future__ import annotations
import argparse,csv,hashlib,json,math,random,statistics,sys
from collections import Counter,defaultdict
from datetime import datetime,date,timezone
from pathlib import Path

PERSONAS=(
 "careful-bargain-hunter","working-parent","student-budget","busy-professional",
 "reliability-focused","urgent-buyer","high-value-seeker","small-business-owner",
 "quality-first","discount-skeptic","first-time-buyer","comparison-enthusiast"
)
DATA_SOURCES={"biggo","feebee","lbj","merchant","authorized-feed","manual"}
MARKETPLACES={"shopee":"蝦皮購物","coupang":"酷澎","momo":"momo購物網",
 "pchome":"PChome 24h","yahoo":"Yahoo購物","rakuten":"樂天市場"}
SECONDARY="secondary-republication-of-government-prices"

def positive(raw,field,allow_zero=False):
 try: value=float(str(raw or "").strip().replace(",",""))
 except ValueError: raise ValueError("INVALID_"+field) from None
 if not math.isfinite(value) or (value<0 if allow_zero else value<=0) or value>1e8:
  raise ValueError("INVALID_"+field)
 return value

def get_rows(path):
 file=Path(path)
 if not file.is_file() or file.stat().st_size>100_000_000:raise ValueError("INPUT_MISSING_OR_TOO_LARGE")
 with file.open(encoding="utf-8-sig",newline="") as f:
  rows=list(csv.DictReader(f))
 if not rows:raise ValueError("PRICE_DATA_EMPTY")
 return rows,hashlib.sha256(file.read_bytes()).hexdigest()

def load_prices(path,mode,*,research_secondary=False,ack_authorized=False):
 source_rows,digest=get_rows(path)
 rows=[]
 if mode=="published-range":
  for row in source_rows:
   if row.get("evidence_class")==SECONDARY and not research_secondary:
    raise ValueError("SECONDARY_RESEARCH_ACK_REQUIRED")
   if row.get("evidence_class") not in (
       SECONDARY,"government-open-data"):
    raise ValueError("UNAPPROVED_PRICE_REFERENCE")
   if row.get("currency")!="TWD" or not str(row.get("source_url","")).startswith("https://"):
    raise ValueError("CURRENCY_AND_SOURCE_PROVENANCE_REQUIRED")
   observed=date.fromisoformat(row["observed_date"])
   if observed>date.today():raise ValueError("FUTURE_PRICE_REFERENCE")
   minimum=positive(row["price_min_twd"],"PRICE_MIN")
   maximum=positive(row["price_max_twd"],"PRICE_MAX")
   if maximum<minimum:raise ValueError("INVALID_REFERENCE_INTERVAL")
   name=str(row.get("product") or "").strip()
   if not name:raise ValueError("PRODUCT_NAME_REQUIRED")
   rows.append({"product":name,"sku":str(row.get("spec") or "").strip(),
     "category":str(row.get("category") or "未分類").strip(),
     "lo":minimum,"hi":maximum,"reference_date":observed.isoformat(),
     "reference_url":row["source_url"],"quotes":[]})
 else:
  if not ack_authorized:raise ValueError("EXPLICIT_AUTHORIZED_FEED_ACK_REQUIRED")
  grouped=defaultdict(list)
  for row in source_rows:
   if row.get("training_rights_status")!="authorized":
    raise ValueError("ROW_TRAINING_RIGHTS_MISSING")
   if row.get("currency")!="TWD":raise ValueError("ONLY_TWD_OFFERS")
   if row.get("source","") not in DATA_SOURCES:raise ValueError("UNKNOWN_ACQUISITION_SOURCE")
   if not str(row.get("url","")).startswith("https://"):
    raise ValueError("HTTPS_SELLER_EVIDENCE_REQUIRED")
   if not str(row.get("merchant","")).strip():raise ValueError("ACTUAL_SELLER_REQUIRED")
   marketplace=str(row.get("marketplace") or "").strip().lower()
   if marketplace and marketplace not in MARKETPLACES:raise ValueError("UNKNOWN_SELLING_PLATFORM")
   sku=str(row.get("sku") or "").strip()
   if not sku or not str(row.get("product","")).strip():raise ValueError("EXACT_SKU_REQUIRED")
   when=datetime.fromisoformat(row["observed_at"].replace("Z","+00:00"))
   if when.tzinfo is None or when.astimezone(timezone.utc)>datetime.now(timezone.utc):
    raise ValueError("INVALID_OBSERVATION_TIME")
   # A blank shipping amount is *unknown*, never silently treated as free shipping.
   freight=positive(row["shipping_fee"],"SHIPPING",True) if str(row.get("shipping_fee","")).strip() else None
   discount=positive(row["verified_discount"],"DISCOUNT",True) if str(row.get("verified_discount","")).strip() else 0
   listing=positive(row["price"],"LIST_PRICE")
   if discount>listing:raise ValueError("DISCOUNT_EXCEEDS_ITEM_PRICE")
   grouped[sku].append({"product":row["product"].strip(),"sku":sku,
      "category":str(row.get("category") or "未分類").strip(),
      "merchant":row["merchant"].strip(),"marketplace":marketplace or None,
      "origin":row["source"],"url":row["url"],"timestamp":when.timestamp(),
      "price":listing,"freight":freight,"discount":discount,
      "total":listing+freight-discount if freight is not None else None})
  for sku,offers in grouped.items():
   latest={}
   for offer in offers:
    identity=(offer["marketplace"] or "unknown",offer["merchant"].casefold())
    if identity not in latest or latest[identity]["timestamp"]<offer["timestamp"]:
     latest[identity]=offer
   quotes=list(latest.values())
   rows.append({"product":quotes[0]["product"],"sku":sku,"category":quotes[0]["category"],
       "quotes":quotes,"lo":min(x["price"] for x in quotes),
       "hi":max(x["price"] for x in quotes),
       "reference_url":None,"reference_date":None})
 if not rows:raise ValueError("NO_VERIFIABLE_PRICE_ROWS")
 return sorted(rows,key=lambda v:(v["category"],v["product"],v["sku"])),digest,len(source_rows)

def evaluate(shopping_item, persona, budget, now):
 steps=["搜尋商品","核對型號與容量","查看來源日期","比較實際店家","確認運費與折扣","作出決策"]
 quotes=shopping_item["quotes"]
 if not quotes:
  return "seek-verified-offers","only-a-published-price-range-no-retailer",None,steps
 current=[q for q in quotes if now-q["timestamp"]<=48*3600 and now-q["timestamp"]>=-300]
 verified=[q for q in current if q["total"] is not None]
 if len({(x["marketplace"],x["merchant"].casefold()) for x in verified})<2:
  return "verify-more-stores","fewer-than-two-fresh-delivered-independent-sellers",None,steps
 valid=sorted(verified,key=lambda x:(x["total"],x["timestamp"]*-1))
 chosen=next((q for q in valid if q["total"]<=budget),None)
 if chosen is None:return "hold","verified-delivered-price-over-budget",None,steps
 # This is a *hypothetical* shopper recommendation, not a real completed order.
 return "would-buy","hypothetical-affordable-delivered-quote",{
    "merchant":chosen["merchant"],"marketplace":chosen["marketplace"],
    "price_twd":chosen["price"],"freight_twd":chosen["freight"],
    "verified_discount_twd":chosen["discount"],
    "delivered_total_twd":round(chosen["total"],2),"url":chosen["url"],
 },steps

def simulate(rows,*,episodes=10000,seed=20261025,sample_limit=250,now=None):
 if not 1<=episodes<=1_000_000:raise ValueError("EPISODE_LIMIT_1_TO_1000000")
 rng=random.Random(seed)
 timestamp=now.timestamp() if now else datetime.now(timezone.utc).timestamp()
 counts=Counter()
 categories=Counter()
 previews=[]
 for index in range(episodes):
  item=rows[index%len(rows)]
  person=PERSONAS[(index//len(rows)+rng.randrange(len(PERSONAS)))%len(PERSONAS)]
  # The budget is simulated human preference, NOT a new market price.
  reference=statistics.median((item["lo"],item["hi"]))
  budget=round(reference*rng.uniform(.72,1.32),2)
  action,why,seller,steps=evaluate(item,person,budget,timestamp)
  counts[action]+=1
  counts["total"]+=1
  categories[item["category"]]+=1
  if len(previews)<sample_limit:
   previews.append({"episode":index+1,"simulated_persona":person,
      "real_reference_product":item["product"],"exact_sku_or_spec":item["sku"],
      "published_or_offered_price_bounds_twd":[item["lo"],item["hi"]],
      "hypothetical_budget_twd":budget,"simulated_actions":steps,
      "decision":action,"reason":why,"shop_choice":seller,
      "market_quote_untouched":True,"human_preference_is_synthetic":True})
 return counts,categories,previews

def run(argv=None):
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument("--input",type=Path,required=True)
 ap.add_argument("--output",type=Path,required=True)
 ap.add_argument("--mode",required=True,choices=("published-range","retail-offers"))
 ap.add_argument("--episodes",type=int,default=10000)
 ap.add_argument("--seed",type=int,default=20261025)
 ap.add_argument("--research-secondary",action="store_true")
 ap.add_argument("--ack-authorized-feed",action="store_true")
 args=ap.parse_args(argv)
 if args.output.exists() and any(args.output.iterdir()):raise ValueError("OUTPUT_NOT_EMPTY")
 rows,digest,original=load_prices(args.input,args.mode,
     research_secondary=args.research_secondary,ack_authorized=args.ack_authorized_feed)
 counts,categories,previews=simulate(rows,episodes=args.episodes,seed=args.seed)
 args.output.mkdir(parents=True,exist_ok=True)
 (args.output/"sample-human-trajectories.jsonl").write_text(
     "".join(json.dumps(x,ensure_ascii=False)+"\n" for x in previews),encoding="utf-8")
 result={"type":"SIMULATED_HUMAN_SHOPPING_DECISIONS_NOT_MODEL_WEIGHT_TRAINING",
   "episodes":args.episodes,"distinct_seed_products":len({r["product"] for r in rows}),
   "distinct_seed_skus_or_specs":len({(r["product"],r["sku"]) for r in rows}),
   "observed_source_rows":original,"input_sha256":digest,
   "input_price_mode":args.mode,"source_prices_are_real_not_simulated":True,
   "shopper_preferences_are_simulated":True,"decisions_are_not_real_orders":True,
   "model_optimizer_steps":0,"qwen_model_weights_changed":False,
   "live_web_access_calls":0,"site_bot_evasion":False,
   "counts":dict(counts),"category_episode_counts":dict(categories),
   "trajectory_preview_rows":len(previews),
   "no_marketplace_inference_from_biggo_feebee_lbj":True,
   "pricing_trust_rule":"If no fresh independent retail sellers or complete freight costs, abstain."}
 (args.output/"summary.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("OCTUBER_HUMAN_SHOPPER_SIM",json.dumps(result,ensure_ascii=False))
 return 0

if __name__=="__main__":
 try:sys.exit(run())
 except (ValueError,KeyError) as exc:
  print("OCTUBER_SHOPPING_SIM_ERROR",str(exc),file=sys.stderr);sys.exit(2)
