#!/usr/bin/env python3
"""Offline bibliographic catalogue sandbox; NOT book-text or GPU training."""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

CATALOGUES = {
    "nbinet": ("國家圖書館 NBINet 圖書聯合目錄", "https://data.gov.tw/dataset/7502", "OGDL-1.0: bibliographic metadata only"),
    "ncl": ("國家圖書館館藏書目資訊", "https://data.gov.tw/dataset/27311", "OGDL-1.0: bibliographic metadata only"),
    "ntl-export": ("國立臺灣圖書館館藏查詢系統人工匯出", "https://cis2.ntl.edu.tw/", "Unverified: catalogue-export terms and rights review required"),
}
TOPICS = ("economics", "finance", "stocks", "psychology", "philosophy")
WORDS = {
    "economics": ("經濟", "總體經", "個體經", "供需", "通貨膨脹", "貨幣政策", "economic", "economics", "macroeconomic", "microeconomic", "inflation", "econometrics"),
    "finance": ("金融", "銀行", "財務", "理財", "資產配置", "債券", "風險管理", "financ", "banking", "portfolio", "fixed income", "asset allocation", "risk management"),
    "stocks": ("股票", "股市", "證券", "選股", "台股", "臺股", "美股", "交易策略", "stock market", "stock trading", "equity investing", "securities", "technical analysis"),
    "psychology": ("心理", "認知偏誤", "情緒", "行為科學", "人格", "精神分析", "psycholog", "cognitive bias", "behavioral science", "behavioural science", "psychoanalysis"),
    "philosophy": ("哲學", "倫理學", "存在主義", "形上學", "知識論", "邏輯哲學", "philosoph", "ethics", "metaphysic", "epistemolog", "existentialism"),
}
ALIASES = {
    "title": ("題名", "書名", "正題名", "主題名", "title", "245$a$d", "245$a", "書名(245$a$d)", "書名 (245$a$d)", "mainTitle"),
    "author": ("作者", "編著者", "著者", "作者(Name)", "creator", "245$c", "編著者(245$c)", "編著者 (245$c)"),
    "isbn": ("isbn", "isbn (020$a)", "020$a"),
    "year": ("出版年", "出版年份", "年度", "出版年月", "createdyear", "008/07-10", "出版年(008/07-10)", "出版年 (008/07-10)"),
    "subject": ("主題", "主題詞", "關鍵字", "分類名稱", "subject", "keywords", "650$a"),
    "language": ("語文", "語文別", "語言", "language", "008/35-37"),
    "record": ("系統號", "nbi紀錄號 (907$a)", "nbi紀錄號(907$a)", "nbi紀錄號", "記錄號", "編號", "id"),
}

def norm(value):
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).strip().split())

def get(row, key):
    lookup = {re.sub(r"\s+", "", norm(k).lower()): norm(v) for k, v in row.items() if k is not None}
    for alias in ALIASES[key]:
        value = lookup.get(re.sub(r"\s+", "", norm(alias).lower()), "")
        if value:
            return value
    return ""

def detect_language(label, title):
    explicit = norm(label).lower()
    if explicit in {"chi","zho","zh","zh-tw","中文","漢語","國語","chinese","mandarin"}:
        return "zh", "catalogue"
    if explicit in {"eng","en","en-us","英文","英語","english"}:
        return "en", "catalogue"
    if explicit:
        return "unknown", "unrecognized-catalogue-language"
    chars = re.findall(r"[\u3400-\u9fff]|[A-Za-z]",title)
    han = len(re.findall(r"[\u3400-\u9fff]",title))
    latin = len(re.findall(r"[A-Za-z]",title))
    if len(chars)>=4 and han/len(chars)>=.8:
        return "zh", "title-inferred"
    if len(chars)>=9 and latin/len(chars)>=.95:
        return "en", "title-inferred"
    return "unknown", "unknown"

def classify(title, subject):
    lower = (title + " " + subject).casefold()
    return tuple(t for t in TOPICS if any(term.casefold() in lower for term in WORDS[t]))

def book_id(title, author, year, isbn):
    clean = re.sub(r"[^0-9X]", "", isbn.upper())
    key = "isbn:"+clean if len(clean) in (10,13) else "work:"+"|".join((title.casefold(), author.casefold(), year))
    return "book_"+hashlib.sha256(key.encode("utf-8")).hexdigest()[:24]

def input_rows(path):
    for encoding in ("utf-8-sig", "cp950"):
        try:
            with path.open("r",encoding=encoding,newline="") as stream:
                reader=csv.DictReader(stream)
                if not reader.fieldnames:
                    raise ValueError("CSV_HEADER_REQUIRED")
                yield from reader
            return
        except UnicodeDecodeError:
            continue
    raise ValueError("CSV_ENCODING_UNSUPPORTED")

def split_of(ident):
    x=int(hashlib.sha256(ident.encode()).hexdigest()[:8],16)%100
    return "holdout" if x<10 else "validation" if x<20 else "train-index"

def create_sandbox(csvs, output, source, topic_target, language_target, eval_max=200):
    if output.exists():
        raise ValueError("REFUSE_OVERWRITE_EXISTING_OUTPUT_DIRECTORY")
    if not csvs or any(not p.is_file() for p in csvs):
        raise ValueError("LOCAL_CSV_INPUTS_REQUIRED")
    if topic_target<1 or language_target<0 or eval_max<0:
        raise ValueError("TARGETS_INVALID")
    source_name,source_url,license_note=CATALOGUES[source]
    caps={t:topic_target//5+(i<topic_target%5) for i,t in enumerate(TOPICS)}
    languages={l:language_target//2+(i<language_target%2) for i,l in enumerate(("zh","en"))}
    counts,rejects=Counter(),Counter()
    output.mkdir(parents=True)
    try:
        con=sqlite3.connect(output/"catalog.sqlite3")
        try:
            con.executescript("""
              CREATE TABLE books (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT, isbn TEXT,
                publication_year TEXT, topic TEXT, matching_topics TEXT NOT NULL,
                language TEXT, language_evidence TEXT, quota_bucket TEXT NOT NULL,
                catalog_record_id TEXT, source_catalog TEXT NOT NULL, source_url TEXT NOT NULL,
                license_note TEXT NOT NULL, access_level TEXT NOT NULL CHECK(access_level='metadata-only'),
                training_approved INTEGER NOT NULL DEFAULT 0 CHECK(training_approved=0),
                split TEXT NOT NULL CHECK(split IN ('train-index','validation','holdout')));
              CREATE INDEX books_topic ON books(topic);
              CREATE INDEX books_language ON books(language);
              CREATE INDEX books_split ON books(split);
              CREATE INDEX books_isbn ON books(isbn);
            """)
            with con:
                for path in csvs:
                    for row in input_rows(path):
                        counts["rows_seen"]+=1
                        title=get(row,"title")
                        if not title or len(title)>500:
                            rejects["no_valid_title"]+=1
                            continue
                        author,isbn,year=get(row,"author"),get(row,"isbn"),get(row,"year")
                        ident=book_id(title,author,year,isbn)
                        if con.execute("SELECT 1 FROM books WHERE id=?",(ident,)).fetchone():
                            rejects["duplicate"]+=1
                            continue
                        matched=classify(title,get(row,"subject"))
                        lang,basis=detect_language(get(row,"language"),title)
                        remaining=[t for t in matched if counts["topic:"+t]<caps[t]]
                        if remaining:
                            category=min(remaining,key=lambda t:(counts["topic:"+t]/caps[t],TOPICS.index(t)))
                            bucket="topic"
                        elif lang in languages and counts["language:"+lang]<languages[lang]:
                            category,bucket=None,"language"
                        else:
                            rejects["out_of_scope_or_quota"]+=1
                            continue
                        con.execute("""INSERT INTO books
                          (id,title,author,isbn,publication_year,topic,matching_topics,language,
                           language_evidence,quota_bucket,catalog_record_id,source_catalog,source_url,
                           license_note,access_level,training_approved,split)
                          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                          (ident,title,author,isbn,year,category,json.dumps(matched,ensure_ascii=False),
                           lang,basis,bucket,get(row,"record"),source_name,source_url,license_note,
                           "metadata-only",0,split_of(ident)))
                        counts[bucket+":"+(category or lang)]+=1
                        counts["indexed_unique"]+=1
                        if all(counts["topic:"+t]>=caps[t] for t in TOPICS) and all(
                            counts["language:"+l]>=languages[l] for l in languages):
                            break
                    else:
                        continue
                    break
        finally:
            con.close()
        con=sqlite3.connect(output/"catalog.sqlite3")
        try:
            samples=con.execute("""SELECT id,title,author,topic,language,source_url FROM books
              WHERE split='holdout' AND author!='' ORDER BY id LIMIT ?""",(eval_max,)).fetchall()
        finally:
            con.close()
        with (output/"metadata_holdout.jsonl").open("x",encoding="utf-8") as f:
            for ident,title,author,topic,lang,url in samples:
                f.write(json.dumps({"id":ident,"task":"metadata-attribution",
                   "question":f"依據已核對的圖書書目，請回答《{title}》的作者；請勿推測書內主張。",
                   "expected_author":author,"topic":topic,"language":lang,
                   "source_url":url,"scope":"bibliographic-metadata-only","not_weight_training":True},
                   ensure_ascii=False)+"\n")
        report={
            "status":"catalog-index-built-not-model-trained",
            "generated_utc":datetime.now(timezone.utc).isoformat(),
            "source_name":source_name,"source_url":source_url,"license_note":license_note,
            "input_files":[str(p) for p in csvs],
            "targets":{"topics_total":topic_target,"per_topic":caps,
                       "language_total":language_target,"per_language":languages},
            "actual":{"topic_counts":{t:counts["topic:"+t] for t in TOPICS},
                      "language_extension_counts":{l:counts["language:"+l] for l in languages},
                      "indexed_unique":counts["indexed_unique"],"raw_rows_seen":counts["rows_seen"],
                      "holdout_question_count":len(samples)},
            "rejected":dict(rejects),
            "targets_reached":sum(counts["topic:"+t] for t in TOPICS)==topic_target and
                              sum(counts["language:"+l] for l in languages)==language_target,
            "book_full_texts_read":0,"weight_updates":0,"training_approved_count":0,
            "catalogue_metadata_is_not_book_contents":True,
            "next_step":"Rights-cleared full text, reviewed Q/A and approved GPU run are required for weight training",
        }
        (output/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        return report
    except BaseException:
        import shutil
        shutil.rmtree(output)
        raise

def main(argv=None):
    p=argparse.ArgumentParser(description="Atuber offline catalogue sandbox (not weight training)")
    p.add_argument("--csv",type=Path,action="append",required=True)
    p.add_argument("--source",choices=tuple(CATALOGUES),default="nbinet")
    p.add_argument("--output",type=Path,required=True)
    p.add_argument("--topic-target",type=int,default=100000)
    p.add_argument("--language-target",type=int,default=10000)
    p.add_argument("--eval-max",type=int,default=200)
    p.add_argument("--execute",action="store_true",help="Explicitly index local CSV; no network")
    a=p.parse_args(argv)
    if not a.execute:
        print(json.dumps({"status":"dry-run",
          "targets":{"topics":a.topic_target,"zh_en":a.language_target},
          "network_requests":0,"training_completed":False,
          "would_read":[str(p) for p in a.csv]},ensure_ascii=False))
        return 0
    print(json.dumps(create_sandbox(a.csv,a.output,a.source,a.topic_target,
                                   a.language_target,a.eval_max),ensure_ascii=False,indent=2))
    return 0

if __name__=="__main__":
    sys.exit(main())
