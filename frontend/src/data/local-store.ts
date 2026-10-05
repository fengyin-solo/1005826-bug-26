import { canonicalizeDrainpipes, DRAINPIPE_KEY } from './drainpipe'
import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
// v2：排水管网的线序（去重、起点井号→终点井号→管径、废弃段收尾）直接写进数据，
// 旧版本临时排序的数据作废，重新播种。
const STORAGE_KEY = 'drainage-pump:entries:v2'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 排水管网的排列必须真正落库，任何入口写进来的数据都先规范化一次。
function normalize(key: string, rows: EntryRow[]): EntryRow[] {
  if (key === DRAINPIPE_KEY) {
    return canonicalizeDrainpipes(rows)
  }
  return rows
}

function seedData(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  fallback[DRAINPIPE_KEY] = canonicalizeDrainpipes(fallback[DRAINPIPE_KEY] ?? [])
  return fallback
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = seedData()
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...fallback, ...parsed }
    merged[DRAINPIPE_KEY] = canonicalizeDrainpipes(merged[DRAINPIPE_KEY] ?? [])
    return merged
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: normalize(key, rows) }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return listRows(key)
}

export function storageKey(): string {
  return STORAGE_KEY
}
