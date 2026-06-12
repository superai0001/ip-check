import type { SplitTest } from './types'

const TIMEOUT_MS = 6000

// Cloudflare's /cdn-cgi/trace is the primary method: it works for any site
// fronted by Cloudflare and is readable cross-origin. The plain-text body
// contains `ip=<egress ip>` and `loc=<country code>` as seen by the CF edge,
// which reflects the proxy routing rule applied to <domain>.
export async function detectCftrace(domain: string): Promise<{ ip: string | null; loc: string | null }> {
  const resp = await fetch(`https://${domain}/cdn-cgi/trace`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await resp.text()
  const entries: Record<string, string> = {}
  for (const line of text.trim().split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0) entries[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return { ip: entries.ip || null, loc: entries.loc?.toLowerCase() || null }
}

// Netease: HEAD an edge asset and read the `cdn-user-ip` response header
// (exposed via Access-Control-Expose-Headers).
export async function detectNetease(): Promise<{ ip: string }> {
  const resp = await fetch(
    'https://necaptcha.nosdn.127.net/ab7f4275c1744aa28e0a8f3a1c58c532.png',
    { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) },
  )
  const ip = resp.headers.get('cdn-user-ip')
  if (ip) return { ip }
  throw new Error('未获取到 IP')
}

// Bytedance: HEAD a benchmark asset and read x-request-ip / x-response-cinfo.
export async function detectBytedance(url: string): Promise<{ ip: string }> {
  const resp = await fetch(url, {
    method: 'HEAD',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const ip = resp.headers.get('x-request-ip') || resp.headers.get('x-response-cinfo')
  if (ip) return { ip }
  throw new Error('未获取到 IP')
}

// Alibaba: JSONP via *.dns-detect.alicdn.com — bypasses CORS using a <script>
// tag, the callback receives content.localIp + ipCountry.
export function detectAlibaba(): Promise<{ ip: string; countryCode: string | null }> {
  return new Promise((resolve, reject) => {
    const cbName = '__ali_cb_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const randomStr = Date.now() + '-' + Math.random().toString(36).slice(2, 18)
    const url = `https://${randomStr}.dns-detect.alicdn.com/api/detect/DescribeDNSLookup?cb=${cbName}`

    const win = window as unknown as Record<string, unknown>
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('超时'))
    }, TIMEOUT_MS)

    function cleanup() {
      clearTimeout(timer)
      delete win[cbName]
      document.getElementById('script-' + cbName)?.remove()
    }

    win[cbName] = (data: { content?: { localIp?: string; ipCountry?: string } }) => {
      cleanup()
      const ip = data?.content?.localIp
      if (ip) resolve({ ip, countryCode: data.content?.ipCountry?.toLowerCase() || null })
      else reject(new Error('无 IP 数据'))
    }

    const script = document.createElement('script')
    script.id = 'script-' + cbName
    script.src = url
    script.async = true
    script.onerror = () => {
      cleanup()
      reject(new Error('加载失败'))
    }
    document.body.appendChild(script)
  })
}

// Dispatch a single split test by method and normalize the result.
// cftrace retries with fallbackDomain when the primary domain has no trace.
export async function runSplitTest(test: SplitTest): Promise<{ ip: string | null; countryCode: string | null }> {
  switch (test.method) {
    case 'cftrace': {
      let result: { ip: string | null; loc: string | null }
      try {
        result = await detectCftrace(test.domain!)
      } catch (e) {
        if (test.fallbackDomain) result = await detectCftrace(test.fallbackDomain)
        else throw e
      }
      if (!result.ip && test.fallbackDomain) {
        result = await detectCftrace(test.fallbackDomain)
      }
      return { ip: result.ip, countryCode: result.loc }
    }
    case 'netease': {
      const r = await detectNetease()
      return { ip: r.ip, countryCode: null }
    }
    case 'bytedance': {
      const r = await detectBytedance(test.url!)
      return { ip: r.ip, countryCode: null }
    }
    case 'alibaba': {
      const r = await detectAlibaba()
      return { ip: r.ip, countryCode: r.countryCode }
    }
  }
}
