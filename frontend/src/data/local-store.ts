import { SEED_ROWS } from './seed'
import { canonicalizePipeRows, DRAINPIPE_KEY } from './line-order'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'drainage-pump:entries'

// 需要把唯一顺序真正写进数据的模块：页面上的排序结果不是临时结果，归序后直接落库。
const NORMALIZERS: Record<string, (rows: EntryRow[]) => EntryRow[]> = {
  [DRAINPIPE_KEY]: canonicalizePipeRows,
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalize(key: string, rows: EntryRow[]): EntryRow[] {
  const normalizer = NORMALIZERS[key]
  return normalizer ? normalizer(rows) : rows
}

// 归序并在数据确实发生变化时回写 localStorage：旧数据首次打开即迁移，之后顺序稳定。
function persistNormalized(data: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return data
  }
  let changed = false
  const next: Record<string, EntryRow[]> = {}
  for (const key of Object.keys(data)) {
    const normalized = normalize(key, data[key] ?? [])
    next[key] = normalized
    if (JSON.stringify(normalized) !== JSON.stringify(data[key] ?? [])) {
      changed = true
    }
  }
  if (changed) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  return next
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return Object.fromEntries(
      Object.entries(fallback).map(([key, rows]) => [key, normalize(key, rows)]),
    )
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seeded = persistNormalized(fallback)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    const merged = { ...fallback, ...parsed }
    return persistNormalized(merged)
  } catch {
    const seeded = persistNormalized(fallback)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
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
  const rows = normalize(key, clone(SEED_ROWS[key] ?? []))
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
