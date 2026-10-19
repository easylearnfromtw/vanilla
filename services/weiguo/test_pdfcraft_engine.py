"""Offline PdfCraft acceptance tests; fake CLI only, no external binary."""
from __future__ import annotations
import asyncio
import base64
import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
import app as gateway
import pdfcraft_engine as p
from auth import FamilyIdentity, family_reader


def sample_pdf(tag: bytes = b"one") -> bytes:
    return b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n" + tag + b"\n%%EOF\n"


class PdfCraftTests(unittest.IsolatedAsyncioTestCase):
    async def test_refuse_missing_binary_by_default(self):
        with patch.dict(os.environ, {"WEIGUO_PDFCRAFT_ENABLED": "false"}):
            self.assertFalse(p.available())
            with self.assertRaises(p.PdfCraftUnavailable):
                await p.combine_pdfs([base64.b64encode(sample_pdf()).decode()] * 2)

    async def test_invalid_pdf_rejected_before_process(self):
        cases=[
            [],[base64.b64encode(sample_pdf()).decode()]*4,
            ["not base64!"]*2,
            [base64.b64encode(b"not-pdf"*8).decode()]*2,
            [base64.b64encode(b"%PDF-1.4"+b"a"*50).decode()]*2,
        ]
        for case in cases:
            with self.subTest(size=len(case)):
                with self.assertRaises(ValueError):
                    await p.combine_pdfs(case)

    async def test_checksum_pin_not_a_placeholder(self):
        with tempfile.TemporaryDirectory() as d:
            cli=Path(d)/"pdfcraft-cli"
            cli.write_bytes(b"#!/bin/sh\nexit 0\n")
            cli.chmod(0o700)
            digest=hashlib.sha256(cli.read_bytes()).hexdigest()
            env={
                "WEIGUO_PDFCRAFT_ENABLED":"true",
                "WEIGUO_PDFCRAFT_EGRESS_ISOLATED":"true",
                "WEIGUO_PDFCRAFT_CLI":str(cli),
                "WEIGUO_PDFCRAFT_SHA256":digest,
            }
            with patch.dict(os.environ,env):
                self.assertTrue(p.available())
                cli.write_bytes(cli.read_bytes()+b"tampered")
                self.assertFalse(p.available())
                cli.write_bytes(b"#!/bin/sh\nexit 0\n")
                link=Path(d)/"symlink"
                link.symlink_to(cli)
                with patch.dict(os.environ,{"WEIGUO_PDFCRAFT_CLI":str(link)}):
                    self.assertFalse(p.available())

    async def test_native_args_sanitization_and_cleanup(self):
        calls=[]
        class FakeProc:
            async def wait(self):return 0
        async def launch(*args,**kwargs):
            calls.append((args,kwargs))
            Path(args[-1]).write_bytes(sample_pdf(b"merged"))
            return FakeProc()
        docs=[base64.b64encode(sample_pdf(b"a")).decode(),base64.b64encode(sample_pdf(b"b")).decode()]
        with patch.object(p,"available",return_value=True),patch(
            "pdfcraft_engine.asyncio.create_subprocess_exec",side_effect=launch
        ),patch.dict(os.environ,{"WEIGUO_ADMIN_TOKEN":"TOP-SECRET","WEIGUO_SESSION_SECRET":"HIDDEN"}):
            output=await p.combine_pdfs(docs)
        self.assertIn(b"merged",output)
        self.assertEqual(len(calls),1)
        argv,options=calls[0]
        self.assertEqual(argv[1],"combine")
        self.assertEqual(argv[-2],"--out")
        self.assertTrue(argv[2].endswith("source-1.pdf"))
        self.assertTrue(argv[3].endswith("source-2.pdf"))
        self.assertNotIn("WEIGUO_ADMIN_TOKEN",options["env"])
        self.assertNotIn("WEIGUO_SESSION_SECRET",options["env"])
        self.assertEqual(options["stdin"],asyncio.subprocess.DEVNULL)
        self.assertFalse(Path(argv[-1]).exists())

    async def test_bad_native_output_fails_closed(self):
        class FakeProc:
            async def wait(self):return 0
        async def launch(*args,**kwargs):
            Path(args[-1]).write_bytes(b"Invalid native PDF output")
            return FakeProc()
        docs=[base64.b64encode(sample_pdf()).decode()]*2
        with patch.object(p,"available",return_value=True),patch(
            "pdfcraft_engine.asyncio.create_subprocess_exec",side_effect=launch
        ):
            with self.assertRaises(p.PdfCraftFailed):
                await p.combine_pdfs(docs)

    async def test_authenticated_route_and_no_store(self):
        docs=[base64.b64encode(sample_pdf()).decode()]*2
        async def request(headers=None):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=gateway.app),
                base_url="http://test.local") as client:
                return await client.post("/v1/family/orchestra/pdfcraft/combine",
                    json={"files":docs},headers=headers)
        self.assertEqual((await request()).status_code,401)
        gateway.app.dependency_overrides[family_reader]=lambda:FamilyIdentity(
            sub="123456789012345678901",member="A",role="owner",email="a@local.test")
        try:
            with patch.object(gateway,"combine_pdfs",return_value=sample_pdf(b"native")):
                response=await request()
        finally:
            gateway.app.dependency_overrides.pop(family_reader,None)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.headers["content-type"],"application/pdf")
        self.assertEqual(response.headers["cache-control"],"private, no-store")
        self.assertTrue(response.content.startswith(b"%PDF-"))


if __name__=="__main__":
    unittest.main()
