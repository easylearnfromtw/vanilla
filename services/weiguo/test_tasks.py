import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import tasks


class TaskAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {"WEIGUO_TASK_DB": str(Path(self.temp.name) / "tasks.sqlite3")})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_readonly_job_audit_and_restart_detection(self):
        tasks.initialize()
        item = tasks.start("https://example.org/info", [{"action": "extract"}])
        self.assertEqual(tasks.fetch(item["id"])["status"], "queued")
        tasks.update(item["id"], "running")
        tasks.initialize()
        self.assertEqual(tasks.fetch(item["id"])["status"], "failed")
        self.assertIn("restarted", tasks.fetch(item["id"])["error"])

    def test_completed_audit_and_missing_task(self):
        item = tasks.start("https://example.org/info", [{"action": "extract"}])
        tasks.update(item["id"], "completed", result={"events": [{"action": "extract", "text": "verified"}]})
        result = tasks.fetch(item["id"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["result"]["events"][0]["text"], "verified")
        self.assertIsNone(tasks.fetch("not-an-id"))

    def test_invalid_status_rejected(self):
        item = tasks.start("https://example.org/info", [{"action": "extract"}])
        with self.assertRaises(ValueError):
            tasks.update(item["id"], "admin-authorized")

    def test_family_owner_isolation_and_rate_limit(self):
        alice = tasks.start("https://example.org/", [{"action": "extract"}],
                            owner_sub="alice", limit_per_minute=1)
        self.assertIsNotNone(tasks.fetch(alice["id"], owner_sub="alice"))
        self.assertIsNone(tasks.fetch(alice["id"], owner_sub="bob"))
        with self.assertRaises(ValueError):
            tasks.start("https://example.org/", [{"action": "extract"}],
                        owner_sub="alice", limit_per_minute=1)
        bob = tasks.start("https://example.org/", [{"action": "extract"}],
                          owner_sub="bob", limit_per_minute=1)
        self.assertIsNotNone(tasks.fetch(bob["id"], owner_sub="bob"))

    def test_single_canonical_service_entrypoint(self):
        directory = Path(__file__).parent
        server = (directory / "server.py").read_text()
        application = (directory / "app.py").read_text()
        docker = (directory / "Dockerfile").read_text()
        compose = (directory / "docker-compose.example.yml").read_text()
        self.assertIn("from app import app", server)
        self.assertNotIn("FastAPI(", server)
        self.assertIn('app = FastAPI(', application)
        self.assertIn("app:app", docker)
        entrypoint = (directory / "entrypoint.sh").read_text()
        self.assertIn('ENTRYPOINT ["/usr/local/bin/weiguo-entrypoint"]', docker)
        self.assertIn("USER root", docker)
        self.assertIn("runuser -u weiguo", entrypoint)
        self.assertIn("chown 10001:10001 /data", entrypoint)
        self.assertIn("exec runuser", entrypoint)

        self.assertIn("WEIGUO_ADMIN_TOKEN", compose)
        self.assertIn("WEIGUO_ALLOWED_HOSTS", compose)
        self.assertIn("WEIGUO_TASK_DB", compose)
        self.assertIn("WEIGUO_ALLOW_JAVASCRIPT", compose)
        self.assertIn("@app.post(\"/v1/tasks\"", application)
        self.assertIn("@app.get(\"/v1/tasks/{task_id}\")", application)


if __name__ == "__main__":
    unittest.main()
