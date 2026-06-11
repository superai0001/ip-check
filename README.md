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

## 检查

```bash
cd frontend && npm run lint && npm run typecheck && npm run build
cd backend  && uv run ruff check .
```

## 新增被测网站

只改 `frontend/src/lib/config.ts` 的 `SPLIT_TESTS`，按 `method` 填 `domain`/`url` 即可。
