"""Signed owner-only Telegram WebApp model discovery controls.

These endpoints reveal only non-secret model identifiers and require fresh
Telegram WebApp initData, not a public family bearer.
"""
from __future__ import annotations
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ceres_admin_web import _verify
from ceres_gateway import _session
from ceres_model_catalog import catalog, discover, select_mode

router=APIRouter(prefix="/v1/ceres/admin/models",tags=["ceres-model-admin"])

class ModelRequest(BaseModel):
    init_data: str=Field(min_length=20,max_length=8192)
    provider: str=Field(min_length=3,max_length=20)

class ModelChoice(ModelRequest):
    mode: str=Field(min_length=4,max_length=12)
    model_id: str=Field(default="",max_length=100)

@router.post("/status")
async def status(body:ModelRequest):
    _verify(body.init_data)
    return catalog(body.provider)

@router.post("/refresh")
async def refresh(body:ModelRequest):
    chat=_verify(body.init_data)
    with _session() as db:
        db.execute("""CREATE TABLE IF NOT EXISTS ceres_model_refresh_limits (
          chat_id INTEGER NOT NULL, provider TEXT NOT NULL,
          refreshed_at INTEGER NOT NULL, PRIMARY KEY(chat_id,provider)
        )""")
        db.execute("BEGIN IMMEDIATE")
        row=db.execute("SELECT refreshed_at FROM ceres_model_refresh_limits WHERE chat_id=? AND provider=?",
                       (chat,body.provider)).fetchone()
        now=int(time.time())
        if row and now-row["refreshed_at"]<30:
            raise HTTPException(429,"請於 30 秒後重試模型偵測")
        db.execute("""INSERT INTO ceres_model_refresh_limits VALUES(?,?,?)
           ON CONFLICT(chat_id,provider) DO UPDATE SET refreshed_at=excluded.refreshed_at""",
                   (chat,body.provider,now))
    return await discover(body.provider)

@router.post("/select")
async def select(body:ModelChoice):
    chat=_verify(body.init_data)
    return select_mode(body.provider,body.mode,body.model_id,chat)
