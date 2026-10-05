<template>
  <section class="page" data-module="drainpipe-detail">
    <header class="page-head">
      <div>
        <h2>排水管段详情</h2>
        <p class="page-desc">详情与列表、线序视图共用同一份落存线序，位置和段数一致。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn" to="/drainpipe">返回管网列表</RouterLink>
        <RouterLink class="btn" to="/drainpipe/line-order">查看管网线序</RouterLink>
      </div>
    </header>

    <div v-if="!entry" class="detail-empty">
      <p>没有找到该管段，可能已被去重清理或编号有误。</p>
      <RouterLink class="btn primary" to="/drainpipe">回到管网列表</RouterLink>
    </div>

    <template v-else>
      <p class="detail-position">
        全线第 <strong>{{ entry.position }}</strong> / {{ entry.total }} 段
        <span class="status-badge" :class="badgeClass(String(row.status))">{{ row.status }}</span>
        <span v-if="pipePatrolPending(row)" class="patrol-flag">待巡线</span>
      </p>

      <table class="data-table detail-table">
        <tbody>
          <tr v-for="field in fields" :key="field">
            <th>{{ field }}</th>
            <td>{{ row[field] ?? '—' }}</td>
          </tr>
          <tr>
            <th>当前状态</th>
            <td>{{ row.status }}</td>
          </tr>
        </tbody>
      </table>

      <div class="detail-actions">
        <button
          v-for="action in actions"
          :key="action"
          class="btn"
          :class="{ primary: action === '完成巡线' }"
          type="button"
          @click="runAction(action)"
        >
          {{ action }}
        </button>
      </div>
      <p class="detail-hint">状态只能顺着「待巡线 → 运行正常 → 待清淤」走，不允许跳级；报废后收在线序末尾。</p>
      <p v-if="message" :class="messageOk ? 'success-text' : 'error-text'">{{ message }}</p>

      <nav class="detail-nav">
        <RouterLink v-if="prev" class="btn ghost" :to="`/drainpipe/${prev.id}`">
          ← 上一段：{{ prev['起点井号'] }} → {{ prev['终点井号'] }}
        </RouterLink>
        <span v-else class="btn ghost disabled">已是首段</span>
        <RouterLink v-if="next" class="btn ghost" :to="`/drainpipe/${next.id}`">
          下一段：{{ next['起点井号'] }} → {{ next['终点井号'] }} →
        </RouterLink>
        <span v-else class="btn ghost disabled">已是末段</span>
      </nav>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import {
  getPipeEntry,
  listPipeLine,
  moduleMeta,
  pipePatrolPending,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const route = useRoute()
const meta = moduleMeta('drainpipe')
const fields = ["管段编号", "起点井号", "终点井号", "管径", "埋深", "管材", "敷设日期", "管段状态"]
const actions = ["完成巡线", "安排清淤", "报废管段"]

const entry = ref<{ row: EntryRow; position: number; total: number } | null>(null)
const message = ref('')
const messageOk = ref(false)

const row = computed<EntryRow>(() =>
  entry.value ? entry.value.row : ({} as EntryRow),
)
const prev = computed<EntryRow | null>(() => {
  if (!entry.value) {
    return null
  }
  return listPipeLine()[entry.value.position - 2] ?? null
})
const next = computed<EntryRow | null>(() => {
  if (!entry.value) {
    return null
  }
  return listPipeLine()[entry.value.position] ?? null
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

function reload() {
  message.value = ''
  entry.value = getPipeEntry(Number(route.params.id))
}

function runAction(action: string) {
  if (!entry.value) {
    return
  }
  const result = applyAction(meta.key, Number(entry.value.row.id), action)
  if (result.ok) {
    reload()
  }
  message.value = result.message
  messageOk.value = result.ok
}

watch(() => route.params.id, reload)
onMounted(reload)
</script>
