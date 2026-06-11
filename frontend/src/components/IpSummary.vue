<script setup lang="ts">
import { compactIp, flagEmoji } from '../lib/display'

defineProps<{
  summary: { ip: string; countryCode: string }[]
}>()
</script>

<template>
  <section class="card summary">
    <div class="summary-head">
      <h2>分流出口 IP 汇总</h2>
      <span class="summary-count">{{ summary.length }} 个出口</span>
    </div>
    <p class="summary-hint">
      下面是所有被测网站实际使用的出口 IP（已去重）。出口数量越多，说明分流规则越细。
    </p>
    <div v-if="summary.length" class="summary-grid">
      <span v-for="item in summary" :key="item.ip" class="summary-ip" :title="item.ip">
        <span class="flag">{{ flagEmoji(item.countryCode) }}</span>
        <span>{{ compactIp(item.ip) }}</span>
      </span>
    </div>
    <div v-else class="summary-empty">检测中…</div>
  </section>
</template>
