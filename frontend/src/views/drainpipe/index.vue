<template>
  <section class="page" data-module="drainpipe">
    <header class="page-head">
      <div>
        <h2>排水管网管理</h2>
        <p class="page-desc">维护排水管段，围绕管段编号、起点井号、终点井号、管径做登记、筛选与状态流转；线序按井号与管径唯一排定并写入数据。</p>
      </div>
      <div class="page-actions">
        <RouterLink class="btn primary" to="/drainpipe/sequence">线序视图</RouterLink>
        <button class="btn" type="button" @click="openCreate">登记排水管段</button>
        <button class="btn" type="button" @click="exportRows">导出排水管网清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card" :class="{ 'card-alert': item.alert }">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table pipe-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="String(row.id)"
          :class="{ 'row-patrol': row.status === '待巡线', 'row-discarded': row.status === '已废弃' }"
          class="pipe-row"
          @click="openDetail(Number(row.id))"
        >
          <td v-for="column in columns" :key="column">
            <span v-if="column === '管段状态'" class="status-badge" :class="`status-${row.status}`">{{ row[column] }}</span>
            <template v-else>{{ row[column] || '—' }}</template>
          </td>
          <td class="row-actions" @click.stop>
            <button
              v-for="action in actionsForStatus(String(row.status))"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
            <button class="link" type="button" @click="openEdit(row)">编辑</button>
            <span v-if="actionsForStatus(String(row.status)).length === 0" class="muted-text">—</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 1" class="empty-state">暂无符合条件的排水管段</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条排水管段（按落库线序展示，已废弃段收在末尾）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <PipeDetailModal
      :detail="detail"
      @close="detail = null"
      @navigate="openDetail"
      @action="runAction"
    />
    <PipeFormModal
      :row="editingRow"
      :error="formError"
      @close="closeForm"
      @submit="submitForm"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  actionsForStatus,
  createDrainpipe,
  drainpipeSummary,
  getDrainpipe,
  listDrainpipes,
  runDrainpipeAction,
  updateDrainpipe,
  type DrainpipeDetail,
} from '@/api/drainpipe-service'
import { downloadEntries } from '@/api/local-service'
import PipeDetailModal from '@/components/PipeDetailModal.vue'
import PipeFormModal from '@/components/PipeFormModal.vue'
import { DRAINPIPE_KEY } from '@/data/drainpipe'
import type { EntryRow } from '@/data/types'

const columns = ['线序', '管段编号', '起点井号', '终点井号', '管径', '埋深', '管材', '敷设日期', '管段状态']
const filterFields = ['管段编号', '起点井号', '终点井号']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})

const detail = ref<DrainpipeDetail | null>(null)
const editingRow = ref<EntryRow | null>(null)
const formError = ref('')

const summary = ref(drainpipeSummary())
const statCards = computed(() => [
  { label: '管段总数', value: summary.value.total, alert: false },
  { label: '待巡线管段', value: summary.value.pendingPatrol, alert: true },
  { label: '待清淤管段', value: summary.value.byStatus['待清淤'] ?? 0, alert: false },
  { label: '运行正常管段', value: summary.value.byStatus['运行正常'] ?? 0, alert: false },
  { label: '已废弃管段', value: summary.value.discarded, alert: false },
])
const statusSummary = computed(() =>
  Object.entries(summary.value.byStatus).map(([status, count]) => ({ status, count })),
)

function refreshSummary() {
  summary.value = drainpipeSummary()
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(DRAINPIPE_KEY)
}

function openCreate() {
  editingRow.value = null
  formError.value = ''
}

function openEdit(row: EntryRow) {
  editingRow.value = row
  formError.value = ''
}

function closeForm() {
  editingRow.value = null
  formError.value = ''
}

function submitForm(payload: Record<string, string>) {
  const result = editingRow.value
    ? updateDrainpipe(Number(editingRow.value.id), payload)
    : createDrainpipe(payload)
  if (!result.ok) {
    formError.value = result.message
    return
  }
  closeForm()
  errorMessage.value = ''
  reload()
}

function openDetail(id: number) {
  detail.value = getDrainpipe(id)
  errorMessage.value = ''
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = runDrainpipeAction(Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
  if (detail.value) {
    detail.value = getDrainpipe(Number(row.id))
  }
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listDrainpipes(filters.value)
    rows.value = payload.items
    total.value = payload.total
    refreshSummary()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '排水管网列表读取失败'
  }
}

onMounted(reload)
</script>
