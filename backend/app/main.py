"""FastAPI app: geo lookup cache + IP risk scoring for the split-routing detector.

Endpoints:
  GET /api/geoip/{ip}   -> geo info (cached by /24, 30-day TTL)
  GET /api/iprisk/{ip}  -> ASN + hosting/proxy flags + risk score (cached 7-day)
  GET /healthz          -> liveness

The frontend treats this backend as optional and falls back to third-party APIs,
so missing/failed responses degrade gracefully.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import cache, providers

GEO_TTL = 30 * 24 * 3600
RISK_TTL = 7 * 24 * 3600

app = FastAPI(title="ip-check backend", version="0.1.0")

# Public read-only API consumed by a static frontend on a different origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/geoip/{ip}")
async def geoip(ip: str) -> dict:
    if not providers.is_valid_ip(ip):
        raise HTTPException(status_code=400, detail="invalid ip")

    key = providers.subnet_key(ip)
    cached = cache.get("geoip", key)
    if cached is not None:
        return cached

    result = await providers.lookup_geo(ip)
    if result is None:
        raise HTTPException(status_code=502, detail="geo lookup failed")

    cache.set("geoip", key, result, GEO_TTL)
    return result


@app.get("/api/iprisk/{ip}")
async def iprisk(ip: str) -> dict:
    if not providers.is_valid_ip(ip):
        raise HTTPException(status_code=400, detail="invalid ip")

    cached = cache.get("iprisk", ip)
    if cached is not None:
        return cached

    result = await providers.lookup_risk(ip)
    if result is None:
        raise HTTPException(status_code=502, detail="risk lookup failed")

    cache.set("iprisk", ip, result, RISK_TTL)
    return result
