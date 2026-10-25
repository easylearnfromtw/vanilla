"""Neural policy is really optimized, but *shopper labels are synthetic*."""
import csv,json,sys,tempfile,unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from human_shopper_policy_net import learn,_split
from human_shopper_sim import read_official_ndc

class ShopperPolicyWeightTests(unittest.TestCase):
 def test_true_adam_weight_update_and_independent_product_holdout(self):
  with tempfile.TemporaryDirectory() as tmp:
   input=Path(tmp)/"source.csv"
   with input.open("w",encoding="utf-8",newline="") as file:
    csvwrite=csv.DictWriter(file,fieldnames=["日期","商品類別","商品名稱","最低價格","最高價格"])
    csvwrite.writeheader()
    for i in range(1200):
     # TEST ONLY: fabricated examples, never market quotes or production training.
     csvwrite.writerow({"日期":"2024-11-10","商品類別":f"測試分類{i%10}",
       "商品名稱":f"TEST_SAMPLE_ONLY_{i:05d}",
       "最低價格":str(30+i%201),"最高價格":str(40+i%201)})
   source,_,_=read_official_ndc(input)
   train,val,held=_split(source)
   labels=lambda rows:{r["product"] for r in rows}
   self.assertFalse(labels(train)&labels(val))
   self.assertFalse(labels(train)&labels(held))
   self.assertFalse(labels(val)&labels(held))
   output=Path(tmp)/"model"
   report=learn(input,output,train_cases=2000,eval_cases=1000,steps=100)
   self.assertEqual(report["actual_optimizer_steps"],100)
   self.assertGreater(report["weight_change_l2"],0)
   self.assertEqual(report["qwen_gradient_updates"],0)
   self.assertEqual(report["genuine_human_labels"],0)
   self.assertFalse(report["merchant_purchase_recommendation_enabled"])
   self.assertTrue((output/"historical-shopper-range-policy.npz").is_file())
   with np.load(output/"historical-shopper-range-policy.npz") as weights:
    self.assertEqual(weights["w"].shape,(5,24))
   with self.assertRaisesRegex(ValueError,"REFUSE_OVERWRITE"):
    learn(input,output,train_cases=2000,eval_cases=1000,steps=50)

if __name__=="__main__":unittest.main()
