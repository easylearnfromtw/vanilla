"""Fail-closed browser policy; public read-only allowlisted HTTPS domains."""
import ipaddress
import os
import re
from urllib.parse import urlsplit, urlunsplit


def allowed_hosts():
    return {x.strip().lower().rstrip('.') for x in os.getenv('WEIGUO_ALLOW_HOSTS', '').split(',') if x.strip()}


def validate_target(value: str, hosts=None) -> str:
    if not isinstance(value, str) or len(value) > 1500:
        raise ValueError('Invalid URL length')
    u = urlsplit(value)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.fragment:
        raise ValueError('Only plain HTTPS URLs are allowed')
    host = u.hostname.lower().rstrip('.')
    if u.port not in (None, 443) or not re.fullmatch(r'[a-z0-9.-]{4,253}', host):
        raise ValueError('Unsupported URL host or port')
    try:
        ipaddress.ip_address(host)
        raise ValueError('IP address URLs are blocked')
    except ValueError as e:
        if str(e) == 'IP address URLs are blocked':
            raise
    if host.endswith(('.localhost', '.local', '.internal')):
        raise ValueError('Private network domain is blocked')
    permitted = allowed_hosts() if hosts is None else hosts
    if not permitted or host not in permitted:
        raise ValueError('Host is not on the exact allowlist')
    if u.query and len(u.query) > 500:
        raise ValueError('Query string too long')
    return urlunsplit(('https', host, u.path or '/', u.query, ''))


def guard_steps(steps):
    """No arbitrary code, purchases, credential entry, POST or admin actions."""
    if not isinstance(steps, list) or len(steps) > 8:
        raise ValueError('Maximum eight actions per run')
    safe = []
    for item in steps:
        if not isinstance(item, dict) or item.get('action') not in ('scroll', 'follow_link', 'search', 'extract', 'images'):
            raise ValueError('Only reviewed, read-only browser operations are allowed')
        action = item['action']
        arg = item.get('value', '')
        if not isinstance(arg, str) or len(arg) > 160 or re.search(r'(?i)(password|otp|2fa|credit.?card|付款|密碼|驗證碼|轉帳)', arg):
            raise ValueError('Sensitive or oversized browser action')
        safe.append({'action': action, 'value': arg})
    return safe