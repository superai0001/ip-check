import { API_BASE } from './config'
import type { GeoResult } from './types'

const geoCache = new Map<string, GeoResult | null>()
const geoInflight = new Map<string, Promise<GeoResult | null>>()

// Normalize to /24 (IPv4) so nearby addresses share a cache entry.
function normalizeIp(ip: string): string {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/\.\d+$/, '.1')
  return ip
}

// Primary: our own backend cache (SQLite, /24 keyed). Returns null on any error.
async function fetchGeoFromServer(ip: string): Promise<GeoResult | null> {
  if (!API_BASE && import.meta.env.PROD) {
    // Same-origin static deploy with no backend: skip straight to fallback.
    return null
  }
  try {
    const r = await fetch(`${API_BASE}/api/geoip/${ip}`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const d = await r.json()
    if (!d || (!d.country && !d.country_code)) return null
    return {
      geoString: [d.country, d.region, d.city, d.isp].filter(Boolean).join(' '),
      countryCode: d.country_code?.toLowerCase() || null,
      isp: d.isp || '',
    }
  } catch {
    return null
  }
}

// Fallback: free third-party geo APIs, tried in order.
async function fetchGeoFallback(ip: string): Promise<GeoResult | null> {
  try {
    const r = await fetch(`https://api.ip.sb/geoip/${ip}`, { signal: AbortSignal.timeout(5000) })
    if (r.ok) {
      const d = await r.json()
      if (d.country) {
        return {
          geoString: [d.country, d.region, d.city, d.isp || d.organization].filter(Boolean).join(' '),
          countryCode: d.country_code?.toLowerCase() || null,
          isp: d.isp || d.organization || '',
        }
      }
    }
  } catch {
    /* try next */
  }
  try {
    const r = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(5000) })
    const d = await r.json()
    if (d.success) {
      return {
        geoString: [d.country, d.region, d.city, d.connection?.isp].filter(Boolean).join(' '),
        countryCode: d.country_code?.toLowerCase() || null,
        isp: d.connection?.isp || '',
      }
    }
  } catch {
    /* give up */
  }
  return null
}

// IP -> geo with in-memory cache (L1) + in-flight dedup (L2) + server/third-party (L3).
export async function lookupGeo(ip: string | null): Promise<GeoResult | null> {
  if (!ip) return null
  const key = normalizeIp(ip)

  if (geoCache.has(key)) return geoCache.get(key) ?? null
  const inflight = geoInflight.get(key)
  if (inflight) return inflight

  const promise = (async () => {
    let result = await fetchGeoFromServer(ip)
    if (!result) result = await fetchGeoFallback(ip)
    // Only cache successes, so a transient failure can be retried on re-run.
    if (result) geoCache.set(key, result)
    return result
  })()

  geoInflight.set(key, promise)
  try {
    return await promise
  } finally {
    geoInflight.delete(key)
  }
}
