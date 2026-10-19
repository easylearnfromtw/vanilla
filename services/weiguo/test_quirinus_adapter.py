"""Quirinus fail-closed and fixed-argv contract tests; no CLI installation needed."""
import asyncio
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException

import quirinus_adapter as q
from policy import private_operator_route


class FakeStream:
    def __init__(self, output):
        self.output = output

    async def read(self, maximum):
        result, self.output = self.output[:maximum], self.output[maximum:]
        return result


class FakeProcess:
    def __init__(self, output=None):
        if output is None:
            output = json.dumps({
                "files_scanned": 1,
                "findings": [{
                    "severity": "High", "vuln_type": "dangerous_eval",
                    "title": "Unsafe eval", "target": "/scan-src/app.py", "line": 8,
                    "evidence": "SECRET=do-not-echo", "remediation": "Avoid eval",
                    "detection_layer": "L1",
                }]
            }).encode()
        self.stdout = FakeStream(output)
        self.returncode = None
        self.killed = False

    async def wait(self):
        if self.returncode is None:
            self.returncode = 1  # High findings: valid scanner completion.
        return self.returncode

    def kill(self):
        self.killed = True
        self.returncode = -9


class QuirinusTests(unittest.TestCase):
    def test_disabled_by_default(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as e:
                q.validate_source()
        self.assertEqual(e.exception.status_code, 503)

    def test_operator_routes_hidden_on_public_family_server(self):
        self.assertTrue(private_operator_route("/v1/operator/quirinus/scan"))
        self.assertFalse(private_operator_route("/v1/family/tasks"))

    def test_symlink_rejected(self):
        with patch.dict(os.environ, {
            "QUIRINUS_ENABLED": "true", "QUIRINUS_ISOLATED": "true",
            "QUIRINUS_SOURCE_READONLY": "true",
        }), patch.object(q.ROOT.__class__, "is_symlink", return_value=True):
            with self.assertRaises(HTTPException):
                q.validate_source()

    def test_fixed_cli_and_evidence_redaction(self):
        calls = []
        async def runner(*argv, **kwargs):
            calls.append((argv, kwargs))
            return FakeProcess()
        with patch.object(q, "validate_source", return_value=Path("/scan-src")), \
             patch.object(q.asyncio, "create_subprocess_exec", runner):
            result = asyncio.run(q.quirinus_scan())
        self.assertTrue(result["completed"])
        self.assertTrue(result["hasHighRiskFindings"])
        self.assertEqual(result["findingsCount"], 1)
        self.assertEqual(result["findings"][0]["file"], "app.py")
        self.assertNotIn("SECRET", json.dumps(result))
        self.assertEqual(calls[0][0], (
            "/usr/local/bin/vulnclaw", "code", "scan", "/scan-src",
            "--layer", "L1,L2", "--format", "json", "--no-progress",
        ))
        self.assertNotIn("QUIRINUS_ENABLED", calls[0][1]["env"])
        self.assertNotIn("shell", calls[0][1])

    def test_output_limit_terminates_scanner_early(self):
        process = FakeProcess(b"x" * (q.MAX_JSON_BYTES + 1))
        async def runner(*args, **kwargs):
            return process
        with patch.object(q, "validate_source", return_value=Path("/scan-src")), \
             patch.object(q.asyncio, "create_subprocess_exec", runner):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(q.quirinus_scan())
        self.assertEqual(error.exception.status_code, 502)
        self.assertTrue(process.killed)

    def test_parent_directory_paths_are_redacted(self):
        report = q._clean_result({"findings": [{
            "severity": "Low", "target": "/scan-src/../../private.txt",
        }]})
        self.assertEqual(report["findings"][0]["file"], "[redacted]")

    def test_source_total_size_is_rejected(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (root / "huge.py").open("wb") as stream:
                stream.truncate(q.MAX_TOTAL_SOURCE_BYTES + 1)
            with patch.dict(os.environ, {
                "QUIRINUS_ENABLED": "true", "QUIRINUS_ISOLATED": "true",
                "QUIRINUS_SOURCE_READONLY": "true",
            }), patch.object(q, "ROOT", root), \
                 patch.object(q.os.path, "isfile", return_value=True), \
                 patch.object(q.os, "access", return_value=True):
                with self.assertRaises(HTTPException) as error:
                    q.validate_source()
            self.assertEqual(error.exception.status_code, 413)

    def test_invalid_output_fails_closed(self):
        with self.assertRaises(HTTPException) as e:
            q._clean_result({"findings": [{"severity": "Unknown"}]})
        self.assertEqual(e.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
