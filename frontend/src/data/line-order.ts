import type { EntryRow } from './types'

// 排水管网线序：线序不是页面上的临时排序结果，而是直接按规则落进数据层的唯一顺序。
// 列表、线序视图、详情与概览看板都读同一份已归序数据，刷新、重开浏览器顺序不变。

export const DRAINPIPE_KEY = 'drainpipe'

export const PIPE_CODE_FIELD = '管段编号'
export const START_FIELD = '起点井号'
export const END_FIELD = '终点井号'
export const DIAMETER_FIELD = '管径'
export const PIPE_STATUS_FIELD = '管段状态'

export const PIPE_STATUSES = ['待巡线', '运行正常', '待清淤', '已废弃'] as const
export const ABANDONED_STATUS = '已废弃'
export const PATROL_STATUS = '待巡线'

function fieldOf(row: EntryRow, field: string): string {
  return String(row[field] ?? '').trim()
}

// 线序比较：已废弃的整组压到末尾；组内按起点井号 → 终点井号 → 管径排列，
// 再以管段编号收尾，保证任意数据下顺序唯一，不会因为数据相等而来回串位。
export function compareLineOrder(a: EntryRow, b: EntryRow): number {
  const aAbandoned = fieldOf(a, 'status') === ABANDONED_STATUS ? 1 : 0
  const bAbandoned = fieldOf(b, 'status') === ABANDONED_STATUS ? 1 : 0
  if (aAbandoned !== bAbandoned) {
    return aAbandoned - bAbandoned
  }
  for (const field of [START_FIELD, END_FIELD, DIAMETER_FIELD, PIPE_CODE_FIELD]) {
    const cmp = fieldOf(a, field).localeCompare(fieldOf(b, field), 'zh-Hans-CN', { numeric: true })
    if (cmp !== 0) {
      return cmp
    }
  }
  return Number(a.id) - Number(b.id)
}

// 同一管段编号重复登记只留一条：保留最先登记（编号最小）的那条。
export function dedupePipeRows(rows: EntryRow[]): EntryRow[] {
  const kept = new Map<string, EntryRow>()
  const blank: EntryRow[] = []
  const ordered = [...rows].sort((a, b) => Number(a.id) - Number(b.id))
  for (const row of ordered) {
    const code = fieldOf(row, PIPE_CODE_FIELD)
    if (!code) {
      blank.push(row)
      continue
    }
    if (!kept.has(code)) {
      kept.set(code, row)
    }
  }
  return [...kept.values(), ...blank]
}

function withStatusSynced(row: EntryRow): EntryRow {
  const status = fieldOf(row, 'status')
  const pipeStatus = fieldOf(row, PIPE_STATUS_FIELD)
  if (pipeStatus && pipeStatus !== status) {
    return { ...row, [PIPE_STATUS_FIELD]: status }
  }
  return row
}

// 归序：去重 → 同步管段状态字段 → 落定唯一线序。每次写入前都过一遍。
export function canonicalizePipeRows(rows: EntryRow[]): EntryRow[] {
  return dedupePipeRows(rows).map(withStatusSynced).sort(compareLineOrder)
}

export function isPipeStatus(status: string): boolean {
  return (PIPE_STATUSES as readonly string[]).includes(status)
}

export function statusIndex(status: string): number {
  return (PIPE_STATUSES as readonly string[]).indexOf(status)
}

// 线位（1 起）：详情、线序视图与列表共用同一个位置口径。
export function linePosition(rows: EntryRow[], id: number): number {
  return rows.findIndex((row) => Number(row.id) === Number(id)) + 1
}

export function countByStatus(rows: EntryRow[], status: string): number {
  return rows.filter((row) => String(row.status) === status).length
}

export function isPatrolPending(row: EntryRow): boolean {
  return String(row.status) === PATROL_STATUS
}
