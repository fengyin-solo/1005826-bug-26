<template>
  <section class="page" data-module="drainpipe-line-order">
    <header class="page-head">
      <div>
        <h2>排水管网线序视图</h2>
        <p class="page-desc">
          线序按起点井号、终点井号、管径落定唯一顺序并写存在数据里；已废弃管段统一收在末尾，重新进入顺序不变。
        </p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/drainpipe">返回管网列表</RouterLink>
      </div>
    </header>

    <p v-if="patrolCodes.length" class="callout callout-patrol">
      当前有 <strong>{{ patrolCodes.length }}</strong> 段待巡线：
      <RouterLink
        v-for="code in patrolCodes"
        :key="code.id"
        class="patrol-chip"
        :to="`/drainpipe/${code.id}`"
      >
        第 {{ code.position }} 段 · {{ code.label }}
      </RouterLink>
    </p>
    <p v-else class="callout callout-ok">没有待巡线管段，全线状态正常。</p>

    <div class="stat-row">
      <article v-for="item in metricCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <div v-if="line.length" class="line-chain">
      <template v-for="(row, index) in line" :key="String(row.id)">
        <div
          v-if="index > 0 && String(row.status) === '已废弃' && String(line[index - 1].status) !== '已废弃'"
          class="line-divider"
        >
          <span>以下为已废弃管段</span>
        </div>
        <div
          v-else-if="index > 0 && String(row.status) !== '已废弃'"
          class="line-arrow"
          aria-hidden="true"
        >
          →
        </div>
        <RouterLink class="line-seg" :class="segClass(row)" :to="`/drainpipe/${row.id}`">
          <span class="line-seg-pos">第 {{ index + 1 }} 段</span>
          <span class="line-seg-wells">{{ row['起点井号'] }} → {{ row['终点井号'] }}</span>
          <span class="line-seg-meta">{{ row['管径'] }} · {{ row['管段编号'] }}</span>
          <span class="status-badge" :class="badgeClass(String(row.status))">{{ row.status }}</span>
        </RouterLink>
      </template>
    </div>
    <p v-else class="empty-state" style="padding: 24px">暂无管段，可先到管网列表登记。</p>

    <footer class="page-foot">
      <span>全线共 {{ line.length }} 段，顺序以数据中落存的线序为准（列表 / 详情 / 概览同口径）。</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  drainpipeMetricCards,
  listPipeLine,
  pipePatrolPending,
} from '@/api/local-service'
import { ABANDONED_STATUS } from '@/data/line-order'
import type { EntryRow } from '@/data/types'

const line = ref<EntryRow[]>([])
const metricCards = ref(drainpipeMetricCards())

const patrolCodes = computed(() =>
  line.value
    .map((row, index) => ({
      id: Number(row.id),
      position: index + 1,
      label: `${row['起点井号']} → ${row['终点井号']}（${row['管段编号']}）`,
    }))
    .filter((_, index) => pipePatrolPending(line.value[index])),
)

function badgeClass(status: string): string {
  if (status === '待巡线') {
    return 'badge-patrol'
  }
  if (status === '运行正常') {
    return 'badge-normal'
  }
  if (status === '待清淤') {
    return 'badge-dredge'
  }
  return 'badge-abandoned'
}

function segClass(row: EntryRow): Record<string, boolean> {
  return {
    'seg-patrol': pipePatrolPending(row),
    'seg-abandoned': String(row.status) === ABANDONED_STATUS,
  }
}

function reload() {
  line.value = listPipeLine()
  metricCards.value = drainpipeMetricCards()
}

onMounted(reload)
</script>
