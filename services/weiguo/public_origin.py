"""Server-configured exact HTTPS origins; request data cannot expand trust."""
from __future__ import annotations
import ipaddress
import os
import re
from typing import Mapping
from urllib.parse import urlsplit

WEBHOOK_PATH='/v1/ceres/telegram/webhook'

def backend_runtime_label(env: Mapping[str,str] | None=None) -> str:
    cfg=os.environ if env is None else env
    return 'self-hosted-server' if cfg.get('WEIGUO_RUNTIME_KIND')=='self-hosted-server' else 'railway-server'

def _origin(raw: str) -> str | None:
    try:
        p=urlsplit(raw)
        if (p.scheme!='https' or not p.hostname or p.username or p.password or p.port is not None
            or p.path not in ('','/') or p.query or p.fragment):return None
        host=p.hostname
        if len(host)>253 or len(host.split('.'))<2 or host.endswith(('.local','.internal','.localhost')):return None
        if any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?',label) for label in host.split('.')):return None
        try:ipaddress.ip_address(host);return None
        except ValueError:pass
        canonical='https://'+host
        return canonical if raw in (canonical,canonical+'/') else None
    except (ValueError,TypeError):return None

def configured_public_origin(env: Mapping[str,str]) -> str | None:
    return _origin(env.get('WEIGUO_PUBLIC_BASE_URL',''))

def valid_ceres_webhook(value: str, env: Mapping[str,str] | None=None) -> bool:
    cfg=os.environ if env is None else env
    try:
        if 'WEIGUO_PUBLIC_BASE_URL' in cfg:
            origin=configured_public_origin(cfg)
            return bool(origin and value==origin+WEBHOOK_PATH)
        # Legacy deployment compatibility only; an explicit invalid setting fails closed.
        p=urlsplit(value)
        origin=_origin('https://'+str(p.hostname))
        return bool(origin and p.hostname.endswith('.up.railway.app') and value==origin+WEBHOOK_PATH)
    except (ValueError,TypeError):return False
