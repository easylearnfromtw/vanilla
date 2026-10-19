-- Apply only after migrations.sql. Status retained for audit; jobs are never duplicated on the same digest.
CREATE TABLE IF NOT EXISTS notification_outbox (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 job_id TEXT NOT NULL,
 owner_id TEXT NOT NULL,
 target_url TEXT NOT NULL,
 digest TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 next_attempt INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('pending','delivered','dead')),
 delivered_at INTEGER,
 last_error TEXT,
 UNIQUE(job_id,digest),
 FOREIGN KEY(job_id) REFERENCES jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_notify_pending ON notification_outbox(status,next_attempt);
CREATE INDEX IF NOT EXISTS idx_notify_owner ON notification_outbox(owner_id,created_at DESC);
