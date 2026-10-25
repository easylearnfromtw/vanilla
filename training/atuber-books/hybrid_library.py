#!/usr/bin/env python3
"""All *available rights-cleared* full texts + every supplied catalogue metadata row.

Offline SQLite hybrid retrieval; non-authorized books remain metadata-only.
Never download ebooks, covers, private data, or weight files. Source citations
refer to actual evidence and mark dataset-level bibliographic references.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import re
import sqlite3
import unicodedata
from collections import Counter
from pathlib import Path
from catalog_sandbox import get as catalog_field, book_id as catalog_book_id, detect_language, classify

SYNONYMS = {
 "通膨": ("通貨膨脹", "inflation"), "通貨膨脹": ("通膨", "inflation"),
 "物價上漲": ("通貨膨脹", "inflation"),
 "股市": ("股票", "證券", "stock"), "股票": ("股市", "證券", "equity"),
 "理財": ("金融", "資產配置", "finance"), "金融": ("財務", "finance"),
 "心理": ("心理學", "psychology"), "行為經濟": ("behavioral economics", "行為經濟學"),
 "哲學": ("philosophy", "倫理學"), "倫理": ("ethics", "哲學"),
 "分工": ("division of labour", "division of labor"), "勞動分工": ("division of labour",),
 "美德": ("virtue",), "inflation": ("通貨膨脹", "通膨"),
 "stocks": ("股票", "equity"), "stock market": ("股票", "股市"),
 "division of labor": ("division of labour", "分工"),
 "division of labour": ("division of labor", "分工"),
}
MAX_QUERY = 160
MAX_RESULTS = 15
MAX_CANDIDATES = 1500

def norm(s):
    return " ".join(unicodedata.normalize("NFKC",str(s or "")).casefold().split())

def terms(s):
    return re.findall(r"[\u3400-\u9fff]|[a-z0-9]+", norm(s))

def grams(s):
    # Character ngrams for Chinese/English titles and minor typo tolerance.
    t="".join(terms(s))
    if not t:
        return set()
    return set(t[i:i+n] for n in (2,3) for i in range(max(0,len(t)-n+1))) or {t}

def isbn_value(raw):
    cleaned=re.sub(r"[^0-9X]","",str(raw or "").upper())
    return cleaned if len(cleaned) in (10,13) else ""

def cover_reference(isbn):
    isbn=isbn_value(isbn)
    if not isbn:
        return None
    return {
       "image_url":"https://covers.openlibrary.org/b/isbn/"+isbn+"-M.jpg?default=false",
       "image_source":"Open Library Covers API · on-demand",
       "image_lookup_url":"https://openlibrary.org/isbn/"+isbn,
       "status":"unverified-until-image-load",
       "license_note":"Show on demand only; verify rights if redistributing."
    }

def create_index(catalogs,contents,output,raw_csvs=()):
    """Index *all records supplied*; supports many metadata/content databases.
    Output private. Runtime/memory scale depends on SQLite disk and indexes.
    """
    if output.exists():
        raise ValueError("REFUSE_OVERWRITE_LIBRARY_INDEX")
    if not catalogs and not contents and not raw_csvs:
        raise ValueError("AT_LEAST_ONE_LOCAL_SOURCE_DATABASE_REQUIRED")
    sources=[Path(x) for x in (list(catalogs)+list(contents)+list(raw_csvs))]
    if any(not p.is_file() for p in sources):
        raise ValueError("SOURCE_DATABASE_NOT_PRESENT")
    output.parent.mkdir(parents=True,exist_ok=True)
    con=sqlite3.connect(output)
    try:
        con.executescript("""
        PRAGMA foreign_keys=ON;
        CREATE TABLE books(
          id TEXT PRIMARY KEY,title TEXT NOT NULL,author TEXT,isbn TEXT,
          source_url TEXT NOT NULL,source_scope TEXT NOT NULL,
          rights_scope TEXT NOT NULL,topic TEXT,language TEXT);
        CREATE TABLE title_grams(gram TEXT NOT NULL,book_id TEXT NOT NULL);
        CREATE INDEX grams_idx ON title_grams(gram,book_id);
        CREATE INDEX book_isbn ON books(isbn);
        CREATE TABLE paragraphs(
          id TEXT PRIMARY KEY,book_id TEXT NOT NULL,offset INTEGER,
          body TEXT NOT NULL,body_sha256 TEXT NOT NULL,
          FOREIGN KEY(book_id) REFERENCES books(id));
        CREATE INDEX paragraph_book_idx ON paragraphs(book_id);
        CREATE VIRTUAL TABLE paragraphs_fts USING fts5(
          body,chunk_id UNINDEXED,tokenize='trigram');
        """)
        counts=Counter()
        known=set()
        def add_book(identifier,title,author,isbn,url,scope,rights,topic="",language=""):
            if identifier in known:
                counts["duplicate_ids"]+=1
                return False
            if not isinstance(title,str) or not title.strip():
                counts["missing_title"]+=1
                return False
            known.add(identifier)
            con.execute("INSERT INTO books VALUES(?,?,?,?,?,?,?,?,?)",
                        (identifier,title,author,isbn,url,scope,rights,topic,language))
            # Unique per title: prevent repeated gram counts gaming ranking.
            encoded=grams(title+" "+(author or "")+" "+(topic or ""))
            con.executemany("INSERT INTO title_grams VALUES(?,?)",
                            ((g,identifier) for g in encoded))
            counts[scope]+=1
            return True
        with con:
            for file in catalogs:
                db=sqlite3.connect(Path(file).resolve().as_uri()+"?mode=ro",uri=True)
                try:
                    rows=db.execute("""SELECT id,title,author,isbn,source_url,topic,language
                    FROM books ORDER BY id""")
                    for row in rows:
                        ident,title,author,isbn,url,topic,language=row
                        add_book("meta:"+ident,title,author,isbn,url or "",
                                 "catalogue-dataset","metadata-only",topic or "",language or "")
                finally:
                    db.close()
            for file in raw_csvs:
                from catalog_sandbox import input_rows
                for row in input_rows(Path(file)):
                    title=catalog_field(row,"title")
                    if not title or len(title)>500:
                        continue
                    author=catalog_field(row,"author")
                    isbn=catalog_field(row,"isbn")
                    year=catalog_field(row,"year")
                    ident=catalog_book_id(title,author,year,isbn)
                    language,_=detect_language(catalog_field(row,"language"),title)
                    topic=",".join(classify(title,catalog_field(row,"subject")))
                    add_book("meta:"+ident,title,author,isbn,
                        "https://data.gov.tw/dataset/7502",
                        "catalogue-dataset","metadata-only",topic,language)
            for file in contents:
                db=sqlite3.connect(Path(file).resolve().as_uri()+"?mode=ro",uri=True)
                try:
                    for ident,title,author,url,basis in db.execute(
                        "SELECT id,title,author,source_url,rights_basis FROM books ORDER BY id"):
                        if not basis:
                            raise ValueError("RIGHTS_BASIS_NOT_RECORDED")
                        source_id="full:"+ident
                        added=add_book(source_id,title,author,"",url or "",
                                      "verified-book-edition","rights-reviewed-fulltext")
                        if not added:
                            continue
                        for chunk_id,pos,body,digest in db.execute(
                                "SELECT id,position,body,body_sha256 FROM chunks WHERE book_id=? ORDER BY position",
                                (ident,)):
                            if hashlib.sha256(body.encode()).hexdigest()!=digest:
                                raise ValueError("CONTENT_CHUNK_HASH_INVALID")
                            cid="full:"+chunk_id
                            con.execute("INSERT INTO paragraphs VALUES(?,?,?,?,?)",
                                        (cid,source_id,pos,body,digest))
                            con.execute("INSERT INTO paragraphs_fts(body,chunk_id) VALUES (?,?)",
                                        (body,cid))
                            counts["fulltext_passages"]+=1
                finally:
                    db.close()
        report={
            "state":"local-library-hybrid-index-built",
            "catalogue_only_records":counts["catalogue-dataset"],
            "rights_cleared_fulltext_books":counts["verified-book-edition"],
            "fulltext_passages":counts["fulltext_passages"],
            "unique_entry_total":len(known),
            "all_supplied_sources_indexed":True,
            "all_catalogue_books_have_fulltext":False,
            "book_content_training_steps":0,
            "covers_downloaded":0,
            "input_catalogues":[str(x) for x in catalogs],
            "input_raw_catalogue_csvs":[str(x) for x in raw_csvs],
            "input_content_databases":[str(x) for x in contents],
            "metadata_vs_fulltext_distinguished":True
        }
        output.with_suffix(".report.json").write_text(
            json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        return report
    except BaseException:
        con.close()
        output.unlink(missing_ok=True)
        raise
    finally:
        con.close()

def variants(query):
    q=norm(query)
    found=[q]
    for key,alts in SYNONYMS.items():
        if norm(key) in q:
            found.extend(norm(a) for a in alts)
    return list(dict.fromkeys(found))[:12]

def fuzzy_score(query,title,author="",topic=""):
    q=norm(query)
    if not q:
        return 0
    t=norm(" ".join([title,author,topic]))
    if q in t:
        return 3.0 + min(len(q)/max(1,len(t)),1)
    a,b=grams(q),grams(t)
    if not a or not b:
        return 0
    common=len(a&b)
    return (2.0*common/max(1,len(a))) + common/max(1,len(a|b))

def excerpt_for(body,query,expanded,maxlen=210):
    low=body.casefold()
    pos=next((low.find(q) for q in [query]+expanded if len(q)>=2 and low.find(q)>=0),-1)
    if pos<0:
        pos=0
    left=max(0,pos-55)
    return ("…" if left else "")+body[left:left+maxlen].replace("\n"," ") + ("…" if left+maxlen<len(body) else "")

def search(index,query,limit=8,ranker_file=None):
    if not index.is_file() or not 2<=len(query.strip())<=MAX_QUERY or not 1<=limit<=MAX_RESULTS:
        raise ValueError("LIBRARY_INDEX_QUERY_OR_LIMIT_INVALID")
    alt=variants(query)
    ranker_weights=None
    if ranker_file is not None:
        parsed=json.loads(Path(ranker_file).read_text(encoding="utf-8"))
        if parsed.get("version")!="atuber-fuzzy-book-ranker-v1" or not isinstance(parsed.get("weights"),list) or len(parsed["weights"])!=6:
            raise ValueError("UNRECOGNIZED_BOOK_RELEVANCE_RANKER")
        ranker_weights=[float(w) for w in parsed["weights"]]
    qgrams=set().union(*(grams(item) for item in alt))
    candidates={}
    db=sqlite3.connect(index.resolve().as_uri()+"?mode=ro",uri=True)
    try:
        if qgrams:
            keys=sorted(qgrams)[:80]
            placeholders=",".join(["?"]*len(keys))
            rows=db.execute(f"""SELECT book_id,COUNT(DISTINCT gram) AS hits
               FROM title_grams WHERE gram IN ({placeholders})
               GROUP BY book_id ORDER BY hits DESC LIMIT ?""",(*keys,MAX_CANDIDATES)).fetchall()
            candidates.update({book:float(hits) for book,hits in rows})
        # Match full-text by FTS5 on literal phrases, never construct operators from user string.
        passage_hits=[]
        for phrase in alt[:8]:
            compact="".join(terms(phrase))
            if len(compact)<3:
                continue
            # Strictly quote user text: cannot inject SQLite FTS5 operators.
            safe=phrase.replace('"','').strip()
            if not safe:
                continue
            try:
                rows=db.execute("""SELECT chunk_id,body FROM paragraphs_fts
                    WHERE paragraphs_fts MATCH ? LIMIT 80""",('"'+safe+'"',)).fetchall()
                passage_hits.extend((cid,body,phrase) for cid,body in rows)
            except sqlite3.OperationalError:
                continue
        if not passage_hits:
            # Only bounded fallback for short exact terms.
            for phrase in alt[:5]:
                if len(phrase)<2:
                    continue
                pattern="%"+phrase.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%"
                rows=db.execute("""SELECT id,body FROM paragraphs
                    WHERE body LIKE ? ESCAPE '\\' LIMIT 50""",(pattern,)).fetchall()
                passage_hits.extend((cid,body,phrase) for cid,body in rows)
        grouped={}
        if passage_hits:
            wanted=sorted({cid for cid,*_ in passage_hits})
            # Bind parameters, no user SQL.
            for start in range(0,len(wanted),200):
                batch=wanted[start:start+200]
                placeholders=",".join("?" for _ in batch)
                rows=db.execute(f"""SELECT p.id,p.book_id,p.offset,p.body,p.body_sha256
                                  FROM paragraphs p WHERE p.id IN ({placeholders})""",batch).fetchall()
                for chunk_id,book_id,offset,body,digest in rows:
                    matched=next((phrase for cid,_,phrase in passage_hits if cid==chunk_id),query)
                    s=max(fuzzy_score(phrase,body) for phrase in alt)
                    if s>0 and (book_id not in grouped or s>grouped[book_id]["score"]):
                        grouped[book_id]={"score":s,"chunk_id":chunk_id,"position":offset,
                                         "body":body,"sha256":digest,"matched_term":matched}
                    candidates[book_id]=max(candidates.get(book_id,0),2)
        if not candidates:
            return {"query":query,"items":[],"count":0,
                    "status":"no-grounded-book-match","llm_weight_updates":0}
        chosen=list(candidates)[:MAX_CANDIDATES]
        details=[]
        for start in range(0,len(chosen),250):
            batch=chosen[start:start+250]
            rows=db.execute("SELECT * FROM books WHERE id IN ("+",".join("?" for _ in batch)+")",batch)
            details.extend(rows.fetchall())
    finally:
        db.close()
    scored=[]
    for ident,title,author,isbn,url,scope,rights,topic,language in details:
        lexical=max(fuzzy_score(phrase,title,author or "",topic or "") for phrase in alt)
        match=grouped.get(ident)
        # Unambiguous full text evidence wins without pretending metadata has full text.
        score=lexical+ (2.0+match["score"] if match else 0)
        if ranker_weights is not None:
            from fuzzy_relevance_train import vec,score as learned_score
            score+=2.0*max(learned_score(ranker_weights,vec(v,title,author or "",topic or ""))
                           for v in alt)
        if score<0.3:
            continue
        item={
            "book_id":ident,"title":title,"author":author,"isbn":isbn or None,
            "topic":topic or None,"language":language or None,
            "score":round(score,5),
            "match_type":"cited-fulltext" if match else "bibliographic-title-fuzzy",
            "availability":"rights-reviewed-fulltext" if match or rights=="rights-reviewed-fulltext" else "metadata-only",
            "source_url":url,
            "source_scope":scope,
            "citation_scope":"original-text-passage" if match else "catalogue-dataset-reference",
            "cover":cover_reference(isbn),
            "evidence":None if not match else {
                 "chunk_id":match["chunk_id"],"offset":match["position"],
                 "excerpt":excerpt_for(match["body"],query,alt),
                 "content_sha256":match["sha256"]
            },
        }
        scored.append(item)
    scored.sort(key=lambda row:(-row["score"],row["book_id"]))
    return {"query":query,"items":scored[:limit],"count":min(len(scored),limit),
            "status":"grounded-metadata-or-excerpt-results" if scored else "no-grounded-book-match",
            "llm_weight_updates":0,"image_policy":"on-demand-ISBN-cover-only; no bulk downloading"}

def markdown_cards(result):
    """Machine-produced *source-grounded* book refs for Vanilla ChatMarkdown."""
    return "~~~bookrefs\n"+json.dumps({"protocol":"atuber-bookrefs-v1",
           "origin":"local-index-exact-result",
           "books":result["items"]},ensure_ascii=False)+"\n~~~"

def main(argv=None):
    p=argparse.ArgumentParser(description="Offline, rights-scoped book citation/search index")
    p.add_argument("--catalogue",type=Path,action="append",default=[])
    p.add_argument("--raw-csv",type=Path,action="append",default=[])
    p.add_argument("--content-index",type=Path,action="append",default=[])
    p.add_argument("--output",type=Path)
    p.add_argument("--index",type=Path)
    p.add_argument("--query",default="")
    p.add_argument("--limit",type=int,default=8)
    p.add_argument("--markdown-cards",action="store_true")
    p.add_argument("--ranker",type=Path)
    p.add_argument("--execute",action="store_true")
    a=p.parse_args(argv)
    if a.query:
        if not a.index:
            p.error("--index required for search")
        result=search(a.index,a.query,a.limit,a.ranker)
        print(markdown_cards(result) if a.markdown_cards else json.dumps(result,ensure_ascii=False,indent=2))
        return 0
    if not a.output:
        p.error("--output required to build index")
    if not a.execute:
        print(json.dumps({"state":"dry-run","covers_downloaded":0,"all_books_fulltext_claim":False},ensure_ascii=False))
        return 0
    print(json.dumps(create_index(a.catalogue,a.content_index,a.output,a.raw_csv),ensure_ascii=False,indent=2))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
