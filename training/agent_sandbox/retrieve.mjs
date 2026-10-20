#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const corpus=JSON.parse(readFileSync(join(here,'knowledge.json'),'utf8'));
const args=process.argv.slice(2);
const query=args.filter(x=>!x.startsWith('--') && !/^\d+$/.test(x)).join(' ').trim();
const chat=args.includes('--chat');
const modelAt=args.indexOf('--model');
const model=modelAt>=0?args[modelAt+1]:'signwell-agent:0.1';
function grams(s){const clean=s.toLowerCase().replace(/[\s,，。:：；;()（）]/g,'');const out=new Set();for(let i=0;i<clean.length-1;i++)out.add(clean.slice(i,i+2));return out;}
function search(query,limit=5){
 const q=query.toLowerCase(),qs=grams(query);
 const scored=corpus.modules.map(m=>{
  let score=0;
  for(const kw of m.keywords){if(q.includes(kw.toLowerCase()))score+=8;}
  if(q.includes(m.id.toLowerCase()) || q.includes(m.title.toLowerCase()))score+=20;
  const text=[m.title,m.meaning,m.formula,m.assumption,m.domain,m.topic].join(' ');
  const ts=grams(text);for(const t of qs)if(ts.has(t))score+=1;
  return {...m,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return scored.slice(0,limit);
}
if(!query){console.error('Usage: node retrieve.mjs [--chat] [--model modelname] "金融問題"');process.exit(2);}
const matched=search(query);
const context=matched.map(c=>JSON.stringify({topic:c.title,formula:c.formula,meaning:c.meaning,assumptions:c.assumption})).join('\n');
if(!chat){console.log(JSON.stringify({query,results:matched},null,2));process.exit(0);}
const messages=[
 {role:'system',content:'你是 Sign Well 財經營精算沙盤助手。僅使用提供的知識片段與問題數據；缺乏資訊時說明限制。所有數值都要註明計算、單位與假設。不可聲稱已執行任何工具、交易或會計申報。\n'+context},
 {role:'user',content:query}
];
try{
 const result=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages,stream:false}),signal:AbortSignal.timeout(180000)});
 if(!result.ok)throw Error('Ollama HTTP '+result.status);
 const body=await result.json();console.log(body.message?.content || 'No message');
}catch(e){console.error('Ollama unavailable: '+e.message);process.exit(1);}
