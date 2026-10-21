#!/usr/bin/env python3
"""October (阿土伯) supervised task-choice policy model. Synthetic data only.
Real PyTorch gradient-based weight training; this is NOT Qwen fine-tuning.
"""
from __future__ import annotations
import argparse, hashlib, json, random
from pathlib import Path
import torch
from torch import nn

LABELS = ('DENY','WAIT','ESCALATE','OPS_MONITOR','OPS_DIAGNOSE','BUSINESS_REPORT','BUSINESS_INVESTIGATE','PLUGIN_ANALYZE')
FEATURES = ('is_ops','is_business','is_plugin','tenant_match','scope_ok','due','privileged','sensitive','failure_rate_scaled','npv_margin','operating_margin','budget_fraction','latency_fraction','retry_fraction','anomaly_fraction')

def sample(rng):
    mode=rng.randrange(3)
    same=1 if rng.random()<0.86 else 0
    authorized=1 if rng.random()<0.84 else 0
    due=1 if rng.random()<0.85 else 0
    privileged=1 if rng.random()<0.09 else 0
    sensitive=1 if rng.random()<0.16 else 0
    failure=rng.random()*0.18
    npv=rng.uniform(-1,1)
    operating=rng.uniform(-1,1)
    budget=rng.random()
    latency=rng.random()
    retry=rng.randint(0,5)/5
    anomaly=rng.random()
    x=[int(mode==0),int(mode==1),int(mode==2),same,authorized,due,privileged,sensitive,
       failure/0.18,npv,operating,budget,latency,retry,anomaly]
    if not same or not authorized: y=0
    elif not due: y=1
    elif privileged or (sensitive and mode==2): y=2
    elif mode==0: y=4 if failure>0.08 else 3
    elif mode==1: y=6 if npv<0 or operating<0 else 5
    else: y=7
    return x,y

def build(seed,n):
    rng=random.Random(seed)
    examples=[sample(rng) for _ in range(n)]
    return (torch.tensor([x for x,_ in examples],dtype=torch.float32),
            torch.tensor([y for _,y in examples],dtype=torch.long))

class Policy(nn.Module):
    def __init__(self):
        super().__init__()
        self.network=nn.Sequential(nn.Linear(len(FEATURES),48),nn.ReLU(),
            nn.Linear(48,32),nn.ReLU(),nn.Linear(32,len(LABELS)))
    def forward(self,x): return self.network(x)

@torch.no_grad()
def measure(model,x,y):
    output=model(x);scores=output.argmax(1)
    return round(float((scores==y).float().mean().item()),5),round(float(nn.functional.cross_entropy(output,y).item()),5)

def export(model,path,metadata):
    state=[]
    for module in model.network:
        if isinstance(module,nn.Linear):
            state.append({'weight':module.weight.detach().cpu().tolist(),
                          'bias':module.bias.detach().cpu().tolist()})
    obj={'name':'October (阿土伯) Policy Head','kind':'trained-supervised-mlp',
         'architecture':'linear-relu-linear-relu-linear','features':FEATURES,'labels':LABELS,
         'layers':state,'metadata':metadata,
         'scope':'simulated action recommendation only; permissions enforced separately'}
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,separators=(',',':'),ensure_ascii=False)+'\n',encoding='utf-8')
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--output',default='training/october/weights/october-policy-v0.1.json')
    ap.add_argument('--epochs',type=int,default=55)
    ap.add_argument('--train-size',type=int,default=12000)
    args=ap.parse_args()
    if args.train_size<100 or args.epochs<1: raise ValueError('training must be meaningful')
    torch.set_num_threads(min(4,torch.get_num_threads()))
    torch.manual_seed(20261020)
    train_x,train_y=build(1001,args.train_size)
    valid_x,valid_y=build(2002,1600)
    blind_x,blind_y=build(3003,2000)
    model=Policy()
    baseline=measure(model,blind_x,blind_y)
    optim=torch.optim.AdamW(model.parameters(),lr=.007,weight_decay=1e-5)
    batches=256
    history=[]
    for epoch in range(args.epochs):
        model.train()
        order=torch.randperm(len(train_x))
        for start in range(0,len(order),batches):
            idx=order[start:start+batches]
            optim.zero_grad(set_to_none=True)
            loss=nn.functional.cross_entropy(model(train_x[idx]),train_y[idx])
            loss.backward()
            optim.step()
        model.eval()
        val_accuracy,val_loss=measure(model,valid_x,valid_y)
        history.append({'epoch':epoch+1,'validation_accuracy':val_accuracy,'validation_loss':val_loss})
    test_accuracy,test_loss=measure(model,blind_x,blind_y)
    report={'model':'October (阿土伯) Policy Head v0.1',
            'trained_parameters':sum(p.numel() for p in model.parameters()),
            'train_examples':len(train_x),'validation_examples':len(valid_x),'blind_test_examples':len(blind_x),
            'epochs':args.epochs,'baseline_blind_accuracy':baseline[0],
            'validation_accuracy':history[-1]['validation_accuracy'],
            'blind_test_accuracy':test_accuracy,'blind_test_cross_entropy':test_loss,
            'dataset':'synthetic generated decision labels; no financial facts or client data',
            'not_trained':'Qwen/Ollama foundation weights; finance domain knowledge; real-world execution',
            'last_epoch':history[-1]}
    sha=export(model,Path(args.output),report)
    report['weights_sha256']=sha
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': main()
