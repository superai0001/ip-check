import type { PingTarget, SplitTest } from './types'

// Backend base URL. Empty = same-origin ("/api/..." served by the backend or a
// reverse proxy). In a split deployment (static frontend + Fly.io backend) set
// VITE_API_BASE at build time. Geo/risk calls fall back to third-party APIs when
// the backend is unavailable, so the app works even with no backend.
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

// Connectivity probes — measured purely by request timing (no-cors). URLs point
// at tiny/cacheable assets (favicons, generate_204) on each provider's edge.
export const PING_TARGETS: PingTarget[] = [
  { name: '字节跳动', tag: 'cn', url: 'https://perfops.byte-test.com/500b-bench.jpg' },
  { name: '淘宝', tag: 'cn', url: 'https://www.taobao.com/favicon.ico' },
  { name: '微信', tag: 'cn', url: 'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico' },
  { name: 'GitHub', url: 'https://github.com/favicon.ico' },
  { name: 'Cloudflare', url: 'https://1.1.1.1/cdn-cgi/trace' },
  { name: 'YouTube', url: 'https://www.youtube.com/generate_204' },
]

// Split-routing test list — the only data that needs ongoing maintenance.
// Add a site by appending an entry here.
//   method:
//     cftrace   -> GET https://<domain>/cdn-cgi/trace  (any Cloudflare site)
//     netease   -> HEAD necaptcha.nosdn.127.net asset, read cdn-user-ip header
//     bytedance -> HEAD <url>, read x-request-ip header
//     alibaba   -> JSONP via *.dns-detect.alicdn.com
export const SPLIT_TESTS: SplitTest[] = [
  // ---- 国内 (domestic) ----
  { name: '网易', type: 'domestic', method: 'netease' },
  { name: '阿里云', type: 'domestic', method: 'alibaba' },
  { name: '字节跳动', type: 'domestic', method: 'bytedance', url: 'https://perfops.byte-test.com/500b-bench.jpg' },
  { name: '高通中国', type: 'domestic', method: 'cftrace', domain: 'www.qualcomm.cn' },

  // ---- 国际 (international) ----
  { name: '字节海外', type: 'international', extra: ['dev'], method: 'bytedance', url: 'https://perfops2.byte-test.com/500b-bench.jpg' },
  { name: 'discord.com', type: 'international', extra: ['social'], method: 'cftrace', domain: 'discord.com', fallbackDomain: 'gateway.discord.gg' },
  { name: 'x.com', type: 'international', extra: ['social'], method: 'cftrace', domain: 'x.com' },
  { name: 'medium.com', type: 'international', extra: ['social'], method: 'cftrace', domain: 'medium.com' },

  { name: 'anthropic.com', type: 'international', extra: ['ai'], method: 'cftrace', domain: 'anthropic.com' },
  { name: 'claude.ai', type: 'international', extra: ['ai'], method: 'cftrace', domain: 'claude.ai' },
  { name: 'chatgpt.com', type: 'international', extra: ['ai'], method: 'cftrace', domain: 'chatgpt.com' },
  { name: 'openai.com', type: 'international', extra: ['ai'], method: 'cftrace', domain: 'openai.com' },
  { name: 'sora.com', type: 'international', extra: ['ai'], method: 'cftrace', domain: 'sora.com' },
  { name: 'grok.com', type: 'international', extra: ['ai'], method: 'cftrace', domain: 'grok.com' },
  { name: 'perplexity.ai', type: 'international', extra: ['ai'], method: 'cftrace', domain: 'www.perplexity.ai' },
  { name: 'midjourney.com', type: 'international', extra: ['ai'], method: 'cftrace', domain: 'midjourney.com' },

  { name: 'coinbase.com', type: 'international', extra: ['crypto'], method: 'cftrace', domain: 'coinbase.com' },
  { name: 'www.okx.com', type: 'international', extra: ['crypto'], method: 'cftrace', domain: 'www.okx.com' },

  { name: 'zoom.us', type: 'international', extra: ['tools'], method: 'cftrace', domain: 'zoom.us' },
  { name: '1password.com', type: 'international', extra: ['tools'], method: 'cftrace', domain: '1password.com' },
  { name: 'wise.com', type: 'international', extra: ['tools'], method: 'cftrace', domain: 'wise.com' },
  { name: 'godaddy.com', type: 'international', extra: ['tools'], method: 'cftrace', domain: 'godaddy.com' },
  { name: 'producthunt.com', type: 'international', extra: ['tools'], method: 'cftrace', domain: 'producthunt.com' },

  { name: 'cloudflare.com', type: 'international', extra: ['speed'], method: 'cftrace', domain: 'www.cloudflare.com' },
  { name: 'cloudflare cdnjs', type: 'international', extra: ['static'], method: 'cftrace', domain: 'cdnjs.cloudflare.com' },
  { name: 'npm registry', type: 'international', extra: ['static'], method: 'cftrace', domain: 'registry.npmjs.org' },
  { name: 'kali.download', type: 'international', extra: ['static'], method: 'cftrace', domain: 'kali.download' },
  { name: 'unpkg.com', type: 'international', extra: ['static'], method: 'cftrace', domain: 'unpkg.com' },

  { name: 'nodejs.org', type: 'international', extra: ['dev'], method: 'cftrace', domain: 'nodejs.org' },
  { name: 'gitlab.com', type: 'international', extra: ['dev'], method: 'cftrace', domain: 'gitlab.com' },
  { name: 'crunchyroll.com', type: 'international', extra: ['media'], method: 'cftrace', domain: 'crunchyroll.com' },
]

// Concurrency for split tests / pings (sliding window).
export const SPLIT_CONCURRENCY = 6
export const PING_CONCURRENCY = 6
