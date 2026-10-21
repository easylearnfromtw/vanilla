"""Slime capability scoring, durable node-removal forfeiture and wallet debt.

Node capabilities are self-reported, not hardware-attested. The scoring rule is
bounded and deterministic. Forfeiture is durable across separate node and Ceres
SQLite databases via node-registry tombstones, replay-safe ledger entries.
"""
from __future__ import annotations

import re
import secrets
import time

def score_capabilities(cpu: int, ram_gb: float, gpu: str) -> int:
    """Published, bounded 1–1000 capability score: CPU 35.2%, RAM 25.6%, GPU 37.8%."""
    if type(cpu) is not int or type(ram_gb) not in (int, float):
        raise ValueError("invalid capabilities")
    if cpu < 1 or not 0 < ram_gb <= 2048 or not isinstance(gpu, str):
        raise ValueError("node must report CPU/RAM via authenticated heartbeat")
    cpu_part = min(cpu, 32) * 11
    ram_part = int(min(ram_gb, 128) * 2)
    gpu_part = 0
    # Branded GPU strings are supplied by the node (not cryptographically
    # attested). Unknown VRAM cannot be rewarded as if it were present.
    if gpu.strip():
        gpu_part = 90
        match = re.search(r"(\d+(?:\.\d+)?)\s*(MiB|GiB|MB|GB)\b",gpu,re.I)
        if match:
            amount=float(match.group(1))
            if match.group(2).lower() in ("mib", "mb"):
                amount /= 1024
            gpu_part += min(16, int(amount)) * 18
    return max(1,min(1000,14+cpu_part+ram_part+gpu_part))

def bonus_round_up_nine(raw: int) -> int:
    """Round *up* to the smallest integer ending with digit nine."""
    if type(raw) is not int or raw < 0:
        raise ValueError("bonus must be positive integral credits")
    return raw + ((9 - raw % 10) % 10)

def _debt_tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_debt(
      google_sub TEXT PRIMARY KEY, debt INTEGER NOT NULL DEFAULT 0 CHECK(debt>=0))""")
    db.execute("""CREATE TABLE IF NOT EXISTS slime_reward_forfeiture(
      node_id TEXT PRIMARY KEY, owner_sub TEXT NOT NULL,
      google_sub TEXT, forfeited INTEGER NOT NULL DEFAULT 0,
      processed_at INTEGER NOT NULL)""")

def account_credit(db, sub: str, amount: int, *, refund: bool=False) -> None:
    """Credits pay back previously forfeited negative balance before becoming spendable."""
    if type(amount) is not int or amount < 0:
        raise ValueError("amount must be nonnegative")
    _debt_tables(db)
    row=db.execute("SELECT debt FROM slime_reward_debt WHERE google_sub=?",(sub,)).fetchone()
    unpaid=min(amount,row["debt"] if row else 0)
    if unpaid:
        db.execute("UPDATE slime_reward_debt SET debt=debt-? WHERE google_sub=?",
                   (unpaid,sub))
    cash=amount-unpaid
    db.execute("UPDATE slime_reward_wallet SET balance=balance+?"+
               (",spent=spent-?" if refund else ",earned=earned+?")+" WHERE google_sub=?",
               (cash,amount,sub))
    # 'spent' is cumulative net inference spend, not loss from the forfeiture.

def signed_balance(db, sub: str, cash: int) -> int:
    _debt_tables(db)
    row=db.execute("SELECT debt FROM slime_reward_debt WHERE google_sub=?",(sub,)).fetchone()
    return cash-(row["debt"] if row else 0)

def note_deleted_node(db, node_id: str, owner_sub: str) -> None:
    """Must execute inside the same Slime registry transaction as node removal."""
    db.execute("""INSERT OR IGNORE INTO slime_reward_revocation
      (node_id,owner_sub,revoked_at) VALUES(?,?,?)""",
      (node_id,owner_sub,int(time.time())))

def reconcile_node_revocations() -> int:
    """Reconcile all persisted deletions against reward wallets idempotently.

    Read Slime tombstones *before* obtaining the Ceres write lock to avoid
    cross-database writer deadlocks. The tombstone remains permanently for
    audit/recovery; the Ceres table makes replays no-ops.
    """
    from slime import _db
    from ceres_gateway import _session
    from slime_rewards import _tables
    with _db() as nodes:
        removed=[dict(x) for x in nodes.execute(
            "SELECT node_id,owner_sub,revoked_at FROM slime_reward_revocation ORDER BY revoked_at").fetchall()]
    if not removed:
        return 0
    completed=0
    now=int(time.time())
    with _session() as db:
        _tables(db)
        _debt_tables(db)
        db.execute("BEGIN IMMEDIATE")
        for item in removed:
            node_id,owner=item["node_id"],item["owner_sub"]
            if db.execute("SELECT 1 FROM slime_reward_forfeiture WHERE node_id=?",
                          (node_id,)).fetchone():
                continue
            claim=db.execute("""SELECT c.google_sub,c.amount,c.bonus,w.balance
                FROM slime_reward_claim c JOIN slime_reward_wallet w
                ON w.google_sub=c.google_sub WHERE c.node_id=? AND w.owner_sub=?""",
                (node_id,owner)).fetchone()
            sub=claim["google_sub"] if claim else None
            revoked_amount=0
            if claim:
                revoked_amount=int(claim["amount"])+int(claim["bonus"])
                cash=min(int(claim["balance"]),revoked_amount)
                debt=revoked_amount-cash
                db.execute("UPDATE slime_reward_wallet SET balance=balance-? WHERE google_sub=?",
                           (cash,sub))
                db.execute("""INSERT INTO slime_reward_debt(google_sub,debt)
                    VALUES(?,?) ON CONFLICT(google_sub) DO UPDATE SET
                    debt=debt+excluded.debt""",(sub,debt))
                db.execute("""UPDATE vanilla_api_keys SET revoked_at=?
                    WHERE revoked_at IS NULL AND id IN
                    (SELECT key_id FROM slime_reward_key WHERE google_sub=?)""",(now,sub))
                db.execute("UPDATE slime_weeken_enrollment SET status='node_removed',changed_at=? "
                           "WHERE google_sub=?",(now,sub))
                db.execute("""INSERT INTO slime_reward_ledger
                    (id,google_sub,kind,delta,created_at,model,note)
                    VALUES(?,?,?,?,?,?,?)""",
                    (node_id+":forfeit",sub,"node_forfeiture",-revoked_amount,
                     now,None,"節點退出／撤銷，原贈送額度取消"))
            db.execute("""INSERT INTO slime_reward_forfeiture
                (node_id,owner_sub,google_sub,forfeited,processed_at)
                VALUES(?,?,?,?,?)""",
                (node_id,owner,sub,revoked_amount,now))
            completed+=1
    return completed
