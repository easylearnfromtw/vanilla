#!/usr/bin/env python3
"""OpenAlex + arXiv metadata and licensed-fulltext corpus preparation.
Citation weight never excludes training material. No neural training here.
"""
import argparse, hashlib, json, os, sys, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone
from priority import citation_priority, load_rankings, load_authorities, normalize_id, training_rights

ATOM='{http://www.w3.org/2005/Atom}'
AX='{http://arxiv.org/schemas/atom}'

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Vanilla-Scholarly/1.0'})
    with urllib.request.urlopen(req,timeout=25) as response:
        if urllib.parse.urlsplit(response.geturl()).scheme!='https':
            raise ValueError('HTTPS_ONLY')
        data=response.read(5_000_001)
    if len(data)>5_000_000: raise ValueError('SOURCE_TOO_LARGE')
    return data

def openalex_records(raw):
    works=json.loads(raw) if isinstance(raw,(bytes,str)) else raw
    output=[]
    for work in works.get('results',[]):
        if not work.get('id') or not work.get('title'): continue
        institutions={}; orcids=[]
        for authored in work.get('authorships') or []:
            author=authored.get('author') or {}
            if author.get('orcid'): orcids.append(author['orcid'])
            for inst in authored.get('institutions') or []:
                if inst.get('ror') or inst.get('id'):
                    institutions[str(inst.get('ror') or inst.get('id'))]={
                        'ror':inst.get('ror'),'openalex_id':inst.get('id'),
                        'type':inst.get('type'),'display_name':inst.get('display_name')}
        output.append({'openalex_id':work['id'],'doi':work.get('doi'),
                       'title':work['title'],'publication_year':work.get('publication_year'),
                       'institutions':list(institutions.values()),'author_orcids':orcids,
                       'metadata_sources':['openalex'],
                       'reported_oa':bool((work.get('open_access') or {}).get('is_oa'))})
    return output

def arxiv_records(raw):
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('XML_DTD_FORBIDDEN')
    result=[]
    for e in ET.fromstring(raw).findall(ATOM+'entry'):
        ident=normalize_id(e.findtext(ATOM+'id'))
        title=' '.join((e.findtext(ATOM+'title') or '').split())
        if not ident or not title: continue
        year=(e.findtext(ATOM+'published') or '')[:4]
        result.append({'arxiv_id':ident,'doi':e.findtext(AX+'doi'),'title':title,
                       'publication_year':int(year) if year.isdecimal() else None,
                       'institutions':[],'author_orcids':[],
                       'metadata_sources':['arxiv'],'reported_oa':True,
                       'reported_oa_license':e.findtext(AX+'license')})
    return result

def merge(records):
    out={}
    for row in records:
        key=normalize_id(row.get('doi')) or normalize_id(row.get('openalex_id')) or normalize_id(row.get('arxiv_id'))
        if not key: continue
        if key not in out: out[key]=dict(row);continue
        old=out[key]
        old['metadata_sources']=sorted(set(old.get('metadata_sources',[])+row.get('metadata_sources',[])))
        for k in ('doi','arxiv_id','openalex_id','reported_oa_license'):
            if not old.get(k) and row.get(k):old[k]=row[k]
        for i in row.get('institutions',[]):
            if i not in old.get('institutions',[]):old.setdefault('institutions',[]).append(i)
    return list(out.values())

def attach_rights(records,path):
    if not path:return
    lookup={}
    for row in records:
        for k in ('doi','arxiv_id','openalex_id'):
            ident=normalize_id(row.get(k))
            if ident:lookup.setdefault(ident,[]).append(row)
    for line,raw in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
        if not raw.strip():continue
        item=json.loads(raw)
        matches=lookup.get(normalize_id(item.get('match_id')),[])
        if len(matches)!=1 or 'fulltext' in matches[0]:
            raise ValueError(f'FULLTEXT_MATCH_INVALID_LINE_{line}')
        for k in ('fulltext','license','fulltext_source_url','rights_reference','rights_reviewer','rights_verified'):
            matches[0][k]=item.get(k)

def main(argv=None):
    ap=argparse.ArgumentParser(description='OpenAlex + arXiv priority and rights-reviewed corpus prep')
    ap.add_argument('--rankings-csv',type=Path,required=True)
    ap.add_argument('--authorities',type=Path)
    ap.add_argument('--openalex-query',default='')
    ap.add_argument('--arxiv-query',default='')
    ap.add_argument('--openalex-json',type=Path)
    ap.add_argument('--arxiv-xml',type=Path)
    ap.add_argument('--fulltext-manifest',type=Path)
    ap.add_argument('--max-results',type=int,default=20)
    ap.add_argument('--output-prefix',type=Path,required=True)
    ap.add_argument('--execute',action='store_true')
    a=ap.parse_args(argv)
    if not 1<=a.max_results<=100:ap.error('max-results must be 1-100')
    if not any((a.openalex_query,a.arxiv_query,a.openalex_json,a.arxiv_xml)):
        ap.error('Need at least one OpenAlex / arXiv source')
    targets=[Path(str(a.output_prefix)+ext) for ext in ('.index.jsonl','.training-candidates.jsonl','.report.json')]
    if any(p.exists() for p in targets):raise ValueError('REFUSE_OVERWRITE_CORPUS')
    if not a.execute:
        print(json.dumps({'status':'dry-run','network_requested':bool(a.openalex_query or a.arxiv_query),
                          'training_completed':False}))
        return 0
    rankings=load_rankings(a.rankings_csv)
    authorities=load_authorities(a.authorities)
    records=[]
    if a.openalex_json:records+=openalex_records(a.openalex_json.read_bytes())
    if a.arxiv_xml:records+=arxiv_records(a.arxiv_xml.read_bytes())
    if a.openalex_query:
        params={'search':a.openalex_query[:180],'per-page':str(a.max_results),
                'select':'id,doi,title,publication_year,authorships,open_access'}
        if os.getenv('OPENALEX_API_KEY'):params['api_key']=os.environ['OPENALEX_API_KEY']
        records+=openalex_records(fetch('https://api.openalex.org/works?'+urllib.parse.urlencode(params)))
    if a.arxiv_query:
        params={'search_query':'all:'+a.arxiv_query[:180],'start':0,'max_results':a.max_results}
        records+=arxiv_records(fetch('https://export.arxiv.org/api/query?'+urllib.parse.urlencode(params)))
    records=merge(records)
    attach_rights(records,a.fulltext_manifest)
    indexed=[];training=[]
    for paper in records:
        rights=training_rights(paper)
        row={**paper,**citation_priority(paper,rankings,authorities),**rights}
        fulltext=row.pop('fulltext','')
        indexed.append(row)
        if rights['fulltext_training_eligible']:
            training.append({**row,'fulltext':fulltext,'fulltext_sha256':hashlib.sha256(fulltext.encode()).hexdigest()})
    for path,rows in ((targets[0],indexed),(targets[1],training)):
        path.parent.mkdir(parents=True,exist_ok=True)
        with path.open('x',encoding='utf-8') as file:
            for row in rows:file.write(json.dumps(row,ensure_ascii=False)+'\n')
    report={'status':'corpus-prepared-no-llm-training','generated_utc':datetime.now(timezone.utc).isoformat(),
            'metadata_count':len(indexed),'fulltext_training_candidates':len(training),
            'citation_weights':{str(i):sum(x['citation_weight']==i for x in indexed) for i in range(1,6)},
            'model_weight_updates':0,'primary_sources':['openalex','arxiv']}
    with targets[2].open('x',encoding='utf-8') as file:json.dump(report,file,ensure_ascii=False,indent=2)
    print(json.dumps(report,ensure_ascii=False))
    return 0

if __name__=='__main__':sys.exit(main())
