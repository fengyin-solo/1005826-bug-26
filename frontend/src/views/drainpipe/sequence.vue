<template>
  <section class="page sequence-page" data-module="drainpipe-sequence">
    <header class="page-head">
      <div>
        <h2>排水管网线序视图</h2>
        <p class="page-desc">按起点井号、终点井号、管径排出的唯一线序；顺序已写入数据，重新进入保持不变，已废弃段收在末尾。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/drainpipe">返回管网台账</RouterLink>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">线序总段数</span>
        <strong class="stat-value">{{ sequence.length }}</strong>
      </article>
      <article class="stat-card card-alert">
        <span class="stat-label">待巡线管段</span>
        <strong class="stat-value">{{ summary.pendingPatrol }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待清淤管段</span>
        <strong class="stat-value">{{ summary.byStatus['待清淤'] ?? 0 }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">运行正常管段</span>
        <strong class="stat-value">{{ summary.byStatus['运行正常'] ?? 0 }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已废弃管段（收尾）</span>
        <strong class="stat-value">{{ summary.discarded }}</strong>
      </article>
    </div>

    <p class="patrol-banner" v-if="summary.pendingPatrol > 0">
      有 <strong>{{ summary.pendingPatrol }}</strong> 段待巡线，下面线序里已用橙色标出，可顺着井号逐段安排。
    </p>
    <p class="patrol-banner all-clear" v-else>暂无待巡线管段，全线已完成巡线。</p>

    <ol class="sequence-list">
      <li v-for="(row, index) in sequence" :key="String(row.id)">
        <div
          v-if="index === discardedStart && discardedStart > 0"
          class="discarded-divider"
        >
          以下为已废弃管段，统一收在线序末尾
        </div>
        <div v-if="index > 0" class="sequence-link">↓</div>
        <article
          class="sequence-card"
          :class="{
            'is-patrol': row.status === '待巡线',
            'is-dredge': row.status === '待清淤',
            'is-discarded': row.status === '已废弃',
          }"
          @click="openDetail(Number(row.id))"
        >
          <span class="seq-no">{{ String(row['线序']).padStart(2, '0') }}</span>
          <div class="seq-main">
            <p class="seq-line">
              <span class="order-node">{{ row['起点井号'] }}</span>
              <span class="order-arrow">→</span>
              <span class="order-node">{{ row['终点井号'] }}</span>
              <span class="seq-diameter">{{ row['管径'] }}</span>
            </p>
            <p class="seq-meta">
              {{ row['管段编号'] }} · {{ row['管材'] || '管材未填' }} · 埋深 {{ row['埋深'] || '—' }}
            </p>
          </div>
          <div class="seq-side">
            <span class="status-badge" :class="`status-${row.status}`">{{ row.status }}</span>
            <span v-if="row.status === '待巡线'" class="patrol-flag">待巡线</span>
          </div>
        </article>
      </li>
    </ol>

    <p v-if="!sequence.length" class="empty-state block-empty">暂无排水管段，先到管网台账登记。</p>

    <footer class="page-foot">
      <span>线序与台账、详情、概览看板同源，段数与顺序保持一致。</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <PipeDetailModal
      :detail="detail"
      @close="detail = null"
      @navigate="openDetail"
      @action="runAction"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  drainpipeSequence,
  drainpipeSummary,
  getDrainpipe,
  runDrainpipeAction,
  type DrainpipeDetail,
} from '@/api/drainpipe-service'
import PipeDetailModal from '@/components/PipeDetailModal.vue'
import { STATUS_DISCARDED } from '@/data/drainpipe'
import type { EntryRow } from '@/data/types'

const sequence = ref<EntryRow[]>([])
const summary = ref(drainpipeSummary())
const detail = ref<DrainpipeDetail | null>(null)
const errorMessage = ref('')

const discardedStart = computed(() =>
  sequence.value.findIndex((row) => String(row.status) === STATUS_DISCARDED),
)

function openDetail(id: number) {
  detail.value = getDrainpipe(id)
}

function runAction(action: string, row: EntryRow) {
  const result = runDrainpipeAction(Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
  detail.value = getDrainpipe(Number(row.id))
}

function reload() {
  sequence.value = drainpipeSequence()
  summary.value = drainpipeSummary()
}

onMounted(reload)
</script>
