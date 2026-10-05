<template>
  <section class="page" data-module="drainpipe">
    <header class="page-head">
      <div>
        <h2>排水管网管理</h2>
        <p class="page-desc">维护排水管段，围绕管段编号、起点井号、终点井号、管径做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记排水管段</button>
        <RouterLink class="btn" type="button" to="/drainpipe/line-order">查看管网线序</RouterLink>
        <button class="btn" type="button" @click="exportRows">导出排水管网清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in metricCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item legend-tip">共 {{ total }} 段，废弃段统一收在末尾；高亮段为待巡线</span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>线位</th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'row-patrol': pipePatrolPending(row) }">
          <td class="cell-linepos">
            <RouterLink class="link" :to="`/drainpipe/${row.id}`">第 {{ positionOf(row) }} 段</RouterLink>
          </td>
          <td v-for="column in columns" :key="column">
            <RouterLink v-if="column === '管段编号'" class="link" :to="`/drainpipe/${row.id}`">
              {{ row[column] ?? '—' }}
            </RouterLink>
            <template v-else>{{ row[column] ?? '—' }}</template>
          </td>
          <td>
            <span class="status-badge" :class="badgeClass(String(row.status))">{{ row.status }}</span>
          </td>
          <td class="row-actions">
            <RouterLink class="link" :to="`/drainpipe/${row.id}`">详情</RouterLink>
            <button class="link" type="button" @click="openEdit(row)">编辑</button>
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无排水管网数据，可先登记排水管段</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>
        共 {{ total }} 条排水管网记录<span v-if="filtered">（筛选结果，线位以全线 {{ canonicalTotal }} 段为准）</span>
      </span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="successMessage" class="success-text">{{ successMessage }}</span>
    </footer>

    <div v-if="formOpen" class="modal-mask" @click.self="closeForm">
      <div class="modal">
        <h3 class="modal-title">{{ editingId === null ? '登记排水管段' : '编辑排水管段' }}</h3>
        <form @submit.prevent="submitForm">
          <div class="form-grid">
            <div v-for="field in formFields" :key="field" class="form-item">
              <label class="form-label">
                <span>{{ field }}</span>
                <input v-model="formData[field]" :type="field === '敷设日期' ? 'date' : 'text'" :placeholder="`请输入${field}`" />
              </label>
            </div>
          </div>
          <p v-if="formMessage" class="error-text form-message">{{ formMessage }}</p>
          <div class="form-actions">
            <button class="btn primary" type="submit">保存</button>
            <button class="btn ghost" type="button" @click="closeForm">取消</button>
          </div>
          <p class="form-hint">改了起点井号后，管段会按起点井号、终点井号与管径重新归序并写存。</p>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  createPipeEntry,
  downloadEntries,
  drainpipeMetricCards,
  drainpipeOverview,
  listEntries,
  listPipeLine,
  moduleMeta,
  pipePatrolPending,
  runAction as applyAction,
  updatePipeEntry,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('drainpipe')
// 线位与当前状态单独成列：fields 里的「管段状态」由实际状态驱动，不再重复渲染。
const columns = ["管段编号", "起点井号", "终点井号", "管径", "埋深", "管材", "敷设日期"]
const formFields = ["管段编号", "起点井号", "终点井号", "管径", "埋深", "管材", "敷设日期"]
const actions = ["完成巡线", "安排清淤", "报废管段"]
const statuses = ["待巡线", "运行正常", "待清淤", "已废弃"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const canonicalTotal = ref(0)
const filtered = ref(false)
const metricCards = ref(drainpipeMetricCards())
const errorMessage = ref('')
const successMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ["管段编号", "起点井号", "终点井号"]

const formOpen = ref(false)
const editingId = ref<number | null>(null)
const formData = ref<Record<string, string>>({})
const formMessage = ref('')
// 数据层写 localStorage 不触发 Vue 响应式，用一个显式版本号让线序派生值在每次重载后重算。
const refreshTick = ref(0)

const statusSummary = computed(() => {
  void refreshTick.value
  const line = listPipeLine()
  return statuses.map((status: string) => ({
    status,
    count: line.filter((row) => String(row.status) === status).length,
  }))
})

// 全线线位映射：筛选后的列表里线位仍以全线顺序为准。
const positionMap = computed(() => {
  void refreshTick.value
  const map = new Map<number, number>()
  listPipeLine().forEach((item, index) => map.set(Number(item.id), index + 1))
  return map
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

function positionOf(row: EntryRow): number {
  return positionMap.value.get(Number(row.id)) ?? 0
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  editingId.value = null
  formData.value = Object.fromEntries(formFields.map((field) => [field, '']))
  formMessage.value = ''
  formOpen.value = true
}

function openEdit(row: EntryRow) {
  editingId.value = Number(row.id)
  formData.value = Object.fromEntries(
    formFields.map((field) => [field, String(row[field] ?? '')]),
  )
  formMessage.value = ''
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  formMessage.value = ''
}

function submitForm() {
  formMessage.value = ''
  const payload = Object.fromEntries(
    formFields.map((field) => [field, formData.value[field] ?? '']),
  )
  const result =
    editingId.value === null
      ? createPipeEntry(payload)
      : updatePipeEntry(editingId.value, payload)
  if (!result.ok) {
    formMessage.value = result.message
    return
  }
  closeForm()
  successMessage.value = result.message
  reload()
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  successMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  successMessage.value = result.message
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    const overview = drainpipeOverview()
    canonicalTotal.value = overview.total
    metricCards.value = drainpipeMetricCards()
    filtered.value = payload.total !== overview.total
    refreshTick.value += 1
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '排水管网列表读取失败'
  }
}

onMounted(reload)
</script>
