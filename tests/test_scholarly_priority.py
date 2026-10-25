"""Offline tests for OpenAlex/arXiv paper priority, rights and dedup. No live API."""
import json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'training'/'scholarly'))
from priority import rank_weight, citation_priority, training_rights, load_rankings, load_authorities
from prepare import openalex_records, arxiv_records, merge

class AcademicPriorityTest(unittest.TestCase):
    def test_rank_boundaries(self):
        items=[1,100,101,300,301,500,501,700,701,None]
        self.assertEqual([rank_weight(x) for x in items],[5,5,4,4,3,3,2,2,1,1])
    def test_university_and_unknown(self):
        ranks={'ror:01abcde12':100,'ror:02abcde12':450}
        uni={'institutions':[{'ror':'https://ror.org/02abcde12','type':'education'},
                              {'ror':'https://ror.org/01abcde12','type':'education'}]}
        self.assertEqual(citation_priority(uni,ranks)['citation_weight'],5)
        self.assertEqual(citation_priority({'institutions':[{'type':'education'}]},ranks)['citation_weight'],1)
        self.assertEqual(citation_priority({'institutions':[]},ranks)['citation_weight'],1)
    def test_nonuniversity_audit(self):
        with tempfile.TemporaryDirectory() as d:
            file=Path(d)/'authorities.jsonl'
            file.write_text(json.dumps({'match_id':'doi:10.1234/ex','category':'established_theory',
                                         'evidence_url':'https://example.org/verified',
                                         'reviewer':'Auditor','verified':True}),encoding='utf8')
            paper={'doi':'10.1234/ex','institutions':[{'type':'company'}]}
            self.assertEqual(citation_priority(paper,{},load_authorities(file))['citation_weight'],5)
            self.assertEqual(citation_priority({'doi':'10.1234/ex','institutions':[]},{},load_authorities(file))['citation_weight'],1)
    def test_training_rights_no_prestige_filter(self):
        base={'fulltext':'genuinely licensed text','license':'cc-by','rights_verified':True,
              'rights_reference':'license URL','rights_reviewer':'Auditor','fulltext_source_url':'https://example.org/text'}
        self.assertTrue(training_rights({**base,'citation_weight':1})['fulltext_training_eligible'])
        self.assertTrue(training_rights({**base,'citation_weight':5})['fulltext_training_eligible'])
        self.assertFalse(training_rights({**base,'license':'cc-by-nc-nd'})['fulltext_training_eligible'])
        self.assertFalse(training_rights({**base,'rights_verified':False})['fulltext_training_eligible'])
    def test_sources_dedupe_by_doi(self):
        openalex={'results':[{'id':'https://openalex.org/W123','doi':'https://doi.org/10.1234/ex',
               'title':'Example Work','authorships':[], 'open_access':{'is_oa':True}}]}
        arxiv=b'<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"><entry><id>http://arxiv.org/abs/2601.00123v2</id><title>Example Work</title><arxiv:doi>10.1234/ex</arxiv:doi></entry></feed>'
        combined=merge(openalex_records(openalex)+arxiv_records(arxiv))
        self.assertEqual(len(combined),1)
        self.assertEqual(combined[0]['metadata_sources'],['arxiv','openalex'])
if __name__=='__main__': unittest.main()
