import type { PingTarget } from './types'

// Measure latency to a target with `rounds` no-cors timed fetches; returns the
// median in ms (robust to outliers), or null if every round failed.
// no-cors means we cannot read the response, but the request timing is enough.
export async function measureLatency(target: PingTarget, rounds = 5): Promise<number | null> {
  const samples: number[] = []
  for (let i = 0; i < rounds; i++) {
    const start = performance.now()
    try {
      await fetch(target.url, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })
      samples.push(performance.now() - start)
    } catch {
      /* skip failed round */
    }
    // small gap between rounds to avoid connection coalescing skew
    if (i < rounds - 1) await new Promise((r) => setTimeout(r, 120))
  }
  if (samples.length === 0) return null
  samples.sort((a, b) => a - b)
  const mid = Math.floor(samples.length / 2)
  const median = samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2
  return Math.round(median)
}
