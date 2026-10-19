"""Compatibility wrappers for old read-only policy imports.

Canonical authorization and network checks live in policy.py. No separate
security interpretation is allowed for deployments.
"""
from __future__ import annotations
from policy import PolicyError, allow_hosts, validate_url, validate_steps

def allowed_hosts() -> set[str]:
    return allow_hosts()

def validate_target(value: str, hosts: set[str] | None = None) -> str:
    try:
        return validate_url(value, allow_hosts() if hosts is None else hosts)
    except PolicyError as e:
        raise ValueError(str(e)) from e

def guard_steps(steps):
    """Accept legacy read-only action names for historical tests only.

    Runtime services instead use validate_steps() and only the strict canonical
    navigate/extract/scroll action set.
    """
    if not isinstance(steps,list) or len(steps)>8:
        raise ValueError("Maximum eight actions per run")
    import re
    out=[]
    for x in steps:
        if not isinstance(x,dict) or x.get("action") not in ("scroll","follow_link","search","extract","images"):
            raise ValueError("Unsafe browser action")
        value=x.get("value","")
        if not isinstance(value,str) or len(value)>160 or re.search(
            r"(?:password|otp|2fa|credit.?card|付款|密碼|驗證碼|轉帳)",value,re.I
        ):
            raise ValueError("Sensitive browser action")
        out.append({"action":x["action"],"value":value})
    return out
