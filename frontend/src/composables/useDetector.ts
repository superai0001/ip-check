import { computed, reactive, ref } from 'vue'
import { PING_CONCURRENCY, PING_TARGETS, SPLIT_CONCURRENCY, SPLIT_TESTS } from '../lib/config'
import { runWithLimit } from '../lib/concurrency'
import { runSplitTest } from '../lib/detect'
import { lookupGeo } from '../lib/geo'
import { queryCurrentIp } from '../lib/ip'
import { measureLatency } from '../lib/ping'
import type { CurrentIp, PingState, RowState } from '../lib/types'

// Central orchestrator: owns reactive state and runs Hero / connectivity /
// split-routing detection (see control flow in README).
export function useDetector() {
  const currentIp = ref<CurrentIp | null>(null)
  const ipLoading = ref(true)

  // Bumped on every run(); workers from a superseded run check it and become
  // no-ops, so a re-run never has stale writes overwriting fresh results.
  let generation = 0

  const pings = reactive<PingState[]>(
    PING_TARGETS.map((t) => ({ name: t.name, icon: t.icon, tag: t.tag, latency: null, status: 'loading' })),
  )

  const rows = reactive<RowState[]>(
    SPLIT_TESTS.map(() => ({ status: 'pending', ip: null, countryCode: null, geo: null, error: null })),
  )

  // Dedup egress IPs across all completed rows -> "split egress summary".
  const summary = computed(() => {
    const seen = new Map<string, string>()
    for (const r of rows) {
      if (r.status === 'done' && r.ip && !seen.has(r.ip)) {
        seen.set(r.ip, r.countryCode || '')
      }
    }
    return [...seen.entries()].map(([ip, countryCode]) => ({ ip, countryCode }))
  })

  async function runIpQuery(gen: number) {
    ipLoading.value = true
    try {
      const result = await queryCurrentIp()
      if (gen !== generation) return
      currentIp.value = result
    } finally {
      if (gen === generation) ipLoading.value = false
    }
  }

  function runPings(gen: number) {
    return runWithLimit(PING_TARGETS, PING_CONCURRENCY, async (target, i) => {
      const latency = await measureLatency(target)
      if (gen !== generation) return
      pings[i].latency = latency
      pings[i].status = latency == null ? 'error' : 'done'
    })
  }

  function runSplitTests(gen: number) {
    return runWithLimit(SPLIT_TESTS, SPLIT_CONCURRENCY, async (test, i) => {
      if (gen !== generation) return
      rows[i].status = 'loading'
      try {
        const { ip, countryCode } = await runSplitTest(test)
        if (gen !== generation) return
        rows[i].ip = ip
        rows[i].countryCode = countryCode
        rows[i].status = ip ? 'done' : 'error'
        rows[i].error = ip ? null : '未获取到 IP'
        if (ip) {
          const geo = await lookupGeo(ip)
          if (gen !== generation) return
          if (geo) {
            rows[i].geo = geo.geoString
            if (!rows[i].countryCode) rows[i].countryCode = geo.countryCode
          }
        }
      } catch (e) {
        if (gen !== generation) return
        rows[i].status = 'error'
        rows[i].error = e instanceof Error ? e.message : '获取失败'
      }
    })
  }

  function run() {
    const gen = ++generation
    // Reset reactive state so a re-run shows fresh loading state immediately.
    ipLoading.value = true
    for (let i = 0; i < pings.length; i++) {
      pings[i].latency = null
      pings[i].status = 'loading'
    }
    for (let i = 0; i < rows.length; i++) {
      rows[i].status = 'pending'
      rows[i].ip = null
      rows[i].countryCode = null
      rows[i].geo = null
      rows[i].error = null
    }
    void runIpQuery(gen)
    void runPings(gen)
    void runSplitTests(gen)
  }

  return { currentIp, ipLoading, pings, rows, summary, run }
}
