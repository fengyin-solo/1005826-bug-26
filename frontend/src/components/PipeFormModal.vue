<template>
  <div class="modal-mask" @click.self="emit('close')">
    <form class="modal-card form-card" @submit.prevent="submit">
      <header class="modal-head">
        <h3>{{ isEdit ? '编辑排水管段' : '登记排水管段' }}</h3>
        <button class="btn ghost" type="button" @click="emit('close')">关闭</button>
      </header>

      <p class="form-tip">
        起点井号、终点井号、管径决定管段在整条线序里的唯一位置；保存后立即按线序重排并写入数据。
      </p>

      <div class="form-grid">
        <label v-for="field in editableFields" :key="field" class="form-item">
          <span>{{ field }}<em v-if="requiredFields.includes(field)">*</em></span>
          <input v-model.trim="form[field]" :placeholder="`请输入${field}`" />
        </label>
      </div>

      <footer class="modal-foot">
        <span class="form-error">{{ error }}</span>
        <div class="foot-actions">
          <button class="btn" type="button" @click="emit('close')">取消</button>
          <button class="btn primary" type="submit">{{ isEdit ? '保存并重排' : '登记并编入线序' }}</button>
        </div>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import { REQUIRED_FIELDS } from '@/data/drainpipe'
import type { EntryRow } from '@/data/types'

const editableFields = ['管段编号', '起点井号', '终点井号', '管径', '埋深', '管材', '敷设日期']
const requiredFields = REQUIRED_FIELDS

const props = defineProps<{ row: EntryRow | null; error: string }>()
const emit = defineEmits<{
  close: []
  submit: [payload: Record<string, string>]
}>()

const isEdit = computed(() => props.row !== null)

const form = reactive<Record<string, string>>({})

function fillFrom(row: EntryRow | null) {
  for (const field of editableFields) {
    form[field] = row ? String(row[field] ?? '') : ''
  }
}

watch(
  () => props.row,
  (row) => fillFrom(row),
  { immediate: true },
)

function submit() {
  emit('submit', { ...form })
}
</script>
