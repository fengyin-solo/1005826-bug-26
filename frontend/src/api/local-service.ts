import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import {
  ABANDONED_STATUS,
  canonicalizePipeRows,
  compareLineOrder,
  countByStatus,
  DRAINPIPE_KEY,
  isPatrolPending,
  isPipeStatus,
  linePosition,
  PATROL_STATUS,
  PIPE_CODE_FIELD,
  PIPE_STATUSES,
  START_FIELD,
  statusIndex,
} from '@/data/line-order'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 状态必须顺着走、不允许跳级的模块（仅排水管段启用，其他模块维持原有宽松流转）。
const STRICT_CHAIN_KEYS = new Set<string>([DRAINPIPE_KEY])

export type DrainpipeOverview = {
  total: number
  patrolPending: number
  normal: number
  dredgingPending: number
  abandoned: number
  line: EntryRow[]
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

// 排水管段状态只能顺着「待巡线 → 运行正常 → 待清淤」走，不允许跳级；
// 「报废管段」是终态支线，任一在用状态都可报废，已废弃不可再操作。
function validatePipeTransition(current: string, target: string): string | null {
  if (!isPipeStatus(current) || !isPipeStatus(target)) {
    return `管段状态未登记，无法流转`
  }
  if (target === ABANDONED_STATUS) {
    return current === ABANDONED_STATUS ? '管段已废弃，不能重复报废' : null
  }
  const currentIndex = statusIndex(current)
  const targetIndex = statusIndex(target)
  if (currentIndex >= PIPE_STATUSES.length - 1) {
    return `管段已废弃，不能改回「${target}」`
  }
  if (targetIndex !== currentIndex + 1) {
    if (targetIndex <= currentIndex) {
      return `管段状态只能顺着向前走，不能从「${current}」回到「${target}」`
    }
    return `管段状态不能跳级：需先从「${current}」流转到「${PIPE_STATUSES[currentIndex + 1]}」，不能直接到「${target}」`
  }
  return null
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  if (STRICT_CHAIN_KEYS.has(key)) {
    const violation = validatePipeTransition(current, target)
    if (violation) {
      return { ok: false, message: violation }
    }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  // 管段状态字段与实际状态保持一致，归序（废弃压尾等）随写入落库。
  if (key === DRAINPIPE_KEY && meta.fields.includes('管段状态')) {
    updated['管段状态'] = target
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

function findDuplicatePipeCode(rows: EntryRow[], code: string, exceptId?: number): EntryRow | undefined {
  return rows.find(
    (row) =>
      String(row[PIPE_CODE_FIELD] ?? '').trim() === code.trim() &&
      (exceptId === undefined || Number(row.id) !== Number(exceptId)),
  )
}

// 登记排水管段：同一管段编号重复登记只留一条，新段从「待巡线」顺着往后走。
export function createPipeEntry(input: Record<string, string>): ActionResult & { id?: number } {
  const rows = listRows(DRAINPIPE_KEY)
  const code = String(input[PIPE_CODE_FIELD] ?? '').trim()
  if (!code) {
    return { ok: false, message: '管段编号不能为空' }
  }
  if (findDuplicatePipeCode(rows, code)) {
    return { ok: false, message: `管段编号「${code}」已登记，同一管段编号只保留一条记录` }
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const row: EntryRow = { id, status: PATROL_STATUS, pending: true, abnormal: false }
  for (const field of moduleMeta(DRAINPIPE_KEY).fields) {
    if (field === '管段状态') {
      row[field] = PATROL_STATUS
      continue
    }
    row[field] = String(input[field] ?? '').trim()
  }
  const saved = canonicalizePipeRows([...rows, row])
  saveRows(DRAINPIPE_KEY, saved)
  return { ok: true, message: `管段「${code}」已登记并入线，当前状态「${PATROL_STATUS}」`, id }
}

// 修改管段：改了起点井号后重新归序，顺序直接落库，不再是临时排列。
export function updatePipeEntry(id: number, patch: Record<string, string>): ActionResult {
  const rows = listRows(DRAINPIPE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的排水管段` }
  }
  const current = rows[index]
  const code = String(patch[PIPE_CODE_FIELD] ?? current[PIPE_CODE_FIELD] ?? '').trim()
  if (!code) {
    return { ok: false, message: '管段编号不能为空' }
  }
  if (findDuplicatePipeCode(rows, code, id)) {
    return { ok: false, message: `管段编号「${code}」已被其他管段占用，同一管段编号只保留一条记录` }
  }
  const startBefore = String(current[START_FIELD] ?? '')
  const editable = moduleMeta(DRAINPIPE_KEY).fields.filter((field) => field !== '管段状态')
  const updated: EntryRow = { ...current }
  for (const field of editable) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      updated[field] = String(patch[field] ?? '').trim()
    }
  }
  updated['管段状态'] = String(current.status)
  const next = [...rows]
  next[index] = updated
  const reordered = canonicalizePipeRows(next)
  const startAfter = String(updated[START_FIELD] ?? '')
  const positionBefore = linePosition(rows, id)
  saveRows(DRAINPIPE_KEY, reordered)
  const positionAfter = linePosition(reordered, id)
  const moved = startBefore.trim() !== startAfter.trim() && positionBefore !== positionAfter
  const suffix = moved ? `，起点井号已变更，线序重新归位到第 ${positionAfter} 段` : ''
  return { ok: true, message: `管段「${code}」已保存${suffix}` }
}

// 取线序中的单段：详情与列表共用同一份归序数据，段数和位置不会对不上。
export function getPipeEntry(id: number): { row: EntryRow; position: number; total: number } | null {
  const rows = listRows(DRAINPIPE_KEY)
  const position = linePosition(rows, id)
  if (position <= 0) {
    return null
  }
  return { row: rows[position - 1], position, total: rows.length }
}

// 线序视图：按起点井号、终点井号、管径落定的唯一顺序，废弃段收在末尾。
export function listPipeLine(): EntryRow[] {
  return [...listRows(DRAINPIPE_KEY)].sort(compareLineOrder)
}

// 概览看板里的排水管网小块：与列表、详情同口径。
export function drainpipeOverview(): DrainpipeOverview {
  const line = listPipeLine()
  return {
    total: line.length,
    patrolPending: countByStatus(line, PATROL_STATUS),
    normal: countByStatus(line, '运行正常'),
    dredgingPending: countByStatus(line, '待清淤'),
    abandoned: countByStatus(line, ABANDONED_STATUS),
    line,
  }
}

export function drainpipeMetricCards(): { label: string; value: number }[] {
  const overview = drainpipeOverview()
  return [
    { label: '待巡线管段', value: overview.patrolPending },
    { label: '运行正常管段', value: overview.normal },
    { label: '待清淤管段', value: overview.dredgingPending },
    { label: '已废弃管段', value: overview.abandoned },
  ]
}

export function pipePatrolPending(row: EntryRow): boolean {
  return isPatrolPending(row)
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
