"""Regression: Telegram hub is owner-only and GitHub discovery is read-only."""
import asyncio
import json
import os
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
from pathlib import Path

from ceres_command_center import (_format_repo, _limit_search, _search_github,
                                  _status_text, command, callback)
from ceres_gateway import _session


class HubTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.chat = 888123456
        self.sub = "123456789012345678901"
        env = patch.dict(os.environ, {
            "CERES_DB_PATH": self.tmp.name + "/ceres.sqlite",
            "CERES_TELEGRAM_CHAT_IDS": str(self.chat),
            "CERES_FAMILY_LINKS_JSON": json.dumps({str(self.chat): self.sub}),
            "WEIGUO_FAMILY_ACL_JSON": json.dumps({
                self.sub: {"role": "owner", "member": "Tester"}
            }),
            "CERES_GITHUB_DISCOVERY_ENABLED": "true",
        })
        env.start()
        self.addCleanup(env.stop)

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_only_verified_owner_can_open_menu_and_callbacks(self):
        with patch("ceres_command_center.say", new_callable=AsyncMock) as say, \
             patch("ceres_command_center._telegram", new_callable=AsyncMock) as api:
            self.run_async(command(self.chat + 2, "/hub"))
            self.run_async(callback(self.chat + 2, "cb", "hub:tools"))
            say.assert_not_awaited()
            api.assert_not_awaited()
            self.run_async(command(self.chat, "/hub"))
            self.assertIn("Ceres", say.await_args.args[1])
            self.run_async(callback(self.chat, "cb", "hub:tools"))
            self.assertIn("Detroit", say.await_args.args[1])
            api.assert_awaited_once()

    def test_github_search_is_read_only_and_never_executes(self):
        sample = {"full_name": "grammyjs/grammY",
                  "html_url": "https://github.com/grammyjs/grammY",
                  "stargazers_count": 3000,
                  "license": {"spdx_id": "MIT"},
                  "description": "Telegram bot framework"}
        self.assertIn("MIT", _format_repo(sample))
        sample["html_url"] = "https://evil.example/path"
        self.assertIsNone(_format_repo(sample))
        sample["html_url"] = "https://github.com/grammyjs/grammY"

        class Reply:
            status_code = 200
            content = b'{"items":[]}'
            def json(self):
                return {"items": [sample]}

        class Client:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def get(self, url, **kwargs):
                self.url = url
                self.params = kwargs["params"]
                self.user_agent = kwargs["headers"]["User-Agent"]
                assert url == "https://api.github.com/search/repositories"
                assert self.params["per_page"] == 5
                return Reply()

        with patch("ceres_command_center.httpx.AsyncClient", Client), \
             patch("ceres_command_center.say", new_callable=AsyncMock) as say:
            self.run_async(_search_github(self.chat, "telegram bot"))
            self.assertIn("grammyjs/grammY", say.await_args.args[1])
            self.assertIn("不會自動引入", say.await_args.args[1])
            self.run_async(_search_github(self.chat, "repo:private"))
            self.assertIn("請使用", say.await_args.args[1])

    def test_search_has_per_owner_rate_limit(self):
        self.assertTrue(_limit_search(self.chat))
        self.assertTrue(_limit_search(self.chat))
        self.assertTrue(_limit_search(self.chat))
        self.assertFalse(_limit_search(self.chat))
        with _session() as db:
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM ceres_hub_searches").fetchone()[0], 3)

    def test_tools_not_misreported_as_active(self):
        with patch.dict(os.environ, {"CERES_ENABLED": "false",
                                      "CERES_SERVER_AGENT_ENABLED": "false",
                                      "SLIME_ENABLED": "false"}):
            text = _status_text()
            self.assertIn("常駐 Agent：未就緒", text)
            self.assertIn("Slime 節點註冊：未開啟", text)


    def test_command_center_is_packaged_in_production_runtime(self):
        # CI must catch a successful source-level test with a missing Docker COPY.
        service_root = Path(__file__).resolve().parent
        for dockerfile in ("Dockerfile", "Dockerfile.pdfcraft"):
            with self.subTest(dockerfile=dockerfile):
                lines = (service_root / dockerfile).read_text(encoding="utf-8").splitlines()
                copy_lines = [line for line in lines
                              if line.startswith("COPY ") and line.endswith(" ./")]
                self.assertTrue(
                    any("ceres_command_center.py" in line.split() for line in copy_lines),
                    f"{dockerfile}: Telegram /hub module must ship inside the image")
                for required in ("ceres_command_center.py", "ceres_model_ops.py", "ceres_model_ops_routes.py"):
                    self.assertTrue(any(required in line.split() for line in copy_lines),
                                    f"{dockerfile}: missing runtime module {required}")
                self.assertTrue(any(
                    line.startswith('RUN python3 -c "import ') and
                    all(name in line for name in ("ceres_command_center", "ceres_model_ops", "ceres_model_ops_routes"))
                    for line in lines),
                    f"{dockerfile}: all modules must import successfully at build time")

if __name__ == "__main__":
    unittest.main()
