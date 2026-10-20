"""Offline security and request-contract tests for Notion schedule board."""
from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from auth import FamilyIdentity
import notion_schedule as notion

SOURCE = "7595cbce-7702-4bda-a514-fd09f48e8411"
A = FamilyIdentity("123456789012345678901", "A", "owner", "a@example.org")
B = FamilyIdentity("223456789012345678901", "B", "member", "b@example.org")
IDENTIFIER = "44db2b6d-d2a9-479e-bf7b-4d21e4641a7d"


def fake_page(owner: FamilyIdentity, page_id: str = IDENTIFIER, done: bool = False) -> dict:
    return {
        "id": page_id,
        "parent": {"type": "data_source_id", "data_source_id": SOURCE},
        "url": "https://www.notion.so/example",
        "properties": {
            "Name": {"title": [{"plain_text": "Schedule A"}]},
            "When": {"date": {"start": "2026-11-01T09:00:00+08:00"}},
            "Vanilla Owner": {"rich_text": [{"plain_text": notion._owner(owner.sub)}]},
            "Done": {"checkbox": done},
        },
    }


class NotionScheduleTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        settings = {
            "WEIGUO_NOTION_ENABLED": "true",
            "WEIGUO_NOTION_TOKEN": "secret-test-only-token-value",
            "WEIGUO_NOTION_DATA_SOURCE_ID": SOURCE,
            "WEIGUO_SESSION_SECRET": "different-private-family-signer-at-least-32-chars",
        }
        p = patch.dict(os.environ, settings)
        p.start()
        self.addCleanup(p.stop)

    def test_date_requires_timezone_and_key_configuration(self):
        self.assertEqual(notion._date("2026-11-01T09:00:00+08:00"), "2026-11-01T09:00:00+08:00")
        with self.assertRaises(HTTPException):
            notion._date("2026-11-01T09:00:00")
        self.assertTrue(notion.configured())
        with patch.dict(os.environ, {"WEIGUO_NOTION_ENABLED": "false"}):
            self.assertFalse(notion.configured())
            with self.assertRaises(HTTPException):
                notion._settings()

    async def test_task_create_is_fixed_schema_and_identity_owned(self):
        page = fake_page(A)
        with patch.object(notion, "_call", new_callable=AsyncMock, return_value=page) as api:
            task = await notion.create_task(notion.ScheduledTask(
                title="  Schedule A  ", when="2026-11-01T09:00:00+08:00", details="Review notes"
            ), A)
        self.assertEqual(task["title"], "Schedule A")
        method, path, payload = api.await_args.args
        self.assertEqual(method, "POST")
        self.assertEqual(path, "/v1/pages")
        self.assertEqual(payload["parent"]["data_source_id"], SOURCE)
        self.assertEqual(payload["properties"]["Name"]["title"][0]["text"]["content"], "Schedule A")
        self.assertEqual(payload["properties"]["Vanilla Owner"]["rich_text"][0]["text"]["content"], notion._owner(A.sub))
        self.assertNotIn(A.sub, str(payload))
        self.assertNotIn(os.environ["WEIGUO_NOTION_TOKEN"], str(payload))
        self.assertEqual(payload["children"][0]["type"], "paragraph")

    async def test_listing_removes_other_members_even_if_query_backend_leaks(self):
        with patch.object(notion, "_call", new_callable=AsyncMock, return_value={
            "results": [fake_page(A), fake_page(B, "6fc31814-b010-4f91-983d-64c827bb1efc")],
            "has_more": False,
        }) as api:
            rows = await notion.list_tasks(A)
        self.assertEqual(len(rows["tasks"]), 1)
        self.assertEqual(rows["tasks"][0]["title"], "Schedule A")
        self.assertEqual(api.await_args.args[2]["filter"]["rich_text"]["equals"], notion._owner(A.sub))

    async def test_cross_account_completion_is_denied_without_patch(self):
        with patch.object(notion, "_call", new_callable=AsyncMock, return_value=fake_page(B)) as api:
            with self.assertRaises(HTTPException) as ctx:
                await notion.complete_task(IDENTIFIER, A)
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(api.await_count, 1)

    async def test_authorized_completion_and_reschedule(self):
        with patch.object(notion, "_call", new_callable=AsyncMock,
                          side_effect=[fake_page(A), fake_page(A, done=True)]) as api:
            result = await notion.complete_task(IDENTIFIER, A)
        self.assertTrue(result["done"])
        self.assertEqual(api.await_args.args[0], "PATCH")
        self.assertEqual(api.await_args.args[2]["properties"]["Done"], {"checkbox": True})
        with patch.object(notion, "_call", new_callable=AsyncMock,
                          side_effect=[fake_page(A), fake_page(A)]) as api:
            await notion.reschedule_task(IDENTIFIER, notion.NewTime(when="2026-11-03T10:00:00+08:00"), A)
        self.assertEqual(api.await_args.args[2]["properties"]["When"]["date"]["start"], "2026-11-03T10:00:00+08:00")

    async def test_unknown_page_and_wrong_datasource_are_not_editable(self):
        with patch.object(notion, "_call", new_callable=AsyncMock) as api:
            with self.assertRaises(HTTPException):
                await notion.complete_task("https://malicious.example", A)
            api.assert_not_awaited()
        page = fake_page(A)
        page["parent"]["data_source_id"] = "8466bd8d-75b4-467a-8561-b231297863b7"
        with patch.object(notion, "_call", new_callable=AsyncMock, return_value=page):
            with self.assertRaises(HTTPException):
                await notion.complete_task(IDENTIFIER, A)


if __name__ == "__main__":
    unittest.main()
