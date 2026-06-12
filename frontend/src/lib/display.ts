import type { SiteTag } from './types'

export const TAG_LABELS: Record<SiteTag, string> = {
  ai: 'AI',
  social: 'Social',
  crypto: 'Crypto',
  tools: 'Tools',
  speed: 'Speed',
  dev: 'Dev',
  media: 'Media',
  static: 'Static',
}

export const TAG_EMOJI: Record<SiteTag, string> = {
  ai: '🤖',
  social: '💬',
  crypto: '🪙',
  tools: '🛠️',
  speed: '⚡',
  dev: '👨‍💻',
  media: '🎬',
  static: '📦',
}

// Country code -> emoji flag (no image assets needed).
export function flagEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return ''
  const cc = countryCode.toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return ''
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

// Compact long IPv6 for table display; full value kept for title/href.
export function compactIp(ip: string): string {
  if (!ip || !ip.includes(':')) return ip
  if (ip.length <= 22) return ip
  const parts = ip.split(':')
  return parts[0] + ':' + parts[1] + '…' + parts[parts.length - 1]
}
