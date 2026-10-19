"""Regression tests for Orchestra authenticated capability discovery and binary trust."""
from __future__ import annotations

import asyncio
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from auth import FamilyIdentity, family_reader
import app as gateway
import orchestra_capabilities as inventory
import wordcraft_engine as wordcraft


class CapabilityTests(unittest.TestCase):
    def test_seven_engine_inventory_is_closed_and_fail_closed(self):
        with patch.object(inventory, "wordcraft_available", return_value=False):
            response=inventory.orchestra_capabilities()
        self.assertEqual(response["schemaVersion"],1)
        self.assertEqual([v["id"] for v in response["engines"]],list(inventory.ENGINE_IDS))
        self.assertTrue(all(v["status"]=="unavailable" for v in response["engines"]))
        self.assertTrue(all(not v["operations"] for v in response["engines"]))
        self.assertTrue(all(v["runtimeVerified"] is False for v in response["engines"]))

    def test_only_wordcraft_can_report_configured(self):
        with patch.object(inventory, "wordcraft_available", return_value=True):
            report=inventory.orchestra_capabilities()
        self.assertEqual(report["engines"][0]["id"],"wordcraft")
        self.assertEqual(report["engines"][0]["status"],"configured")
        self.assertEqual(report["engines"][0]["operations"],["convert-markdown"])
        self.assertEqual(report["engines"][0]["outputFormats"],["docx","pdf"])
        self.assertTrue(all(e["status"]=="unavailable" for e in report["engines"][1:]))

    def test_wordcraft_requires_pinned_hash_and_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as home:
            binary=Path(home)/"wordcraft-cli"
            binary.write_bytes(b"#!/bin/sh\nexit 0\n")
            binary.chmod(0o700)
            digest=hashlib.sha256(binary.read_bytes()).hexdigest()
            config={"WEIGUO_WORDCRAFT_ENABLED":"true","WEIGUO_WORDCRAFT_EGRESS_ISOLATED":"true",
                    "WEIGUO_WORDCRAFT_CLI":str(binary),"WEIGUO_WORDCRAFT_SHA256":digest}
            with patch.dict(os.environ,config):
                self.assertTrue(wordcraft.available())
                with patch.dict(os.environ,{"WEIGUO_WORDCRAFT_SHA256":"0"*64}):
                    self.assertFalse(wordcraft.available())
                with patch.dict(os.environ,{"WEIGUO_WORDCRAFT_SHA256":""}):
                    self.assertFalse(wordcraft.available())
                with patch.dict(os.environ,{"WEIGUO_WORDCRAFT_EGRESS_ISOLATED":"false"}):
                    self.assertFalse(wordcraft.available())
                symlink=Path(home)/"link"
                symlink.symlink_to(binary)
                with patch.dict(os.environ,{"WEIGUO_WORDCRAFT_CLI":str(symlink)}):
                    self.assertFalse(wordcraft.available())
                binary.write_bytes(binary.read_bytes()+b"change")
                self.assertFalse(wordcraft.available())

    def test_capability_endpoint_requires_identity_and_never_exposes_paths(self):
        async def get(headers=None):
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=gateway.app),
                base_url="http://gateway.test"
            ) as client:
                return await client.get("/v1/family/orchestra/capabilities",headers=headers)
        anonymous=asyncio.run(get())
        self.assertEqual(anonymous.status_code,401)
        gateway.app.dependency_overrides[family_reader]=lambda: FamilyIdentity(
            sub="123456789012345678901",member="測試",role="owner",email="user@example.org"
        )
        try:
            with patch.object(inventory,"wordcraft_available",return_value=False):
                response=asyncio.run(get())
        finally:
            gateway.app.dependency_overrides.pop(family_reader,None)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.headers.get("cache-control"),"private, no-store")
        self.assertEqual(len(response.json()["engines"]),7)
        self.assertNotIn("WEIGUO_WORDCRAFT_CLI",response.text)
        self.assertNotIn("/usr/local/bin",response.text)


if __name__=="__main__":
    unittest.main()
