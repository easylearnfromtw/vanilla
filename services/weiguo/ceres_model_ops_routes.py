"""Signed, owner-only Ceres operations endpoints.

Explicit POSTs separate cheap read-only status from billable model probes.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ceres_admin_web import _verify
from ceres_model_ops import (dashboard,diagnostics,summary,probe,compare,
                            recommendations,preview,approve,set_price,failover_status,telegram_check)

router=APIRouter(prefix="/v1/ceres/admin/ops",tags=["ceres-owner-operations"])

class Auth(BaseModel):
    init_data: str=Field(min_length=20,max_length=8192)

class Provider(Auth):
    provider: str=Field(min_length=3,max_length=20)

class Recommendation(Provider):
    task: str=Field(default="general",min_length=3,max_length=12)

class Model(Provider):
    model: str=Field(min_length=2,max_length=100)

class Comparison(Model):
    second: str=Field(min_length=2,max_length=100)

class Price(Model):
    input_per_m: float=Field(ge=0,le=500)
    output_per_m: float=Field(ge=0,le=500)

class Intent(Auth):
    text: str=Field(min_length=2,max_length=140)

class Approval(Auth):
    token: str=Field(min_length=15,max_length=40)

@router.post("/health")
async def health(body:Auth):
    _verify(body.init_data)
    return dashboard()

@router.post("/diagnostics")
async def diagnose(body:Auth):
    _verify(body.init_data)
    return diagnostics()

@router.post("/usage")
async def usage(body:Auth):
    _verify(body.init_data)
    return summary()

@router.post("/recommend")
async def recommend(body:Recommendation):
    _verify(body.init_data)
    return recommendations(body.provider,body.task)

@router.post("/probe")
async def test_model(body:Model):
    actor=_verify(body.init_data)
    return await probe(body.provider,body.model,actor)

@router.post("/compare")
async def compare_models(body:Comparison):
    actor=_verify(body.init_data)
    return await compare(body.provider,body.model,body.second,actor)

@router.post("/price")
async def price(body:Price):
    actor=_verify(body.init_data)
    return set_price(body.provider,body.model,body.input_per_m,body.output_per_m,actor)

@router.post("/plan")
async def plan(body:Intent):
    actor=_verify(body.init_data)
    return preview(body.text,actor)

@router.post("/approve")
async def confirm(body:Approval):
    actor=_verify(body.init_data)
    return approve(body.token,actor)

@router.post("/telegram-check")
async def telegram_check_endpoint(body:Auth):
    actor=_verify(body.init_data)
    return await telegram_check(actor)
