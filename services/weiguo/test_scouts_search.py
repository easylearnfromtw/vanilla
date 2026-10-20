"""Scouts evidence, outbound-provider and family session acceptance tests."""
from __future__ import annotations
import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from auth import FamilyIdentity
from scouts_search import (safe_public_url,choose_sources,regional,ScoutsQuery,
                           scouts_search,scouts_status,LIMIT,provider_search)

class ScoutsTests(unittest.TestCase):
    def setUp(self):
        LIMIT.clear()
        self.owner=FamilyIdentity(sub="123456789012345678901",member="owner",role="owner",email="test@example.com")

    def test_rejects_unsafe_urls_without_network(self):
        for url in ("http://example.com","https://127.0.0.1/a","https://192.168.1.1/a",
                    "https://localhost/","https://metadata.google.internal/latest",
                    "https://u:p@news.example.com","file:///etc/passwd","https://[::1]/",
                    "https://example.com:8080/a"):
            with self.subTest(url=url):self.assertIsNone(safe_public_url(url))
        self.assertEqual(safe_public_url("https://mohw.gov.tw/a#view"),"https://mohw.gov.tw/a")

    def test_three_distinct_plus_one_taiwan_source_without_hallucination(self):
        data=[
            {"title":"World study","url":"https://journal.example.org/a","snippet":"global","provider":"Brave"},
            {"title":"World study duplicate","url":"https://journal.example.org/a#tracking","provider":"Tavily"},
            {"title":"News","url":"https://news.example.org/c","provider":"Brave"},
            {"title":"Publication","url":"https://research.example.org/e","provider":"Tavily"},
            {"title":"衛福部臺灣公告","url":"https://www.mohw.gov.tw/f","provider":"Tavily",
              "excerpt":"實際抽取內容。"*60},
        ]
        selected=choose_sources(data,"台灣")
        self.assertEqual(len(selected),4)
        self.assertTrue(selected[-1]["regionSpecific"])
        self.assertEqual(selected[-1]["kind"],"full")
        self.assertEqual(selected[-1]["provider"],"Tavily")
        self.assertEqual(choose_sources(data[:1],"台灣")[0]["kind"],"snippet")
        self.assertEqual(choose_sources([],"台灣"),[])
        self.assertTrue(regional(selected[-1],"台灣"))

    def test_fail_closed_when_no_independent_api_key(self):
        with patch.dict(os.environ,{"WEIGUO_SCOUTS_BRAVE_API_KEY":"",
                                 "WEIGUO_SCOUTS_TAVILY_API_KEY":""}):
            status=asyncio.run(scouts_status(self.owner))
            self.assertFalse(status["ready"])
            with self.assertRaises(HTTPException) as err:
                asyncio.run(scouts_search(ScoutsQuery(query="2027 PGY",region="台灣"),self.owner))
            self.assertEqual(err.exception.status_code,503)

    def test_independent_brave_search_and_one_local_query_max(self):
        main=[{"title":"World A","url":"https://study.example.org/a","snippet":"a","provider":"Brave"},
              {"title":"World B","url":"https://study.example.org/b","snippet":"b","provider":"Brave"},
              {"title":"World C","url":"https://study.example.org/c","snippet":"c","provider":"Brave"}]
        regional_hit=[{"title":"衛福部臺灣","url":"https://mohw.gov.tw/pgy","snippet":"台灣","provider":"Brave"}]
        async def fake_search(provider,query,region):
            self.assertEqual(provider,"Brave")
            return regional_hit if query.endswith(" 台灣") else main
        with patch.dict(os.environ,{"WEIGUO_SCOUTS_BRAVE_API_KEY":"test-not-real",
                                   "WEIGUO_SCOUTS_TAVILY_API_KEY":""}):
            with patch("scouts_search.provider_search",new=AsyncMock(side_effect=fake_search)) as mock:
                result=asyncio.run(scouts_search(ScoutsQuery(query="2027 PGY",region="台灣"),self.owner))
                self.assertEqual(mock.await_count,2)
                self.assertTrue(result["complete"])
                self.assertEqual(len(result["results"]),4)
                self.assertEqual(result["providers"],["Brave"])

    def test_one_search_per_request_guard_and_per_identity_quota(self):
        with patch.dict(os.environ,{"WEIGUO_SCOUTS_BRAVE_API_KEY":"testing-only",
                                   "WEIGUO_SCOUTS_TAVILY_API_KEY":""}):
            with patch("scouts_search.provider_search",new_callable=AsyncMock,return_value=[
              {"title":"臺灣公告","url":"https://mohw.gov.tw/pgy","snippet":"台灣", "provider":"Brave"}
            ]):
                for _ in range(6):
                    asyncio.run(scouts_search(ScoutsQuery(query="醫療 PGY",region="台灣"),self.owner))
                with self.assertRaises(HTTPException) as ctx:
                    asyncio.run(scouts_search(ScoutsQuery(query="醫療 PGY",region="台灣"),self.owner))
                self.assertEqual(ctx.exception.status_code,429)
                other=FamilyIdentity(sub="223456789012345678901",member="other",role="member",email="other@example.com")
                result=asyncio.run(scouts_search(ScoutsQuery(query="醫療 PGY",region="台灣"),other))
                self.assertEqual(len(result["results"]),1)

if __name__=="__main__":unittest.main()
