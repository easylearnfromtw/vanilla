"""Functional tests of the Telegram-gated owner revoke operation.

Uses a local SQLite fixture; no Telegram network, external API or real device.
"""
from __future__ import annotations
from contextlib import contextmanager
import hashlib
from pathlib import Path
import sqlite3
import sys
import time
import types

import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"services"/"weiguo"))
from slime_revoke_gate import consume_revoke, RevokeDenied


@pytest.fixture
def registry(tmp_path,monkeypatch):
    path=tmp_path/"nodes.sqlite"
    @contextmanager
    def database():
        db=sqlite3.connect(str(path),isolation_level=None,timeout=3)
        db.row_factory=sqlite3.Row
        try: yield db
        finally: db.close()
    def setup(db):
        db.execute("""CREATE TABLE IF NOT EXISTS slime_telegram_confirm (
            chat_id INTEGER PRIMARY KEY,owner TEXT NOT NULL,node_id TEXT NOT NULL,
            operation TEXT NOT NULL,code_hash TEXT NOT NULL,expires REAL NOT NULL)""")
        db.execute("""CREATE TABLE IF NOT EXISTS audits (
            owner TEXT,chat_id INTEGER,operation TEXT,node_id TEXT)""")
    def audit(db,owner,chat,operation,node):
        db.execute("INSERT INTO audits VALUES(?,?,?,?)",(owner,chat,operation,node))
    def authorized(chat,sub):
        return chat==42 and sub=="owner-a"
    monkeypatch.setitem(sys.modules,"slime",types.SimpleNamespace(_db=database))
    monkeypatch.setitem(sys.modules,"slime_telegram",types.SimpleNamespace(
        _setup=setup,_audit=audit,_owner_subject=authorized))
    node="abc123456789abc123456789"
    other="def123456789def123456789"
    with database() as db:
        setup(db)
        db.execute("CREATE TABLE nodes (id TEXT PRIMARY KEY, owner TEXT)")
        db.execute("INSERT INTO nodes VALUES(?,?)",(node,"owner-a"))
        db.execute("INSERT INTO nodes VALUES(?,?)",(other,"owner-a"))
    def issue(code="a" * 12,expire=None,chat=42,owner="owner-a",node_id=node):
        with database() as db:
            setup(db)
            db.execute("INSERT OR REPLACE INTO slime_telegram_confirm (chat_id,owner,node_id,operation,code_hash,expires) VALUES(?,?,?,?,?,?)",
                       (chat,owner,node_id,"revoke",
                        hashlib.sha256(code.encode()).hexdigest(),
                        expire if expire is not None else time.time()+180))
    def exists(node_id=node):
        with database() as db:
            return db.execute("SELECT COUNT(*) FROM nodes WHERE id=?",(node_id,)).fetchone()[0]==1
    return types.SimpleNamespace(issue=issue,exists=exists,node=node,other=other,database=database)


def test_valid_telegram_proof_deletes_only_target_and_cannot_replay(registry):
    registry.issue()
    consume_revoke("owner-a",registry.node,"a"*12,42)
    assert not registry.exists()
    assert registry.exists(registry.other)
    with pytest.raises(RevokeDenied):
        consume_revoke("owner-a",registry.node,"a"*12,42)
    with registry.database() as db:
        audit=db.execute("SELECT * FROM audits").fetchall()
        assert len(audit)==1
        assert audit[0]["operation"]=="revoke_telegram_verified"


def test_five_bad_codes_invalidate_one_time_proof(registry):
    registry.issue()
    for _ in range(5):
        with pytest.raises(RevokeDenied):
            consume_revoke("owner-a",registry.node,"b"*12,42)
        assert registry.exists()
    with pytest.raises(RevokeDenied):
        consume_revoke("owner-a",registry.node,"a"*12,42)
    assert registry.exists()


def test_expired_and_wrong_chat_fail_closed(registry):
    registry.issue(expire=time.time()-1)
    with pytest.raises(RevokeDenied):
        consume_revoke("owner-a",registry.node,"a"*12,42)
    assert registry.exists()
    registry.issue()
    with pytest.raises(RevokeDenied):
        consume_revoke("owner-a",registry.node,"a"*12,99)
    assert registry.exists()


def test_cross_owner_and_node_cannot_consume_approval(registry):
    registry.issue()
    for owner,node in [("owner-b",registry.node),("owner-a",registry.other)]:
        with pytest.raises(RevokeDenied):
            consume_revoke(owner,node,"a"*12)
    assert registry.exists()
    assert registry.exists(registry.other)
