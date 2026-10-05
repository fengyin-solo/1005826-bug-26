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

    <section class="pipe-board">
      <header class="board-head">
        <h3>排水管网线序看板</h3>
        <RouterLink class="btn" to="/drainpipe/sequence">进入线序视图</RouterLink>
      </header>
      <div class="stat-row">
        <article class="stat-card">
          <span class="stat-label">线序总段数</span>
          <strong class="stat-value">{{ pipeSummary.total }}</strong>
        </article>
        <article class="stat-card card-alert">
          <span class="stat-label">待巡线管段</span>
          <strong class="stat-value">{{ pipeSummary.pendingPatrol }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">运行正常管段</span>
          <strong class="stat-value">{{ pipeSummary.byStatus['运行正常'] ?? 0 }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">待清淤管段</span>
          <strong class="stat-value">{{ pipeSummary.byStatus['待清淤'] ?? 0 }}</strong>
        </article>
        <article class="stat-card">
          <span class="stat-label">已废弃（末尾收尾）</span>
          <strong class="stat-value">{{ pipeSummary.discarded }}</strong>
        </article>
      </div>
      <table class="data-table">
        <thead>
          <tr><th>线序</th><th>管段编号</th><th>起点井号</th><th>终点井号</th><th>管径</th><th>管段状态</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pipeSequence"
            :key="String(row.id)"
            :class="{ 'row-patrol': row.status === '待巡线', 'row-discarded': row.status === '已废弃' }"
          >
            <td>{{ row['线序'] }}</td>
            <td>{{ row['管段编号'] }}</td>
            <td>{{ row['起点井号'] }}</td>
            <td>{{ row['终点井号'] }}</td>
            <td>{{ row['管径'] }}</td>
            <td><span class="status-badge" :class="`status-${row.status}`">{{ row.status }}</span></td>
          </tr>
        </tbody>
      </table>
    </section>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { drainpipeSequence, drainpipeSummary } from '@/api/drainpipe-service'
import { loadOverview } from '@/api/local-service'
import type { DrainpipeSummary } from '@/api/drainpipe-service'
import type { EntryRow, OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const pipeSequence = ref<EntryRow[]>([])
const pipeSummary = ref<DrainpipeSummary>({ total: 0, byStatus: {}, pendingPatrol: 0, discarded: 0 })

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  // 与列表、详情、线序视图同一份规范化数据，段数与顺序完全一致。
  pipeSequence.value = drainpipeSequence()
  pipeSummary.value = drainpipeSummary()
}

onMounted(refresh)
</script>
