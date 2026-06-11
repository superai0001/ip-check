<script setup lang="ts">
import { computed } from 'vue'
import { flagEmoji } from '../lib/display'
import type { CurrentIp, PingState } from '../lib/types'

const props = defineProps<{
  currentIp: CurrentIp | null
  ipLoading: boolean
  pings: PingState[]
}>()

const flag = computed(() => flagEmoji(props.currentIp?.countryCode))

function latencyClass(latency: number | null): string {
  if (latency == null) return 'bad'
  if (latency < 80) return 'good'
  if (latency < 200) return 'ok'
  return 'slow'
}
</script>

<template>
  <section class="card hero">
    <div class="hero-ip">
      <div class="hero-label">📍 当前出口 IP (IPv4)</div>
      <template v-if="ipLoading">
        <div class="skeleton skeleton-ip" />
      </template>
      <template v-else-if="currentIp?.ip">
        <div class="hero-ip-value">
          <span class="flag">{{ flag }}</span>
          <span class="ip">{{ currentIp.ip }}</span>
        </div>
        <div class="hero-geo">{{ currentIp.geo || '未知归属地' }}</div>
        <div class="hero-tags">
          <span
            v-if="currentIp.isHosting !== null"
            class="badge"
            :class="currentIp.isHosting ? 'badge-hosting' : 'badge-isp'"
          >
            {{ currentIp.isHosting ? '🏢 机房 IP (Hosting)' : '🏠 住宅/ISP IP' }}
          </span>
          <span v-if="currentIp.source" class="source">来源: {{ currentIp.source }}</span>
        </div>
      </template>
      <template v-else>
        <div class="hero-ip-value error">无法获取出口 IP</div>
      </template>
    </div>

    <div class="hero-conn">
      <div class="hero-label">📡 网络连通性</div>
      <ul class="conn-list">
        <li v-for="p in pings" :key="p.name" class="conn-item">
          <span class="conn-name">
            <span class="dot" :class="p.status === 'loading' ? 'loading' : latencyClass(p.latency)" />
            {{ p.name }}
          </span>
          <span class="conn-latency" :class="latencyClass(p.latency)">
            <template v-if="p.status === 'loading'">…</template>
            <template v-else-if="p.latency == null">超时</template>
            <template v-else>{{ p.latency }}ms</template>
          </span>
        </li>
      </ul>
    </div>
  </section>
</template>
