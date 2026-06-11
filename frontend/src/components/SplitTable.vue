<script setup lang="ts">
import { SPLIT_TESTS } from '../lib/config'
import { TAG_LABELS, compactIp, flagEmoji } from '../lib/display'
import type { RowState } from '../lib/types'

defineProps<{
  rows: RowState[]
}>()
</script>

<template>
  <section class="card">
    <header class="table-head">
      <h2>网站分流测试</h2>
      <p>
        如果当前网络做了 IP 分流，下面可以看到访问不同网站时使用的出口 IP。
        出现"未获取到 IP"通常表示该站点不走 Cloudflare，并不代表网络有问题。
      </p>
    </header>

    <div class="table-wrap">
      <table class="split-table">
        <thead>
          <tr>
            <th>Website</th>
            <th>IP</th>
            <th>Geolocation</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(test, i) in SPLIT_TESTS" :key="test.name + i">
            <td>
              <div class="site-cell">
                <span class="site-name">{{ test.name }}</span>
                <span class="badge" :class="test.type === 'domestic' ? 'badge-domestic' : 'badge-international'">
                  {{ test.type === 'domestic' ? '国内' : '国际' }}
                </span>
                <span v-for="tag in test.extra || []" :key="tag" class="badge" :class="`badge-${tag}`">
                  {{ TAG_LABELS[tag] }}
                </span>
              </div>
            </td>
            <td class="ip-col">
              <template v-if="rows[i].status === 'loading' || rows[i].status === 'pending'">
                <span class="skeleton skeleton-cell" />
              </template>
              <template v-else-if="rows[i].status === 'error'">
                <span class="error-text">{{ rows[i].error }}</span>
              </template>
              <template v-else>
                <span class="flag">{{ flagEmoji(rows[i].countryCode) }}</span>
                <span class="ip-mono" :title="rows[i].ip || ''">{{ compactIp(rows[i].ip || '') }}</span>
              </template>
            </td>
            <td class="geo-col">
              <template v-if="rows[i].status === 'done'">{{ rows[i].geo || '' }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
