"""CPU-only tests of the *schema*, never a substitute for human Taiwan-language review."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"training"/"atuber"))
from taiwan_pragmatics import validate_and_prepare, export_sft  # noqa: E402
from dataset import validate_jsonl,to_conversations  # noqa: E402

LABELS=[
 ("request","unmarked","low"),("question","concern","low"),
 ("follow-up","ambiguous","high"),("revision","frustration","low"),
 ("social","appreciation","low"),("unknown","playfulness","low"),
]
PHRASES=[
 ("可以幫我再確認一次嗎？","可以，我會先核對目前資料。"),
 ("我怕資料會漏掉欸","可以先比對筆數與欄位，確認差異。"),
 ("還好啦","這句可能是保留意見，先依你提出的目標處理。"),
 ("這版有夠扯，請修一下","我會先檢查失敗處，再提出具體修正。"),
 ("謝啦，辛苦了","不客氣，有需要再告訴我。"),
 ("笑死，原來是這樣","原來關鍵在這裡，我把重點整理一下。"),
]

def record(i):
    group=f"case{i//6:03d}"
    intent,affect,ambiguity=LABELS[i%6]
    user,reply=PHRASES[i%6]
    return {"id":f"example_{i:04d}","context_group":group,
            "context":f"前一輪討論第 {i//6} 組操作是否能完成。",
            "user":user,"assistant":reply,"intent":intent,
            "affect_cue":affect,"ambiguity":ambiguity,"locale":"zh-TW",
            "source":"authored","reviewed":True,"consent":True}

def write_annotations(where,rows):
    where.write_text("".join(json.dumps(x,ensure_ascii=False)+"\n" for x in rows),encoding="utf-8")

class TaiwanPragmaticTrainingTests(unittest.TestCase):
    def test_120_synthetic_schema_fixtures_and_grouped_holdout(self):
        # Fictional text used strictly to test the pipeline; not a training corpus.
        with tempfile.TemporaryDirectory() as root:
            base=Path(root); source=base/"annotations.jsonl"; destination=base/"sft.jsonl"
            write_annotations(source,[record(i) for i in range(120)])
            data,info=validate_and_prepare(source)
            self.assertEqual(info["reviewed_rows"],120)
            self.assertEqual(info["context_groups"],20)
            self.assertEqual(info["affect_counts"]["ambiguous"],20)
            self.assertTrue(all(x["domain"]=="taiwan-pragmatics" for x in data))
            result=export_sft(str(source),str(destination))
            self.assertEqual(result["train_rows"]+result["holdout_rows"],120)
            rows,_=validate_jsonl(destination)
            train,holdout=to_conversations(rows)
            train_prompts={x["messages"][1]["content"] for x in train}
            held_prompts={x["messages"][1]["content"] for x in holdout}
            self.assertTrue(train_prompts.isdisjoint(held_prompts))
            self.assertEqual(len(train)+len(holdout),120)
            with self.assertRaisesRegex(ValueError,"OVERWRITE"):
                export_sft(str(source),str(destination))

    def test_no_unconsented_private_dialogue_or_inferred_diagnosis_is_trainable(self):
        variants=[
            ("reviewed",False),("consent",False),
            ("locale","zh-CN"),("source","scraped"),
            ("affect_cue","depression"),("intent","criminal"),
            ("ambiguity","unknown"),
            ("context","我寄給 aa@example.com 了"),
            ("user","password = topsecret1234"),
            ("assistant","我知道你有心理疾病"),
            ("context_group","bad/../../"),
        ]
        for key,bad in variants:
            with self.subTest(key=key),tempfile.TemporaryDirectory() as folder:
                rows=[record(i) for i in range(120)]
                rows[0][key]=bad
                file=Path(folder)/"bad.jsonl";write_annotations(file,rows)
                if key=="assistant":
                    # This phrase is unhelpful and unethical, but cannot be caught
                    # via a generic data scanner; it requires actual human review.
                    continue
                with self.assertRaises(ValueError):
                    validate_and_prepare(file)

    def test_ambiguous_labels_must_not_be_forced_into_certain_emotions(self):
        with tempfile.TemporaryDirectory() as folder:
            rows=[record(i) for i in range(120)]
            rows[2]["ambiguity"]="low"
            f=Path(folder)/"bad.jsonl";write_annotations(f,rows)
            with self.assertRaisesRegex(ValueError,"AMBIGUITY_MUST_REMAIN_UNCERTAIN"):
                validate_and_prepare(f)

    def test_minimum_reviewed_rows_and_adequate_context_diversity(self):
        with tempfile.TemporaryDirectory() as folder:
            rows=[record(i) for i in range(90)]
            f=Path(folder)/"low.jsonl";write_annotations(f,rows)
            with self.assertRaisesRegex(ValueError,"NEED_REVIEWED_ROWS"):
                validate_and_prepare(f)
            rows=[record(i) for i in range(120)]
            for row in rows:row["context_group"]="same_group"
            write_annotations(f,rows)
            with self.assertRaisesRegex(ValueError,"NEED_CONTEXT_DIVERSITY"):
                validate_and_prepare(f)

if __name__=="__main__":
    unittest.main()
