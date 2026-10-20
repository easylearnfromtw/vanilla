"""Canva adapter tests use no network, credentials, or Canva AI credits."""
from __future__ import annotations

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from auth import FamilyIdentity
import canva_adapter as canva


OWNER = FamilyIdentity("123456789012345678901", "Owner", "owner", "owner@example.test")
MEMBER = FamilyIdentity("223456789012345678901", "Member", "member", "member@example.test")


class CanvaAdapterTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        canva._recent.clear()
        canva._jobs.clear()
        self.env = patch.dict(os.environ, {
            "WEIGUO_CANVA_ENABLED": "true",
            "WEIGUO_CANVA_ACCESS_TOKEN": "fake-for-tests-not-real-canva-oauth-token",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    async def test_owner_can_submit_image_without_passing_credentials_to_browser(self):
        data = {"id": "00000000-0000-4000-8000-000000000001", "status": "in_progress"}
        with patch.object(canva, "_canva_call", new_callable=AsyncMock, return_value=data) as network:
            result = await canva.generate(canva.GenerationRequest(
                kind="image", prompt="A minimalist editorial flower",
                approved_cloud_send=True), OWNER)
        self.assertEqual(result["status"], "in_progress")
        self.assertEqual(network.await_args.args[:2], ("POST", "/image-generations"))
        self.assertEqual(network.await_args.args[3]["asset_upload"], {"type": "none"})
        self.assertNotIn("token", str(result).lower())
        self.assertIn(result["id"], canva._jobs)

    async def test_only_owner_and_explicit_consent_can_generate(self):
        request = canva.GenerationRequest(kind="presentation", prompt="Marketing slides",
                                           approved_cloud_send=True)
        with self.assertRaises(HTTPException) as err:
            await canva.generate(request, MEMBER)
        self.assertEqual(err.exception.status_code, 403)
        with self.assertRaises(HTTPException) as err:
            await canva.generate(request.model_copy(update={"approved_cloud_send": False}), OWNER)
        self.assertEqual(err.exception.status_code, 400)

    async def test_no_live_credential_fails_closed(self):
        with patch.dict(os.environ, {"WEIGUO_CANVA_ACCESS_TOKEN": ""}):
            with self.assertRaises(HTTPException) as err:
                await canva.generate(canva.GenerationRequest(kind="image",
                    prompt="Minimal poster", approved_cloud_send=True), OWNER)
            self.assertEqual(err.exception.status_code, 503)

    async def test_successful_presentation_returns_only_canva_edit_link(self):
        submit = {"id": "00000000-0000-4000-8000-000000000002", "status": "in_progress"}
        completed = {"id": submit["id"], "status": "success", "result": {"design": {
            "title": "Marketing deck", "page_count": 4, "urls": {
                "edit_url": "https://www.canva.com/api/design/example/edit"}}}}
        with patch.object(canva, "_canva_call", new_callable=AsyncMock,
                          side_effect=[submit, completed]) as network:
            result = await canva.generate(canva.GenerationRequest(
                kind="presentation", prompt="A four-slide business deck",
                approved_cloud_send=True), OWNER)
            final = await canva.get_job("presentation", result["id"], OWNER)
        self.assertEqual(final["pages"], 4)
        self.assertEqual(final["url"], "https://www.canva.com/api/design/example/edit")
        self.assertEqual(network.await_args.args[1],
                         "/generations/00000000-0000-4000-8000-000000000002")

    async def test_cannot_poll_unowned_or_unsubmitted_job(self):
        with self.assertRaises(HTTPException) as err:
            await canva.get_job("image", "00000000-0000-4000-8000-000000000099", OWNER)
        self.assertEqual(err.exception.status_code, 404)

    async def test_two_per_minute_quota(self):
        with patch.object(canva, "_canva_call", new_callable=AsyncMock,
                          side_effect=[{"id": "00000000-0000-4000-8000-000000000003", "status": "in_progress"},
                                       {"id": "00000000-0000-4000-8000-000000000004", "status": "in_progress"}]):
            for _ in range(2):
                await canva.generate(canva.GenerationRequest(
                    kind="image", prompt="An abstract flower", approved_cloud_send=True), OWNER)
            with self.assertRaises(HTTPException) as err:
                await canva.generate(canva.GenerationRequest(
                    kind="image", prompt="An abstract flower", approved_cloud_send=True), OWNER)
            self.assertEqual(err.exception.status_code, 429)

    def test_failed_url_validation_and_unavailable_discovery(self):
        self.assertIsNone(canva._safe_url("javascript:alert(1)"))
        self.assertIsNone(canva._safe_url("https://user:pass@www.canva.com/design/"))
        with patch.dict(os.environ, {"WEIGUO_CANVA_ENABLED": "false"}):
            discovered = asyncio.run(canva.status(OWNER))
            self.assertFalse(discovered["configured"])
            self.assertEqual(discovered["availableKinds"], [])


if __name__ == "__main__":
    unittest.main()
