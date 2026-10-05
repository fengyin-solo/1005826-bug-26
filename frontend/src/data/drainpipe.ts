import type { EntryRow } from './types'

// 排水管网领域规则集中在这里：线序排列、重复登记去重、状态顺向流转，
// 列表 / 线序视图 / 详情 / 概览看板都读同一份规范化结果，不允许各排各的。

export const DRAINPIPE_KEY = 'drainpipe'

export const PIPE_ID_FIELD = '管段编号'
export const START_FIELD = '起点井号'
export const END_FIELD = '终点井号'
export const DIAMETER_FIELD = '管径'
export const ORDER_FIELD = '线序'
export const STATUS_FIELD = '管段状态'

export const STATUS_PATROL = '待巡线'
export const STATUS_NORMAL = '运行正常'
export const STATUS_DREDGE = '待清淤'
export const STATUS_DISCARDED = '已废弃'

// 线序里参与排列的状态顺序：废弃段永远收在末尾，其余状态按井号串成一条线。
export const DRAINPIPE_STATUSES = [
  STATUS_PATROL,
  STATUS_NORMAL,
  STATUS_DREDGE,
  STATUS_DISCARDED,
]

// 状态只能顺着走到待清淤，不允许跳级；报废是任意在用状态都能进入的终点。
// key 为动作，value 为执行该动作前允许处于的状态。
export const STATUS_FLOW: Record<string, string[]> = {
  完成巡线: [STATUS_PATROL],
  安排清淤: [STATUS_NORMAL],
  报废管段: [STATUS_PATROL, STATUS_NORMAL, STATUS_DREDGE],
}

// 登记时必填、也共同决定线序的字段。
export const SEQUENCE_FIELDS = [START_FIELD, END_FIELD, DIAMETER_FIELD]
export const REQUIRED_FIELDS = [PIPE_ID_FIELD, ...SEQUENCE_FIELDS]

function compareText(left: string, right: string): number {
  // 井号、管径多为「字母+数字」混排，开数字感知排序，WS-2 不会排到 WS-10 后面。
  return left.localeCompare(right, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
}

// 唯一线序：起点井号 → 终点井号 → 管径；仍相同再用管段编号、id 兜底，保证结果唯一且稳定。
// 已废弃段不参与正线，整体收在末尾。
export function compareDrainpipes(left: EntryRow, right: EntryRow): number {
  const leftDiscarded = String(left.status) === STATUS_DISCARDED ? 1 : 0
  const rightDiscarded = String(right.status) === STATUS_DISCARDED ? 1 : 0
  if (leftDiscarded !== rightDiscarded) {
    return leftDiscarded - rightDiscarded
  }
  for (const field of [START_FIELD, END_FIELD, DIAMETER_FIELD, PIPE_ID_FIELD]) {
    const diff = compareText(String(left[field] ?? ''), String(right[field] ?? ''))
    if (diff !== 0) {
      return diff
    }
  }
  return Number(left.id) - Number(right.id)
}

// 把任意来源的数据整理成「去重 + 排序 + 写线序」的唯一结果，并持久化回数据层。
// 改起点井号、状态流转、重复登记清理后都走这里，所以重进页面顺序不会跳回去。
export function canonicalizeDrainpipes(rows: EntryRow[]): EntryRow[] {
  // 同一管段编号重复登记只留一条：按登记先后（id 升序）保留第一条，其余丢弃。
  const seen = new Set<string>()
  const deduped = [...rows]
    .sort((left, right) => Number(left.id) - Number(right.id))
    .filter((row) => {
      const code = String(row[PIPE_ID_FIELD] ?? '').trim()
      if (code === '') {
        return true
      }
      if (seen.has(code)) {
        return false
      }
      seen.add(code)
      return true
    })

  return deduped.sort(compareDrainpipes).map((row, index) => {
    const status = String(row.status ?? '')
    return {
      ...row,
      status,
      // 冗余的「管段状态」字段与真实状态对齐，避免列表和状态列显示两张皮。
      [STATUS_FIELD]: status,
      [ORDER_FIELD]: index + 1,
      pending: status !== STATUS_DISCARDED,
      abnormal: false,
    }
  })
}

// 动作流转前的顺向校验：返回 null 放行，返回文案即为拦截原因。
export function checkDrainpipeTransition(action: string, currentStatus: string): string | null {
  const allowed = STATUS_FLOW[action]
  if (!allowed) {
    return null
  }
  if (currentStatus === STATUS_DISCARDED) {
    return '已废弃的管段不能再做状态流转'
  }
  if (!allowed.includes(currentStatus)) {
    return `管段状态只能从待巡线顺着走到待清淤，不允许跳级：当前「${currentStatus}」不能执行「${action}」`
  }
  return null
}

// 某状态下界面上允许出现的动作按钮。
export function availableActions(status: string): string[] {
  return Object.entries(STATUS_FLOW)
    .filter(([, allowed]) => allowed.includes(status))
    .map(([action]) => action)
}
