<template>
  <div v-if="detail" class="modal-mask" @click.self="emit('close')">
    <div class="modal-card detail-card">
      <header class="modal-head">
        <h3>管段详情 · 线序第 {{ detail.index + 1 }} 段 / 共 {{ detail.total }} 段</h3>
        <button class="btn ghost" type="button" @click="emit('close')">关闭</button>
      </header>

      <p class="detail-order">
        <span class="order-node">{{ detail.row['起点井号'] }}</span>
        <span class="order-arrow">→</span>
        <span class="order-node">{{ detail.row['终点井号'] }}</span>
        <span class="status-badge" :class="badgeClass(detail.row.status)">{{ detail.row.status }}</span>
        <span v-if="detail.row.status === '待巡线'" class="patrol-flag">待巡线</span>
      </p>

      <dl class="detail-grid">
        <div v-for="field in meta.fields" :key="field" class="detail-item">
          <dt>{{ field }}</dt>
          <dd>{{ detail.row[field] || '—' }}</dd>
        </div>
        <div class="detail-item">
          <dt>线序</dt>
          <dd>第 {{ detail.row['线序'] }} 段</dd>
        </div>
      </dl>

      <footer class="modal-foot">
        <button class="btn" type="button" :disabled="!detail.prev" @click="emit('navigate', prevId)">
          上一段{{ detail.prev ? `（${detail.prev['起点井号']}）` : '' }}
        </button>
        <div class="foot-actions">
          <button
            v-for="action in actionsForStatus(String(detail.row.status))"
            :key="action"
            class="btn primary"
            type="button"
            @click="emit('action', action, detail.row)"
          >
            {{ action }}
          </button>
        </div>
        <button class="btn" type="button" :disabled="!detail.next" @click="emit('navigate', nextId)">
          下一段{{ detail.next ? `（${detail.next['起点井号']}）` : '' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { actionsForStatus, drainpipeMeta, type DrainpipeDetail } from '@/api/drainpipe-service'
import type { EntryRow } from '@/data/types'

const props = defineProps<{ detail: DrainpipeDetail | null }>()
const emit = defineEmits<{
  close: []
  navigate: [id: number]
  action: [action: string, row: EntryRow]
}>()

const meta = drainpipeMeta()

const prevId = computed(() => (props.detail?.prev ? Number(props.detail.prev.id) : 0))
const nextId = computed(() => (props.detail?.next ? Number(props.detail.next.id) : 0))

function badgeClass(status: string | number | boolean): string {
  return `status-${String(status)}`
}
</script>
