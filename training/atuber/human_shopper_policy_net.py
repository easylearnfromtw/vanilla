#!/usr/bin/env python3
"""Tiny real neural policy from hypothetical shopper budgets + historical NDC prices.

Backpropagation/Adam genuinely change weights, but labels are RULE-DERIVED
from observed public price intervals, not real human purchase feedback.
No Qwen/Octuber language model fine-tune, no live retailer price prediction.
"""
from __future__ import annotations
import argparse,hashlib,json,math
from collections import Counter
from pathlib import Path
import numpy as np
from human_shopper_sim import read_official_ndc

CLASSES=["below-published-range","within-published-range","above-published-range"]

def _split(rows):
 # Group by product name across every historical date and every category.
 tr,val,holdout=[],[],[]
 for x in rows:
  key=x["product"].strip().casefold()
  bucket=int.from_bytes(hashlib.sha256(key.encode()).digest()[:4],"big")%100
  (holdout if bucket<15 else val if bucket<30 else tr).append(x)
 if min(len(tr),len(val),len(holdout))<200:
  raise ValueError("INSUFFICIENT_DISTINCT_PRICE_HISTORY")
 groups=[{r["product"].strip().casefold() for r in part} for part in (tr,val,holdout)]
 assert not (groups[0]&groups[1] or groups[0]&groups[2] or groups[1]&groups[2])
 return tr,val,holdout

def _dataset(source,n,rng):
 features=np.empty((n,5),dtype=np.float32)
 labels=np.empty(n,dtype=np.int64)
 products=set()
 for i in range(n):
  row=source[int(rng.integers(len(source)))]
  products.add(row["product"])
  lo,hi=row["lo"],row["hi"]
  midpoint=(lo+hi)/2
  budget=midpoint*float(rng.uniform(.65,1.40))  # synthetic preference, never a quote
  features[i]=[
     math.log(budget/lo),math.log(budget/hi),
     math.log(hi/lo),math.log1p(midpoint)/12,
     (budget-midpoint)/midpoint
  ]
  labels[i]=0 if budget<lo else 2 if budget>hi else 1
 return features,labels,len(products)

def learn(path,output,*,train_cases=50000,eval_cases=15000,steps=1000):
 if not 2000<=train_cases<=250000 or not 1000<=eval_cases<=100000:
  raise ValueError("POLICY_CASE_LIMIT")
 if not 20<=steps<=5000:raise ValueError("WEIGHT_STEP_LIMIT")
 source,digest,raw_rows=read_official_ndc(path)
 train_rows,validation_rows,heldout_rows=_split(source)
 rng=np.random.default_rng(20261025)
 x,y,distinct_train=_dataset(train_rows,train_cases,rng)
 z,expected,distinct_validation=_dataset(validation_rows,eval_cases,rng)
 holdout_x,holdout_labels,distinct_heldout=_dataset(heldout_rows,eval_cases,rng)
 weights=[
   rng.normal(0,.1,(5,24)).astype(np.float32),
   np.zeros(24,dtype=np.float32),
   rng.normal(0,.1,(24,3)).astype(np.float32),
   np.zeros(3,dtype=np.float32)
 ]
 first=[p.copy() for p in weights]
 m=[np.zeros_like(v) for v in weights];v=[np.zeros_like(p) for p in weights]
 best_weights,best_accuracy=None,-1.
 w,b,u,c=weights
 batchsize=min(256,len(x))
 for step in range(1,steps+1):
  batch=rng.integers(0,len(x),size=batchsize)
  xx,yy=x[batch],y[batch]
  hidden=np.tanh(xx@w+b)
  scores=hidden@u+c
  scores-=scores.max(axis=1,keepdims=True)
  softmax=np.exp(scores);softmax/=softmax.sum(axis=1,keepdims=True)
  softmax[np.arange(len(batch)),yy]-=1
  softmax/=len(batch)
  du=hidden.T@softmax
  dc=softmax.sum(axis=0)
  dh=(softmax@u.T)*(1-hidden*hidden)
  dw=xx.T@dh;db=dh.sum(axis=0)
  for ix,(parameter,gradient) in enumerate(zip(weights,(dw,db,du,dc))):
   m[ix][:]=.9*m[ix]+.1*gradient
   v[ix][:]=.999*v[ix]+.001*gradient*gradient
   parameter[:]-=.012*(m[ix]/(1-.9**step))/(np.sqrt(v[ix]/(1-.999**step))+1e-8)
  if step%50==0 or step==steps:
   predicted=np.argmax(np.tanh(z@w+b)@u+c,axis=1)
   acc=float(np.mean(predicted==expected))
   if acc>best_accuracy:
    best_accuracy=acc
    best_weights=[p.copy() for p in weights]
 # Final heldout product labels have NEVER been used for optimizer or checkpoint selection.
 holdout_pred=np.argmax(np.tanh(holdout_x@best_weights[0]+best_weights[1])@best_weights[2]+best_weights[3],axis=1)
 holdout_accuracy=float(np.mean(holdout_pred==holdout_labels))
 trained_change=float(np.sqrt(sum(np.sum((a-b)**2) for a,b in zip(best_weights,first))))
 if trained_change<=0:raise RuntimeError("NEURAL_WEIGHTS_NOT_UPDATED")
 output=Path(output)
 if output.exists() and any(output.iterdir()):raise ValueError("REFUSE_OVERWRITE_MODEL")
 output.mkdir(parents=True,exist_ok=True)
 model_file=output/"historical-shopper-range-policy.npz"
 np.savez_compressed(model_file,w=best_weights[0],b=best_weights[1],
                     u=best_weights[2],c=best_weights[3])
 majority=Counter(y).most_common(1)[0][0]
 baseline_acc=float(np.mean(holdout_labels==majority))
 report={
  "mode":"actual-neural-gradient-updates-on-synthetic-human-budget-labels",
  "model":"small-price-range-comparison-policy-not-a-market-forecast",
  "underlying_price_source":"official-NDC-Taiwan-historical-ranges",
  "input_sha256":digest,"raw_official_rows":raw_rows,
  "historical_valid_observations":len(source),
  "source_distinct_products":len({r["product"] for r in source}),
  "train_examples_from_simulated_preferences":len(x),
  "validation_examples_from_unseen_product_names":len(z),
  "test_examples_from_unseen_product_names":len(holdout_x),
  "underlying_unique_product_names_train":distinct_train,
  "underlying_unique_product_names_validation":distinct_validation,
  "underlying_unique_product_names_heldout":distinct_heldout,
  "actual_optimizer_steps":steps,
  "trainable_parameters":sum(p.size for p in best_weights),
  "weight_change_l2":round(trained_change,6),
  "range_decision_validation_accuracy":round(best_accuracy,6),
  "range_decision_true_heldout_accuracy":round(holdout_accuracy,6),
  "majority_baseline_validation_accuracy":round(baseline_acc,6),
  "validation_used_for_checkpoint_selection":True,
  "holdout_not_used_for_training_or_checkpoint_selection":True,
  "genuine_human_labels":0,
  "actual_biggo_feebee_lbj_training_quotes":0,
  "qwen_gradient_updates":0,
  "merchant_purchase_recommendation_enabled":False,
  "current_taiwan_price_estimator_enabled":False,
  "important":"Labels compare SYNTHETIC buyer budgets to REAL HISTORICAL published ranges; this does not teach 2026 marketplace prices.",
  "checkpoint_sha256":hashlib.sha256(model_file.read_bytes()).hexdigest()
 }
 (output/"policy-training-report.json").write_text(
   json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print("OCTUBER_REAL_POLICY_WEIGHTS",json.dumps(report,ensure_ascii=False))
 return report

def main(argv=None):
 p=argparse.ArgumentParser()
 p.add_argument("--input",type=Path,required=True)
 p.add_argument("--output",type=Path,required=True)
 p.add_argument("--train-cases",type=int,default=50000)
 p.add_argument("--validation-cases",type=int,default=15000)
 p.add_argument("--steps",type=int,default=1000)
 a=p.parse_args(argv)
 learn(a.input,a.output,train_cases=a.train_cases,
     eval_cases=a.validation_cases,steps=a.steps)

if __name__=="__main__":main()
