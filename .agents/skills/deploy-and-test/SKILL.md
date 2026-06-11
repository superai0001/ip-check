---
name: deploy-and-test
description: How to deploy and end-to-end test the ip-check IP split-routing detector (frontend static + optional FastAPI backend). Use when deploying previews or testing the UI.
---

# Deploy & test ip-check

## Architecture
- `frontend/` Vite + Vue 3 + TS. Pure static; treats backend as optional and falls back to third-party geo APIs when no backend.
- `backend/` FastAPI (optional): `/api/geoip/{ip}`, `/api/iprisk/{ip}`, `/healthz`. SQLite TTL cache.
- Frontend points at backend via build-time `VITE_API_BASE` (empty = same-origin / standalone fallback).

## Deploy
### Frontend (static) — works standalone
```bash
cd frontend && npm run build          # standalone (third-party geo fallback)
# or wire to a backend:
cd frontend && VITE_API_BASE=https://your-backend npm run build
```
Deploy `frontend/dist/` (contains index.html) via the `deploy frontend` tool or any static host. `VITE_API_BASE` is embedded into the JS bundle at build time (verify with `grep your-backend dist/assets/*.js`).

### Backend (Docker self-deploy)
`deploy backend` (Devin/Fly template) does NOT work here — it only supports apps scaffolded from Devin's FastAPI template; this hand-written backend fails pre-flight with "Check that the project has a pyproject.toml and a FastAPI app". Use the Dockerfile instead:
```bash
cd backend
docker build -t ip-check-backend .
docker run -d -p 8080:8080 -v ipcheck-data:/data ip-check-backend
curl http://localhost:8080/healthz     # -> {"status":"ok"}
```
Listens on `$PORT` (default 8080). SQLite cache at `IPCHECK_DB_PATH` (default `/data/ipcheck.db`) — mount `/data` as a volume to persist. CORS is `allow_origins=["*"]` (GET only) in `backend/app/main.py`.

Local backend dev: `cd backend && IPCHECK_DB_PATH=./ipcheck.db uv run uvicorn app.main:app --reload --port 8000`.

## Test (UI, standalone)
Load the built/deployed frontend and verify:
- Split table populates (`frontend/src/lib/config.ts` `SPLIT_TESTS`, ~31 sites). Each row resolves an egress IP + geolocation.
- "重新检测" button (`App.vue` -> `useDetector.run()`) resets `rows`/`pings` then repopulates cleanly (generation counter guards stale writes).
- Without a proxy, all sites show the same egress IP — split differentiation can only be demoed behind a configured Xray-core/sing-box.
- `cloudflare.com`/`cdnjs` showing "未获取到 IP" is the documented expected state (cftrace didn't return), not a bug.

## Checks
```bash
cd frontend && npm run lint && npm run typecheck && npm run build
cd backend  && uv run ruff check .
```
