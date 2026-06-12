"""Upstream geo/risk data providers + risk scoring.

Primary source is ip-api.com (free, no key): it returns country/region/city/isp,
ASN, and `hosting`/`proxy`/`mobile` flags used for risk scoring. ipwho.is is a
fallback for plain geo when ip-api is unavailable.
"""

from __future__ import annotations

import ipaddress
from typing import Any

import httpx

IP_API_FIELDS = "status,message,country,countryCode,regionName,city,isp,org,as,asname,hosting,proxy,mobile,query"
TIMEOUT = httpx.Timeout(6.0)


def is_valid_ip(ip: str) -> bool:
    try:
        ipaddress.ip_address(ip)
        return True
    except ValueError:
        return False


def subnet_key(ip: str) -> str:
    """/24 for IPv4, /48 for IPv6 — coarse key so neighbors share a cache entry."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if isinstance(addr, ipaddress.IPv4Address):
        return str(ipaddress.ip_network(f"{ip}/24", strict=False).network_address)
    return str(ipaddress.ip_network(f"{ip}/48", strict=False).network_address)


async def _fetch_ip_api(client: httpx.AsyncClient, ip: str) -> dict[str, Any] | None:
    try:
        r = await client.get(f"http://ip-api.com/json/{ip}", params={"fields": IP_API_FIELDS})
        d = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    if d.get("status") != "success":
        return None
    return d


async def _fetch_ipwho(client: httpx.AsyncClient, ip: str) -> dict[str, Any] | None:
    try:
        r = await client.get(f"https://ipwho.is/{ip}")
        d = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    if not d.get("success"):
        return None
    conn = d.get("connection") or {}
    asn = conn.get("asn")
    return {
        "country": d.get("country"),
        "countryCode": d.get("country_code"),
        "regionName": d.get("region"),
        "city": d.get("city"),
        "isp": conn.get("isp"),
        "org": conn.get("org"),
        "as": f"AS{asn}" if asn else None,
        "asname": conn.get("org"),
        "hosting": None,
        "proxy": None,
        "mobile": None,
    }


def _normalize_geo(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "ip": d.get("query"),
        "country": d.get("country"),
        "country_code": (d.get("countryCode") or "").lower() or None,
        "region": d.get("regionName"),
        "city": d.get("city"),
        "isp": d.get("isp") or d.get("org"),
        "asn": d.get("as"),
        "asname": d.get("asname"),
    }


async def lookup_geo(ip: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        d = await _fetch_ip_api(client, ip)
        if d is None:
            d = await _fetch_ipwho(client, ip)
    if d is None:
        return None
    return _normalize_geo(d)


def _score(d: dict[str, Any]) -> tuple[int, list[str]]:
    """Heuristic 0-100 risk score (higher = more likely VPN/proxy/datacenter)."""
    score = 0
    reasons: list[str] = []
    if d.get("hosting"):
        score += 55
        reasons.append("datacenter/hosting ASN")
    if d.get("proxy"):
        score += 35
        reasons.append("known proxy/VPN")
    if d.get("mobile"):
        score += 5
        reasons.append("mobile network")
    asname = (d.get("asname") or d.get("org") or "").lower()
    cloud_hints = ("amazon", "google", "microsoft", "azure", "digitalocean",
                   "ovh", "hetzner", "linode", "vultr", "oracle", "cloudflare", "tencent", "alibaba")
    if any(h in asname for h in cloud_hints):
        score += 15
        reasons.append("cloud provider ASN")
    return min(score, 100), reasons


async def lookup_risk(ip: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        d = await _fetch_ip_api(client, ip)
    if d is None:
        return None
    score, reasons = _score(d)
    return {
        "ip": d.get("query"),
        "asn": d.get("as"),
        "asname": d.get("asname") or d.get("org"),
        "country_code": (d.get("countryCode") or "").lower() or None,
        "is_hosting": bool(d.get("hosting")) if d.get("hosting") is not None else None,
        "is_proxy": bool(d.get("proxy")) if d.get("proxy") is not None else None,
        "is_mobile": bool(d.get("mobile")) if d.get("mobile") is not None else None,
        "risk_score": score,
        "risk_reasons": reasons,
    }
