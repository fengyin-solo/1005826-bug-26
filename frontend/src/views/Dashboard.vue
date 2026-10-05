<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>

    <section class="line-panel">
      <header class="line-panel-head">
        <div>
          <h3>排水管网线序</h3>
          <p class="page-desc">与管网列表、管段详情同一份落存线序，废弃段收在末尾，重进顺序不变。</p>
        </div>
        <RouterLink class="btn primary" to="/drainpipe/line-order">进入线序视图</RouterLink>
      </header>
      <div class="line-panel-stats">
        <span class="legend-item" :class="{ 'legend-active': pipeOverview.patrolPending > 0 }">
          待巡线：{{ pipeOverview.patrolPending }} 段
        </span>
        <span class="legend-item">运行正常：{{ pipeOverview.normal }} 段</span>
        <span class="legend-item">待清淤：{{ pipeOverview.dredgingPending }} 段</span>
        <span class="legend-item">已废弃：{{ pipeOverview.abandoned }} 段</span>
        <span class="legend-item legend-tip">全线共 {{ pipeOverview.total }} 段</span>
      </div>
      <RouterLink
        v-for="(row, index) in pipeOverview.line"
        :key="String(row.id)"
        class="panel-line-item"
        :class="{ 'row-patrol': row.status === '待巡线', 'row-abandoned': row.status === '已废弃' }"
        :to="`/drainpipe/${row.id}`"
      >
        <span class="panel-line-pos">第 {{ index + 1 }} 段</span>
        <span>{{ row['起点井号'] }} → {{ row['终点井号'] }}</span>
        <span>{{ row['管径'] }}</span>
        <span class="status-badge" :class="badgeClass(String(row.status))">{{ row.status }}</span>
      </RouterLink>
    </section>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { drainpipeOverview, loadOverview } from '@/api/local-service'
import type { DrainpipeOverview } from '@/api/local-service'
import type { OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const pipeOverview = ref<DrainpipeOverview>({
  total: 0,
  patrolPending: 0,
  normal: 0,
  dredgingPending: 0,
  abandoned: 0,
  line: [],
})

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

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  pipeOverview.value = drainpipeOverview()
}

onMounted(refresh)
</script>
