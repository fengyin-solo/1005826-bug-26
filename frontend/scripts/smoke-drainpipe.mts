// 排水管网线序规则冒烟测试：用 esbuild 直接 bundle TS 后在 node 里跑，不进流水线。
import { strict as assert } from 'node:assert'

import {
  createDrainpipe,
  drainpipeSequence,
  drainpipeSummary,
  getDrainpipe,
  listDrainpipes,
  runDrainpipeAction,
  updateDrainpipe,
} from '../src/api/drainpipe-service'
import { resetRows } from '../src/data/local-store'
import { listRows } from '../src/data/local-store'

// --- 模拟 localStorage ---
const mem = new Map<string, string>()
;(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
}

function reset() {
  mem.clear()
  resetRows('drainpipe')
}

// 1. 种子数据规范化：去重（DRAI-0002 只留一条）、唯一顺序、废弃收尾
reset()
let seq = drainpipeSequence()
assert.equal(seq.length, 8, `期望 8 段（去掉重复登记），实际 ${seq.length}`)
assert.deepEqual(
  seq.map((r) => r['管段编号']),
  ['DRAI-0001', 'DRAI-0002', 'DRAI-0003', 'DRAI-0004', 'DRAI-0005', 'DRAI-0006', 'DRAI-0007', 'DRAI-0009'],
)
assert.deepEqual(seq.map((r) => Number(r['线序'])), [1, 2, 3, 4, 5, 6, 7, 8], '线序必须连续写入数据')
assert.equal(seq[seq.length - 1].status, '已废弃', '废弃段收在末尾')
assert.equal(seq[seq.length - 1]['起点井号'], 'WS-02', '末尾应是废弃的 DRAI-0009')
assert.equal(drainpipeSummary().pendingPatrol, 4, '待巡线 4 段：0001/0004/0006/0007')

// 同管径 DN600 的三段应按井号连排，不会被拆成两截
assert.deepEqual(
  seq.slice(0, 3).map((r) => r['管径']),
  ['DN600', 'DN600', 'DN600'],
)

// 2. 列表、详情、看板同源
assert.equal(listDrainpipes().total, 8)
const detail = getDrainpipe(Number(seq[2].id))!
assert.equal(detail.row['管段编号'], 'DRAI-0003')
assert.equal(detail.prev!['管段编号'], 'DRAI-0002')
assert.equal(detail.next!['管段编号'], 'DRAI-0004')
assert.equal(drainpipeSummary().total, 8)

// 3. 筛选不改变线序（结果保留全局线序号）
const filtered = listDrainpipes({ 起点井号: 'WS-04' })
assert.equal(filtered.total, 1)
assert.equal(filtered.items[0]['管段编号'], 'DRAI-0004')
assert.equal(Number(filtered.items[0]['线序']), 4)

// 4. 状态不允许跳级：待清淤动作在「待巡线」上必须被拦
const patrolId = Number(seq[0].id) // DRAI-0001 待巡线
let r = runDrainpipeAction(patrolId, '安排清淤')
assert.equal(r.ok, false, '待巡线不能直接安排清淤（跳级）')
assert.match(r.message, /不允许跳级/)
// 完成巡线 -> 运行正常，再安排清淤 -> 待清淤，顺向放行
assert.equal(runDrainpipeAction(patrolId, '完成巡线').ok, true)
assert.equal(listRows('drainpipe').find((x) => Number(x.id) === patrolId)!.status, '运行正常')
assert.equal(runDrainpipeAction(patrolId, '安排清淤').ok, true)
assert.equal(listRows('drainpipe').find((x) => Number(x.id) === patrolId)!.status, '待清淤')
// 已到待清淤，完成巡线不能再往回走
r = runDrainpipeAction(patrolId, '完成巡线')
assert.equal(r.ok, false)
// 报废任意在用状态可走，报废后不能再流转
assert.equal(runDrainpipeAction(patrolId, '报废管段').ok, true)
r = runDrainpipeAction(patrolId, '安排清淤')
assert.equal(r.ok, false)
assert.match(r.message, /已废弃/)
// 报废后该段挪到废弃区，废弃组内仍按井号排列，其余段顺序不变且线序重写
seq = drainpipeSequence()
const discarded = seq.filter((x) => x.status === '已废弃')
assert.equal(discarded.length, 2)
assert.deepEqual(
  discarded.map((x) => x['管段编号']),
  ['DRAI-0001', 'DRAI-0009'],
  '废弃组内按起点井号：WS-01 的 DRAI-0001 在 WS-02 的 DRAI-0009 前',
)
assert.deepEqual(seq.map((x) => Number(x['线序'])), seq.map((_, i) => i + 1), '线序始终连续')

// 5. 持久化：重新「进入」（清缓存重新读取）顺序不变
const snapshot = JSON.stringify(drainpipeSequence().map((x) => [x['管段编号'], x['线序'], x.status]))
// 清掉内存缓存：通过新进程模拟不了，直接校验存储里已经是规范顺序
const stored = JSON.parse(mem.get([...mem.keys()].find((k) => k.includes('entries'))!)!)
const storedPipe = stored.drainpipe
assert.deepEqual(
  storedPipe.map((x: any) => [x['管段编号'], x['线序'], x.status]),
  JSON.parse(snapshot),
  'localStorage 里落库的顺序必须等于展示顺序',
)

// 6. 重复登记只留一条：登记已存在编号被拒
reset()
r = createDrainpipe({
  管段编号: 'DRAI-0001',
  起点井号: 'WS-100',
  终点井号: 'WS-101',
  管径: 'DN300',
})
assert.equal(r.ok, false)
assert.match(r.message, /已登记/)
assert.equal(drainpipeSequence().length, 8)

// 7. 必填校验
r = createDrainpipe({ 管段编号: 'DRAI-0100', 起点井号: '', 终点井号: 'WS-1', 管径: 'DN300' })
assert.equal(r.ok, false)
assert.match(r.message, /起点井号/)

// 8. 新登记段按起点井号插入正确位置
r = createDrainpipe({
  管段编号: 'DRAI-0035',
  起点井号: 'WS-035',
  终点井号: 'WS-036',
  管径: 'DN400',
})
assert.equal(r.ok, true)
seq = drainpipeSequence()
const idx = seq.findIndex((x) => x['管段编号'] === 'DRAI-0035')
assert.equal(seq[idx - 1]['起点井号'], 'WS-07', '数字感知排序：35 > 7，WS-035 应在 WS-07 之后')
assert.equal(seq[idx + 1].status, '已废弃', '新段在正线末尾、废弃段之前')

// 9. 改起点井号后立即重排
const target = seq.find((x) => x['管段编号'] === 'DRAI-0007')!
r = updateDrainpipe(Number(target.id), {
  管段编号: 'DRAI-0007',
  起点井号: 'WS-025',
  终点井号: 'WS-026',
  管径: 'DN400',
})
assert.equal(r.ok, true)
seq = drainpipeSequence()
const codes = seq.map((x) => x['起点井号'])
const ordered = codes.slice(0, seq.length - 1)
assert.deepEqual([...ordered].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), ordered, '非废弃段必须按起点井号有序')
assert.deepEqual(seq.map((x) => Number(x['线序'])), seq.map((_, i) => i + 1), '重排后线序连续')
// 编辑时把编号改成已存在的编号被拒
r = updateDrainpipe(Number(target.id), {
  管段编号: 'DRAI-0001',
  起点井号: 'WS-025',
  终点井号: 'WS-026',
  管径: 'DN400',
})
assert.equal(r.ok, false)
assert.match(r.message, /已被其他段登记/)

// 10. 数字感知排序：WS-10 不排到 WS-2 前面
reset()
createDrainpipe({ 管段编号: 'T-1', 起点井号: 'WS-10', 终点井号: 'WS-11', 管径: 'DN300' })
createDrainpipe({ 管段编号: 'T-2', 起点井号: 'WS-2', 终点井号: 'WS-3', 管径: 'DN300' })
seq = drainpipeSequence()
assert.ok(
  seq.findIndex((x) => x['起点井号'] === 'WS-2') < seq.findIndex((x) => x['起点井号'] === 'WS-10'),
  '数字感知排序：WS-2 在 WS-10 前',
)

console.log('全部线序规则冒烟测试通过 ✔')
