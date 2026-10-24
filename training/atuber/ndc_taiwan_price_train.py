#!/usr/bin/env python3
"""October Taiwan retail-price calibration from NDC official public CSV.
Source: https://data.gov.tw/dataset/22933, Open Government Data License v1.
Does NOT scrape BigGo/Feebee/LBJ or modify Qwen model weights.
"""
from __future__ import annotations
import argparse,csv,hashlib,json,math,re,statistics,unicodedata,zlib
from collections import Counter,defaultdict
from datetime import date
from pathlib import Path

OFFICIAL_DATASET="https://data.gov.tw/dataset/22933"
OFFICIAL_CSV="https://ws.ndc.gov.tw/001/administrator/10/relfile/0/9862/17300d07-7b9f-4c88-a1ab-0e406342def4.csv"
ALIASES={
 "date":("日期","交易日期","資料日期","統計日期"),
 "category":("商品類別","商品分類","類別"),
 "product":("商品名稱","品名","商品名"),
 "low":("最低價格","最低價","最小值"),
 "high":("最高價格","最高價","最大值"),
}
def norm(v):
 return unicodedata.normalize("NFKC",str(v or "")).strip()
def parse_date(v):
 s=norm(v).replace("年","/").replace("月","/").replace("日","").replace("-","/").strip(" /.")
 m=re.fullmatch(r"(\d{2,4})/(\d{1,2})/(\d{1,2})",s)
 if not m:raise ValueError("INVALID_DATE")
 y,month,day=map(int,m.groups())
 if y<1911:
  if not 100<=y<=200:raise ValueError("INVALID_ROC_YEAR")
  y+=1911
 d=date(y,month,day)
 if d>date.today() or d<date(2010,1,1):raise ValueError("DATE_OUTSIDE_ACCEPTED_RANGE")
 return d.isoformat()
def price(v):
 return float(norm(v).replace(",","").replace("NT$","").replace("元","").replace("$","").strip())
def read_prices(path):
 p=Path(path)
 if not p.is_file() or not 30<=p.stat().st_size<=100_000_000:raise ValueError("CSV_UNAVAILABLE")
 raw=p.read_bytes()
 for codec in ("utf-8-sig","cp950","big5"):
  try:
   value=raw.decode(codec)
   break
  except UnicodeError:continue
 else:raise ValueError("UNSUPPORTED_CSV_ENCODING")
 reader=csv.DictReader(value.splitlines())
 if not reader.fieldnames:raise ValueError("NO_HEADER")
 normalized={norm(x):x for x in reader.fieldnames}
 col={}
 for name,possible in ALIASES.items():
  col[name]=next((normalized[k] for k in possible if k in normalized),None)
  if col[name] is None:raise ValueError("NDC_EXPECTED_COLUMN_MISSING_"+name)
 records,skipped,identities=[],Counter(),set()
 for row in reader:
  try:
   category=norm(row[col["category"]]);product=norm(row[col["product"]])
   if not 1<=len(category)<=100 or not 2<=len(product)<=200:raise ValueError("INVALID_PRODUCT_ID")
   observed=parse_date(row[col["date"]])
   low=price(row[col["low"]]);high=price(row[col["high"]])
   if not math.isfinite(low) or not math.isfinite(high) or not 0<low<=high<=1000000:
    raise ValueError("INVALID_PRICE_INTERVAL")
   key=(category.casefold(),product.casefold(),observed)
   if key in identities:
    skipped["DUPLICATE_PRODUCT_DAY"]+=1;continue
   identities.add(key)
   records.append({"category":category,"product":product,"date":observed,
      "low_twd":low,"high_twd":high,"mid_twd":(low+high)/2,
      "currency":"TWD","price_kind":"anonymous-retail-invoice-range","merchant":None})
  except (ValueError,TypeError,OverflowError,KeyError) as exc:
   skipped[str(exc)[:90] or "UNPARSABLE_ROW"]+=1
 if not records:raise ValueError("NO_VALID_NDC_PRICE_RECORDS")
 return records,dict(skipped),hashlib.sha256(raw).hexdigest()

def group_split(rows):
 by_category=defaultdict(dict)
 for row in rows:
  cat=row["category"].casefold()
  name=row["product"].casefold()
  by_category[cat].setdefault(name,[]).append(row)
 partitions={"train":[],"validation":[],"test":[]}
 for cat,names in by_category.items():
  keys=sorted(names,key=lambda n:hashlib.sha256(("octuber-ndc-2:"+cat+":"+n).encode()).digest())
  n=len(keys)
  test=max(1,round(n*.15)) if n>=4 else 0
  validation=max(1,round(n*.15)) if n>=4 else 0
  for index,name in enumerate(keys):
   part="test" if index<test else "validation" if index<test+validation else "train"
   partitions[part].extend(names[name])
 ids=[{(r["category"].casefold(),r["product"].casefold()) for r in vals} for vals in partitions.values()]
 if ids[0]&ids[1] or ids[0]&ids[2] or ids[1]&ids[2]:raise RuntimeError("PRODUCT_NAME_SPLIT_LEAK")
 return partitions

def feature(row,categories):
 import numpy as np
 x=np.zeros(129+len(categories),dtype=np.float32)
 text=(row["category"]+" "+row["product"]).casefold()
 grams=[text[i:i+2] for i in range(max(1,len(text)-1))]
 for g in grams:x[zlib.crc32(g.encode())%128]+=1
 x[:128]/=max(1,len(grams))**.5
 if row["category"] in categories:x[128+categories.index(row["category"])]=1
 x[-1]=1
 return x

def train_model(parts,*,steps,output):
 import numpy as np
 if not 20<=steps<=3000:raise ValueError("INVALID_TRAINING_STEP_BUDGET")
 training=parts["train"];validation=parts["validation"];testing=parts["test"]
 distinct=len({(r["category"],r["product"]) for p in parts.values() for r in p})
 if min(len(training),len(validation),len(testing))<10 or len(training)<40 or distinct<40:
  raise ValueError("INSUFFICIENT_DIVERSE_REAL_PRICE_RECORDS")
 cats=sorted({r["category"] for r in training})
 matrix=lambda records:np.stack([feature(r,cats) for r in records])
 x,v,t=matrix(training),matrix(validation),matrix(testing)
 y=np.log(np.array([r["mid_twd"] for r in training],dtype=np.float32))[:,None]
 vtruth=np.log(np.array([r["mid_twd"] for r in validation],dtype=np.float32))[:,None]
 test_actual=np.array([r["mid_twd"] for r in testing],dtype=np.float32)
 rng=np.random.default_rng(20261025)
 w=rng.normal(0,.08,(x.shape[1],24)).astype(np.float32)
 b=np.zeros(24,dtype=np.float32)
 u=rng.normal(0,.08,(24,1)).astype(np.float32)
 c=np.array([float(np.median(y))],dtype=np.float32)
 tensors=[w,b,u,c]
 m=[np.zeros_like(p) for p in tensors]
 q=[np.zeros_like(p) for p in tensors]
 best,best_loss=None,float("inf")
 for step in range(1,steps+1):
  idx=rng.integers(0,len(x),size=min(32,len(x)))
  xb=x[idx];target=y[idx]
  h=np.tanh(xb@w+b);diff=h@u+c-target
  g=np.where(np.abs(diff)<=1,diff,np.sign(diff))/len(idx)
  hd=(g@u.T)*(1-h*h)
  grads=[xb.T@hd,hd.sum(axis=0),h.T@g,g.sum(axis=0)]
  for j,(param,grad) in enumerate(zip(tensors,grads)):
   m[j][:]=.9*m[j]+.1*grad
   q[j][:]=.999*q[j]+.001*grad*grad
   param-=.004*(m[j]/(1-.9**step))/(np.sqrt(q[j]/(1-.999**step))+1e-8)
  if step%25==0 or step==steps:
   validation_loss=float(np.mean(np.abs(np.tanh(v@w+b)@u+c-vtruth)))
   if validation_loss<best_loss:
    best_loss=validation_loss;best=[p.copy() for p in tensors]
 w,b,u,c=best
 predicted=np.exp((np.tanh(t@w+b)@u+c).ravel())
 by_cat=defaultdict(list)
 for row in training:by_cat[row["category"]].append(row["mid_twd"])
 medians={cat:statistics.median(prices) for cat,prices in by_cat.items()}
 general=statistics.median([r["mid_twd"] for r in training])
 baseline=[medians.get(r["category"],general) for r in testing]
 error=lambda pred:round(float(np.mean(np.abs(np.asarray(pred)-test_actual))),3)
 nn_mae,baseline_mae=error(predicted),error(baseline)
 stats={"optimizer_updates":steps,"train_records":len(training),
        "validation_records":len(validation),"heldout_records":len(testing),
        "neural_mae_twd":nn_mae,"category_median_mae_twd":baseline_mae,
        "neural_beats_baseline":nn_mae<baseline_mae,
        "released_to_production":False,"live_price_quotes":False,
        "qwen_lora_optimizer_updates":0}
 if output:
  output=Path(output)
  output.mkdir(parents=True,exist_ok=True)
  name=output/"model-ndc-public-twd.npz"
  np.savez_compressed(name,w=w,b=b,u=u,c=c,categories=np.array(cats))
  stats["model_sha256"]=hashlib.sha256(name.read_bytes()).hexdigest()
 return stats

def main(argv=None):
 ap=argparse.ArgumentParser()
 ap.add_argument("--input",required=True,type=Path)
 ap.add_argument("--output",required=True,type=Path)
 ap.add_argument("--train-neural",action="store_true")
 ap.add_argument("--steps",type=int,default=500)
 args=ap.parse_args(argv)
 if args.output.exists() and any(args.output.iterdir()):raise ValueError("OUTPUT_MUST_BE_NEW_EMPTY_DIRECTORY")
 observations,rejected,digest=read_prices(args.input)
 parts=group_split(observations)
 newest=max(r["date"] for r in observations)
 age=(date.today()-date.fromisoformat(newest)).days
 result={"source_dataset":OFFICIAL_DATASET,"download_url":OFFICIAL_CSV,
         "license":"Taiwan Open Government Data License v1",
         "input_sha256":digest,"country":"Taiwan","currency":"TWD",
         "rows_accepted":len(observations),"distinct_products":len({
             (r["category"],r["product"]) for r in observations}),
         "categories":len({r["category"] for r in observations}),
         "split_rows":{k:len(v) for k,v in parts.items()},
         "newest_observation":newest,"age_days":age,"current_reference_only":age<=14,
         "rejected":rejected,"merchant_identity_known":False,
         "comparison_site_price_rows":0,"qwen_weight_updates":0,
         "verified_origin_from_file_alone":False,
         "automatic_repricing_enabled":False,"neural_trained":False}
 args.output.mkdir(parents=True,exist_ok=True)
 if args.train_neural:
  try:
   result["calibration"]=train_model(parts,steps=args.steps,output=args.output)
   result["neural_trained"]=True
  except ValueError as err:
   result["calibration_status"]="SKIPPED_"+str(err)
 result_path=args.output/"report.json"
 result_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
 print("OCTUBER_TAIWAN_PRICE_CALIBRATION",json.dumps(result,ensure_ascii=False))
 return 0
if __name__=="__main__":
 raise SystemExit(main())
