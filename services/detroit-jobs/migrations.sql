CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, target_url TEXT NOT NULL,
 interval_minutes INTEGER NOT NULL CHECK(interval_minutes BETWEEN 60 AND 10080),
 enabled INTEGER NOT NULL DEFAULT 1,
 next_run INTEGER NOT NULL, last_digest TEXT, last_error TEXT, checked_at INTEGER,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(enabled,next_run);
CREATE INDEX IF NOT EXISTS idx_jobs_owner ON jobs(owner_id);
CREATE TABLE IF NOT EXISTS job_runs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL,owner_id TEXT NOT NULL,
 checked_at INTEGER NOT NULL,status TEXT NOT NULL,changed INTEGER NOT NULL DEFAULT 0,
 digest TEXT,detail TEXT,
 FOREIGN KEY(job_id) REFERENCES jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_job_runs_owner_at ON job_runs(owner_id,checked_at DESC);
