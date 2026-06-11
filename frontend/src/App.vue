<script setup lang="ts">
import { onMounted, ref } from 'vue'
import HeroPanel from './components/HeroPanel.vue'
import IpSummary from './components/IpSummary.vue'
import SplitTable from './components/SplitTable.vue'
import { useDetector } from './composables/useDetector'

const { currentIp, ipLoading, pings, rows, summary, run } = useDetector()

const dark = ref(false)
function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
}

function rerun() {
  run()
}

onMounted(() => {
  dark.value = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  document.documentElement.classList.toggle('dark', dark.value)
  run()
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <span class="brand-logo">🌐</span>
        <span>IP 出口分流检测</span>
      </div>
      <div class="topbar-actions">
        <button class="btn primary" @click="rerun">🔄 重新检测</button>
        <button class="btn icon" :aria-label="dark ? '切换到亮色' : '切换到暗色'" @click="toggleTheme">
          {{ dark ? '☀️' : '🌙' }}
        </button>
      </div>
    </header>

    <main class="container">
      <h1>🛰️ <span class="title-grad">我的 IP 查询</span></h1>
      <p class="subtitle">查看当前出口 IP、地理位置、网络连通性，以及访问不同网站时的 IP 分流情况。</p>

      <HeroPanel :current-ip="currentIp" :ip-loading="ipLoading" :pings="pings" />
      <IpSummary :summary="summary" />
      <SplitTable :rows="rows" />
    </main>

    <footer class="footer">
      <span>ip-check · 出口分流检测工具</span>
    </footer>
  </div>
</template>
