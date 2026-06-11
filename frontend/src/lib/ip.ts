import { API_BASE } from './config'
import { lookupGeo } from './geo'
import type { CurrentIp } from './types'

// Get the current egress IPv4 via Cloudflare trace, with fallbacks.
async function fetchEgressIp(): Promise<{ ip: string | null; loc: string | null; source: string }> {
  try {
    const r = await fetch('https://1.1.1.1/cdn-cgi/trace', {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    const text = await r.text()
    const ip = text.match(/\bip=([^\n]+)/)?.[1]?.trim() || null
    const loc = text.match(/\bloc=([^\n]+)/)?.[1]?.trim().toLowerCase() || null
    if (ip) return { ip, loc, source: 'Cloudflare' }
  } catch {
    /* fall through */
  }
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(6000) })
    const d = await r.json()
    if (d.ip) return { ip: d.ip, loc: null, source: 'ipify' }
  } catch {
    /* give up */
  }
  return { ip: null, loc: null, source: '' }
}

// Ask the backend whether the IP belongs to a hosting/datacenter ASN.
// Returns null when the backend is unavailable (UI then shows unknown).
async function fetchHosting(ip: string): Promise<boolean | null> {
  if (!API_BASE && import.meta.env.PROD) return null
  try {
    const r = await fetch(`${API_BASE}/api/iprisk/${ip}`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const d = await r.json()
    return typeof d.is_hosting === 'boolean' ? d.is_hosting : null
  } catch {
    return null
  }
}

// Hero query: current egress IP + geo + hosting flag.
export async function queryCurrentIp(): Promise<CurrentIp> {
  const { ip, loc, source } = await fetchEgressIp()
  if (!ip) return { ip: null, geo: '', countryCode: null, isHosting: null, source: '' }

  const [geoResult, isHosting] = await Promise.all([lookupGeo(ip), fetchHosting(ip)])
  return {
    ip,
    geo: geoResult?.geoString || '',
    countryCode: geoResult?.countryCode || loc || null,
    isHosting,
    source,
  }
}
