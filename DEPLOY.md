# 部署文档（自部署到 VPS）

本文档手把手把 **ip-check** 部署到一台你自己的 Linux 服务器（VPS）。

- 后端：FastAPI 服务（geo 缓存 + IP 风险评分），用 Docker 运行。
- 前端：Vite 构建出的纯静态站点，通过构建期变量 `VITE_API_BASE` 指向后端。

> 标注 **[已实测]** 的步骤已在本项目用 Docker 验证通过；反向代理 / HTTPS / systemd 部分为标准通用做法，按你的发行版可能略有差异。

推荐两种拓扑，二选一：
- **方案 A（推荐，最省心）**：前后端**同源**——同一个 Nginx，`/` 服务前端静态文件，`/api` 反代到后端。前端 `VITE_API_BASE` 留空，**无需处理 CORS**。
- **方案 B**：前端托管在别处（Netlify/Vercel/CF Pages 等），后端单独一个域名。前端构建时设 `VITE_API_BASE=https://api.你的域名`，并确保后端 CORS 允许前端域名（后端默认 `*`，已可用）。

---

## 0. 前置条件

- 一台 Linux VPS（Ubuntu/Debian 示例），有 `sudo` 权限。
- 一个域名（启用 HTTPS 时需要），把 A 记录解析到服务器 IP。
  - 方案 A：一个域名即可，如 `ip.example.com`。
  - 方案 B：两个，如 `ip.example.com`（前端）+ `api.example.com`（后端）。
- 开放安全组/防火墙的 80、443 端口。

### 安装 Docker（Ubuntu/Debian）

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 让当前用户免 sudo 用 docker（重新登录后生效）
docker version                  # 验证
```

### 拉取代码

```bash
git clone https://github.com/superai0001/ip-check.git
cd ip-check
# 若部署 PR 分支：git checkout devin/1781155161-ip-split-detector
```

---

## 1. 部署后端（Docker） [已实测]

```bash
cd ip-check/backend

# 构建镜像
docker build -t ip-check-backend .

# 创建持久化卷（存放 SQLite 缓存），并后台运行容器
docker volume create ipcheck-data
docker run -d \
  --name ip-check-backend \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v ipcheck-data:/data \
  ip-check-backend

# 验证（应返回 {"status":"ok"}）
curl http://127.0.0.1:8080/healthz
# 试一下真实接口
curl http://127.0.0.1:8080/api/iprisk/8.8.8.8
curl http://127.0.0.1:8080/api/geoip/8.8.8.8
```

要点：
- `-p 127.0.0.1:8080:8080`：只绑定到本机回环，外部通过 Nginx 反代访问（更安全）。若想直接对外暴露，改成 `-p 8080:8080` 并在防火墙放行 8080。
- 容器内监听 `$PORT`，默认 `8080`；如需改端口：`-e PORT=9000 -p 127.0.0.1:9000:9000`。
- SQLite 缓存写在容器内 `/data/ipcheck.db`（由 `IPCHECK_DB_PATH` 指定），通过 `-v ipcheck-data:/data` 持久化，重启/升级不丢缓存。
- `--restart unless-stopped`：开机自启、崩溃自动重启。

### 常用运维命令

```bash
docker logs -f ip-check-backend      # 看日志
docker restart ip-check-backend      # 重启
docker stop ip-check-backend         # 停止
```

### （可选）不想用 Docker？用 uv + systemd

```bash
# 装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

cd ip-check/backend
uv sync --no-dev

# 手动跑（前台测试）
IPCHECK_DB_PATH=/var/lib/ipcheck/ipcheck.db \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8080
```

做成 systemd 服务 `/etc/systemd/system/ip-check.service`：

```ini
[Unit]
Description=ip-check backend
After=network.target

[Service]
WorkingDirectory=/home/youruser/ip-check/backend
Environment=IPCHECK_DB_PATH=/var/lib/ipcheck/ipcheck.db
ExecStart=/home/youruser/.local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port 8080
Restart=always
User=youruser

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/lib/ipcheck && sudo chown youruser /var/lib/ipcheck
sudo systemctl daemon-reload
sudo systemctl enable --now ip-check
sudo systemctl status ip-check
```

---

## 2. 构建前端

```bash
cd ip-check/frontend
npm install
```

- **方案 A（同源，推荐）**：留空 `VITE_API_BASE`，前端通过相对路径 `/api/...` 调后端。
  ```bash
  npm run build           # 产物在 frontend/dist/
  ```
- **方案 B（前后端不同域名）**：构建时把后端公网地址写进去。
  ```bash
  VITE_API_BASE=https://api.example.com npm run build
  # 验证已写入：
  grep -o "api.example.com" dist/assets/*.js | head -1
  ```

> `VITE_API_BASE` 是**构建期**变量，改了必须重新 `npm run build`。留空时若线上是同源且有 `/api` 反代则正常；若既留空又无后端，前端会自动回退第三方 geo（没有「机房 IP (Hosting)」徽标和服务端缓存）。

把 `frontend/dist/` 整个目录上传到服务器，例如 `/var/www/ip-check`：

```bash
# 在本地或服务器上构建后：
sudo mkdir -p /var/www/ip-check
sudo cp -r dist/* /var/www/ip-check/
```

---

## 3. Nginx 反向代理 + HTTPS

```bash
sudo apt-get update && sudo apt-get install -y nginx
```

### 方案 A：同源（一个域名，前端 + /api 反代）

`/etc/nginx/sites-available/ip-check`：

```nginx
server {
    listen 80;
    server_name ip.example.com;

    root /var/www/ip-check;
    index index.html;

    # 前端静态（SPA：找不到文件回退到 index.html）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 反代到本机 8080
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 健康检查（可选）
    location = /healthz {
        proxy_pass http://127.0.0.1:8080/healthz;
    }
}
```

### 方案 B：后端独立域名

`/etc/nginx/sites-available/ip-check-api`：

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

前端 `ip.example.com` 则用静态托管或另一段类似方案 A 的 `location /`（不带 `/api` 反代）。

### 启用站点 + 申请 HTTPS 证书

```bash
sudo ln -s /etc/nginx/sites-available/ip-check /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Let's Encrypt 免费证书（自动改写 Nginx 配置为 443 + 自动续期）
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ip.example.com
# 方案 B 后端域名同理：sudo certbot --nginx -d api.example.com
```

---

## 4. CORS 说明

- **方案 A（同源）**：前端与 `/api` 同域名，**不涉及跨域**，无需任何 CORS 配置。
- **方案 B（跨域）**：后端默认 `allow_origins=["*"]`（仅 `GET`），开箱即用。
  若要收紧到只允许你的前端域名，编辑 `backend/app/main.py` 的 `CORSMiddleware`：
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["https://ip.example.com"],  # 改成你的前端域名
      allow_methods=["GET"],
      allow_headers=["*"],
  )
  ```
  改完重新 `docker build` + 重启容器。

---

## 5. 验证清单

1. 后端：`curl https://api.example.com/healthz`（方案 B）或 `curl https://ip.example.com/healthz`（方案 A）→ `{"status":"ok"}`。
2. 接口：`curl https://.../api/iprisk/8.8.8.8` → 返回含 `asn`、`is_hosting`、`risk_score` 的 JSON。
3. 浏览器打开前端域名：
   - 「当前出口 IP」「网络连通性」「网站分流测试」表正常加载。
   - 后端接通时，Hero 区出现 **机房 IP (Hosting)** 徽标（数据来自 `/api/iprisk`）；这是「后端是否生效」的直观标志。
   - 点「重新检测」可重跑。
4. 打开浏览器开发者工具 Network，确认对 `/api/iprisk`、`/api/geoip` 的请求返回 200。

---

## 6. 升级 / 回滚

```bash
cd ip-check && git pull
# 后端
cd backend && docker build -t ip-check-backend . \
  && docker rm -f ip-check-backend \
  && docker run -d --name ip-check-backend --restart unless-stopped \
       -p 127.0.0.1:8080:8080 -v ipcheck-data:/data ip-check-backend
# 前端
cd ../frontend && npm install && npm run build && sudo cp -r dist/* /var/www/ip-check/
```

缓存卷 `ipcheck-data` 在升级中保留；要清空缓存：`docker volume rm ipcheck-data`（容器需先停）。

---

## 7. 故障排查

| 现象 | 排查 |
|---|---|
| 前端能开但没有「机房 IP (Hosting)」徽标 | 后端没接通：检查 `VITE_API_BASE` 是否正确并**重新构建**；方案 A 检查 `/api` 反代；`curl .../api/iprisk/8.8.8.8` 是否 200 |
| 接口 502 / 504 | 后端容器没起来或端口不对：`docker ps`、`docker logs ip-check-backend`、确认 Nginx `proxy_pass` 端口与容器一致 |
| 跨域报错 (CORS) | 仅方案 B：确认后端 `allow_origins` 含前端域名；或改用方案 A 同源 |
| 表里有站点显示「未获取到 IP」 | 预期现象（该站点 cftrace 未返回），非故障 |
| 缓存重启后丢失 | 没挂卷：确认 `-v ipcheck-data:/data` |
| 想确认分流差异 | 需在**已配置 Xray-core/sing-box 代理**的网络环境打开前端；无代理时所有站点会是同一个出口 IP |

---

如需我把本仓库直接接入某平台（Fly.io / Render / Cloud Run 等）的自动化部署，告诉我平台与凭据即可。
