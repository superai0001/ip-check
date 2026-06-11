# ip-check — IP 出口分流检测工具

检测当前网络（Xray-core / sing-box 等代理客户端）的 **出口 IP** 与 **分流规则**：
访问不同网站时实际使用的是哪个出口 IP，从而验证分流配置是否生效。灵感来自
[ip.net.coffee](https://ip.net.coffee/)。

## 功能（首版）

- **当前出口 IP**：IPv4 地址 + 地理位置 + 是否机房 IP (Hosting)。
- **网络连通性**：对常用站点多轮 `no-cors` 计时，取中位数延迟。
- **网站分流测试**：对一组国内/国际站点检测各自的出口 IP 与归属地。
- **分流出口 IP 汇总**：对所有出口 IP 去重，直观看出分流粒度。

## 工作原理

分流检测在**浏览器侧**完成（代理/分流规则作用于客户端）。对每个目标网站发起一个
能回显"出口 IP"的请求；代理按该域名的分流规则选择出口，回显的 IP 即暴露了这条规则
走的出口。四种回显方式（见 `frontend/src/lib/detect.ts`）：

| method | 方式 | 适用 |
|---|---|---|
| `cftrace` | `GET https://<域名>/cdn-cgi/trace`，解析 `ip=`/`loc=` | 走 Cloudflare 的站点（多数） |
| `netease` | `HEAD` 读响应头 `cdn-user-ip` | 网易系 |
| `bytedance` | `HEAD` 读响应头 `x-request-ip` | 字节系 |
| `alibaba` | JSONP 取 `localIp`（绕 CORS） | 阿里系 |

出现"未获取到 IP"通常表示该站点不走 Cloudflare，不代表网络有问题。

## 目录结构

```
frontend/   Vite + Vue 3 + TypeScript 前端
  src/lib/        检测与数据逻辑（config/detect/geo/ip/ping/concurrency/display）
  src/components/ 展示组件（Hero / 分流表 / 出口汇总）
  src/composables/useDetector.ts  编排：建 state → 跑 Hero/连通性/分流表
backend/    FastAPI 后端（可选）：geo 缓存 + IP 风险评分
  app/main.py     /api/geoip/{ip}、/api/iprisk/{ip}、/healthz
  app/providers.py 上游数据源（ip-api.com / ipwho.is）+ 风险评分
  app/cache.py    SQLite TTL 缓存（geo 按 /24，30 天；risk 按 IP，7 天）
```

前端把后端视为**可选**：取不到后端时自动回退第三方 geo API，因此无后端也能运行。

## 本地开发

后端（可选）：
```bash
cd backend
uv sync
IPCHECK_DB_PATH=./ipcheck.db uv run uvicorn app.main:app --reload --port 8000
```

前端：
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 ，/api 默认代理到 :8000
```

构建：`cd frontend && npm run build`（产物在 `frontend/dist`）。

### 环境变量

- `VITE_API_BASE`（前端，构建期）：后端基址。前后端分开部署（静态前端 + 独立后端）
  时设置为后端 URL；同源部署留空即可。
- `IPCHECK_DB_PATH`（后端）：SQLite 文件路径，默认 `/data/ipcheck.db`。

## 部署（自部署）

前端是纯静态站点，后端是一个标准 FastAPI 服务，两者分开部署，前端通过构建期变量
`VITE_API_BASE` 指向后端地址。

### 1. 后端（Docker）

`backend/Dockerfile` 已就绪（已用 Docker 实测构建+运行通过）：

```bash
cd backend
docker build -t ip-check-backend .
# 挂卷持久化 SQLite 缓存；容器内监听 8080，这里映射到宿主 8080
docker run -d -p 8080:8080 -v ipcheck-data:/data ip-check-backend
curl http://localhost:8080/healthz          # -> {"status":"ok"}
```

- 监听端口取 `$PORT`，默认 `8080`（Fly.io / Render / Cloud Run 会自动注入 `$PORT`）。
- SQLite 缓存写在 `IPCHECK_DB_PATH`（默认 `/data/ipcheck.db`）；务必把 `/data` 挂成卷，
  否则重启后缓存丢失。
- **CORS**：后端默认 `allow_origins=["*"]`（仅 `GET`），所以静态前端跨域调用即可。
  若要收紧，改 `backend/app/main.py` 里的 `CORSMiddleware`，把前端域名加进白名单。

平台示例：
- **Fly.io**：`cd backend && fly launch --dockerfile Dockerfile`（用上面的 Dockerfile），
  并 `fly volumes create ipcheck_data --size 1` 后在 `fly.toml` 挂到 `/data`。
- **Render**：New → Web Service → 选 Docker，Root Directory 设为 `backend`，加一个挂到
  `/data` 的 Disk。
- 任意支持 Docker 的主机：直接用上面的 `docker run`。

不用 Docker 也可以：

```bash
cd backend && uv sync --no-dev
IPCHECK_DB_PATH=/var/lib/ipcheck/ipcheck.db uv run uvicorn app.main:app --host 0.0.0.0 --port 8080
```

### 2. 前端（静态）

构建期把 `VITE_API_BASE` 设为上一步的后端公网地址，再发布 `frontend/dist`：

```bash
cd frontend
VITE_API_BASE=https://your-backend.example.com npm run build
# 把 frontend/dist/ 部署到任意静态托管（Netlify / Vercel / Cloudflare Pages / Nginx 等）
```

- `VITE_API_BASE` 留空则前端走第三方 geo 兜底（无 `机房 IP (Hosting)` 徽标与服务端缓存）。
- 若前后端**同源**（同一域名下用反向代理把 `/api` 转发到后端），`VITE_API_BASE` 留空即可。

## 检查

```bash
cd frontend && npm run lint && npm run typecheck && npm run build
cd backend  && uv run ruff check .
```

## 新增被测网站

只改 `frontend/src/lib/config.ts` 的 `SPLIT_TESTS`，按 `method` 填 `domain`/`url` 即可。
