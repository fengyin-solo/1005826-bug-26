import {
  availableActions,
  DRAINPIPE_KEY,
  DRAINPIPE_STATUSES,
  DIAMETER_FIELD,
  END_FIELD,
  ORDER_FIELD,
  PIPE_ID_FIELD,
  REQUIRED_FIELDS,
  START_FIELD,
  STATUS_DISCARDED,
  STATUS_FIELD,
  STATUS_PATROL,
} from '@/data/drainpipe'
import { listRows, saveRows } from '@/data/local-store'
import { moduleMeta, runAction as genericRunAction } from './local-service'
import type { ActionResult, EntryRow, PageResult } from '@/data/types'

// 排水管网服务：唯一的数据出口。线序在数据层排定并落库，这里不再做临时排序，
// 因此列表、线序视图、详情、概览看板拿到的段数与顺序永远一致。

export function drainpipeMeta() {
  return moduleMeta(DRAINPIPE_KEY)
}

// 列表：按筛选条件过滤，但顺序与线序号始终用落库后的规范结果，不再现场重排。
export function listDrainpipes(filters: Record<string, string> = {}): PageResult {
  const rows = listRows(DRAINPIPE_KEY)
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  const matched =
    pairs.length === 0
      ? rows
      : rows.filter((row) =>
          pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
        )
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 线序视图 / 概览看板用：全量规范线序。
export function drainpipeSequence(): EntryRow[] {
  return listRows(DRAINPIPE_KEY)
}

export type DrainpipeDetail = {
  row: EntryRow
  index: number
  total: number
  prev: EntryRow | null
  next: EntryRow | null
}

// 详情：带它在线序里的位置和上一段、下一段，顺着井号一条条看。
export function getDrainpipe(id: number): DrainpipeDetail | null {
  const rows = listRows(DRAINPIPE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === Number(id))
  if (index < 0) {
    return null
  }
  return {
    row: rows[index],
    index,
    total: rows.length,
    prev: index > 0 ? rows[index - 1] : null,
    next: index < rows.length - 1 ? rows[index + 1] : null,
  }
}

export type DrainpipeSummary = {
  total: number
  byStatus: Record<string, number>
  pendingPatrol: number
  discarded: number
}

export function drainpipeSummary(): DrainpipeSummary {
  const rows = listRows(DRAINPIPE_KEY)
  const byStatus: Record<string, number> = {}
  for (const status of DRAINPIPE_STATUSES) {
    byStatus[status] = 0
  }
  for (const row of rows) {
    const status = String(row.status)
    byStatus[status] = (byStatus[status] ?? 0) + 1
  }
  return {
    total: rows.length,
    byStatus,
    pendingPatrol: byStatus[STATUS_PATROL] ?? 0,
    discarded: byStatus[STATUS_DISCARDED] ?? 0,
  }
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) ?? 0), 0) + 1
}

export type DrainpipeInput = Record<string, string>

// 登记排水管段：必填字段缺失或管段编号重复登记都会被拒；保存即重排落库。
export function createDrainpipe(input: DrainpipeInput): ActionResult {
  const payload: DrainpipeInput = {}
  for (const [key, value] of Object.entries(input)) {
    payload[key] = value.trim()
  }
  for (const field of REQUIRED_FIELDS) {
    if (!payload[field]) {
      return { ok: false, message: `「${field}」为必填项，补齐后才能登记` }
    }
  }
  const rows = listRows(DRAINPIPE_KEY)
  if (rows.some((row) => String(row[PIPE_ID_FIELD]) === payload[PIPE_ID_FIELD])) {
    return {
      ok: false,
      message: `管段编号「${payload[PIPE_ID_FIELD]}」已登记，同一管段编号重复登记只允许保留一条`,
    }
  }
  const row: EntryRow = {
    id: nextId(rows),
    status: STATUS_PATROL,
    pending: true,
    abnormal: false,
    [PIPE_ID_FIELD]: payload[PIPE_ID_FIELD],
    [START_FIELD]: payload[START_FIELD],
    [END_FIELD]: payload[END_FIELD],
    [DIAMETER_FIELD]: payload[DIAMETER_FIELD],
    埋深: payload.埋深 ?? '',
    管材: payload.管材 ?? '',
    敷设日期: payload.敷设日期 ?? '',
    [STATUS_FIELD]: STATUS_PATROL,
    [ORDER_FIELD]: 0,
  }
  // saveRows 会规范化：新登记的段按起点井号插进修好的线序里，废弃段自动收尾。
  saveRows(DRAINPIPE_KEY, [...rows, row])
  return { ok: true, message: `管段「${payload[PIPE_ID_FIELD]}」已登记并编入线序` }
}

// 编辑管段：管段编号不允许改成已存在的编号；改了起点井号等排序字段后立即重排落库。
export function updateDrainpipe(id: number, input: DrainpipeInput): ActionResult {
  const rows = listRows(DRAINPIPE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === Number(id))
  if (index < 0) {
    return { ok: false, message: '没有找到这段排水管段' }
  }
  const payload: DrainpipeInput = {}
  for (const [key, value] of Object.entries(input)) {
    payload[key] = value.trim()
  }
  for (const field of REQUIRED_FIELDS) {
    if (!payload[field]) {
      return { ok: false, message: `「${field}」为必填项，不能清空` }
    }
  }
  const duplicated = rows.some(
    (row, rowIndex) =>
      rowIndex !== index && String(row[PIPE_ID_FIELD]) === payload[PIPE_ID_FIELD],
  )
  if (duplicated) {
    return {
      ok: false,
      message: `管段编号「${payload[PIPE_ID_FIELD]}」已被其他段登记，同一管段编号只能保留一条`,
    }
  }
  const status = String(rows[index].status)
  const updated: EntryRow = {
    ...rows[index],
    [PIPE_ID_FIELD]: payload[PIPE_ID_FIELD],
    [START_FIELD]: payload[START_FIELD],
    [END_FIELD]: payload[END_FIELD],
    [DIAMETER_FIELD]: payload[DIAMETER_FIELD],
    埋深: payload.埋深 ?? '',
    管材: payload.管材 ?? '',
    敷设日期: payload.敷设日期 ?? '',
    [STATUS_FIELD]: status,
  }
  // 改起点井号 / 终点井号 / 管径后靠这一步重排：线序直接写进数据，重进页面不会跳回去。
  const next = [...rows]
  next[index] = updated
  saveRows(DRAINPIPE_KEY, next)
  return { ok: true, message: `管段「${payload[PIPE_ID_FIELD]}」已保存，线序已按井号重排` }
}

// 状态流转走通用动作通道（带顺向不跳级校验），保存时数据层同步重排：
// 报废后该段会被挪到末尾，完成巡线 / 安排清淤不影响线序位置。
export function runDrainpipeAction(id: number, action: string): ActionResult {
  return genericRunAction(DRAINPIPE_KEY, id, action)
}

export function actionsForStatus(status: string): string[] {
  return availableActions(status)
}
