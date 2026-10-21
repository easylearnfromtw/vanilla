#!/usr/bin/env python3
"""Static, private owner-only failure notice via the existing Ceres Telegram bot."""
import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

TOKEN = re.compile(r"[0-9]{5,15}:[A-Za-z0-9_-]{30,80}\Z")
CHAT = re.compile(r"[1-9][0-9]{0,18}\Z")
REPOSITORY = re.compile(r"[a-zA-Z0-9_.-]{1,100}/[a-zA-Z0-9_.-]{1,100}\Z")


def message(repository: str, run: str, failed: list[str]) -> str:
    if not REPOSITORY.fullmatch(repository) or not run.isdecimal() or len(run) > 24:
        raise ValueError("Invalid GitHub run reference")
    kinds = [x for x in failed if x in {"Giskard", "Tracely", "Model scan"}]
    return ("✦ CERES / HANK 測試警示\n"
            "GitHub AI 品質檢查失敗：" + ("、".join(kinds) or "未分類") + "\n"
            f"執行記錄：https://github.com/{repository}/actions/runs/{run}\n"
            "請至 GitHub Actions 或私人 Tracely 工作區檢查。")


def main() -> int:
    token = os.getenv("HANK_CERES_BOT_TOKEN", "")
    chat_id = os.getenv("HANK_CERES_OWNER_CHAT_ID", "")
    if not token and not chat_id:
        print("Hank Ceres notice: not configured")
        return 0
    if not TOKEN.fullmatch(token) or not CHAT.fullmatch(chat_id):
        print("Hank Ceres notice: invalid server-only configuration")
        return 1
    failed = [name for key, name in (
        ("HANK_GISKARD_STATUS", "Giskard"),
        ("HANK_TRACELY_STATUS", "Tracely"),
        ("HANK_LIVE_STATUS", "Model scan"),
    ) if os.getenv(key, "") == "failure"]
    if not failed:
        return 0
    try:
        payload = {"chat_id": chat_id,
                   "text": message(os.getenv("GITHUB_REPOSITORY", ""),
                                   os.getenv("GITHUB_RUN_ID", ""), failed),
                   "disable_web_page_preview": True}
        req = Request("https://api.telegram.org/bot" + token + "/sendMessage",
                      data=json.dumps(payload).encode(),
                      headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=8) as response:
            ok = response.status == 200 and json.load(response).get("ok") is True
        print("Hank Ceres notice: sent" if ok else "Hank Ceres notice: rejected")
        return 0 if ok else 1
    except (ValueError, HTTPError, URLError, OSError, json.JSONDecodeError):
        # Never print token-bearing Telegram URL or exception.
        print("Hank Ceres notice: delivery failed")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
