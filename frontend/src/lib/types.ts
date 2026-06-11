// Shared types for the IP split-routing detector.

export type SplitMethod = 'cftrace' | 'netease' | 'bytedance' | 'alibaba'
export type SiteType = 'domestic' | 'international'
export type SiteTag = 'ai' | 'social' | 'crypto' | 'tools' | 'speed' | 'dev' | 'media' | 'static'

// One entry in the split-routing test list. `domain`/`url`/`fallbackDomain`
// are consumed depending on `method` (see lib/detect.ts).
export interface SplitTest {
  name: string
  type: SiteType
  extra?: SiteTag[]
  method: SplitMethod
  domain?: string
  url?: string
  fallbackDomain?: string
  icon?: string
}

export type RowStatus = 'pending' | 'loading' | 'done' | 'error'

// Reactive per-row state rendered in the split table.
export interface RowState {
  status: RowStatus
  ip: string | null
  countryCode: string | null
  geo: string | null
  error: string | null
}

export interface GeoResult {
  geoString: string
  countryCode: string | null
  isp: string
}

// A connectivity probe target (latency measured via no-cors timing).
export interface PingTarget {
  name: string
  icon?: string
  url: string
  tag?: string
}

export interface PingState {
  name: string
  icon?: string
  tag?: string
  latency: number | null
  status: RowStatus
}

export interface CurrentIp {
  ip: string | null
  geo: string
  countryCode: string | null
  isHosting: boolean | null
  source: string
}
