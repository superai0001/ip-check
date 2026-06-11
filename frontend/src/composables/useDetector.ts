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

  async function runIpQuery() {
    ipLoading.value = true
    try {
      currentIp.value = await queryCurrentIp()
    } finally {
      ipLoading.value = false
    }
  }

  function runPings() {
    return runWithLimit(PING_TARGETS, PING_CONCURRENCY, async (target, i) => {
      const latency = await measureLatency(target)
      pings[i].latency = latency
      pings[i].status = latency == null ? 'error' : 'done'
    })
  }

  function runSplitTests() {
    return runWithLimit(SPLIT_TESTS, SPLIT_CONCURRENCY, async (test, i) => {
      rows[i].status = 'loading'
      try {
        const { ip, countryCode } = await runSplitTest(test)
        rows[i].ip = ip
        rows[i].countryCode = countryCode
        rows[i].status = ip ? 'done' : 'error'
        rows[i].error = ip ? null : '未获取到 IP'
        if (ip) {
          const geo = await lookupGeo(ip)
          if (geo) {
            rows[i].geo = geo.geoString
            if (!rows[i].countryCode) rows[i].countryCode = geo.countryCode
          }
        }
      } catch (e) {
        rows[i].status = 'error'
        rows[i].error = e instanceof Error ? e.message : '获取失败'
      }
    })
  }

  function run() {
    void runIpQuery()
    void runPings()
    void runSplitTests()
  }

  return { currentIp, ipLoading, pings, rows, summary, run }
}
