#!/usr/bin/env node
/**
 * MCP 服务端到端自测。
 *
 * 前置：先启动库存管理程序（它会在 127.0.0.1:8788 起 MCP 服务）。
 * 运行：node scripts/test-mcp.mjs
 *
 * 覆盖：握手 → 工具清单 → 自动建档入库 → 重复入库累加 → 检索 → 出库 → 概览 → 鉴权拒绝
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOST = '127.0.0.1'

function discoveryCandidates() {
  if (process.env.BOXFLOW_MCP_DISCOVERY) return [process.env.BOXFLOW_MCP_DISCOVERY]
  if (process.env.INVENTORY_MCP_DISCOVERY) return [process.env.INVENTORY_MCP_DISCOVERY]

  const roots = []
  if (process.platform === 'win32') {
    roots.push(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'))
  } else if (process.platform === 'darwin') {
    roots.push(join(homedir(), 'Library', 'Application Support'))
  } else {
    roots.push(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'))
  }

  const names = ['BoxFlow', 'boxflow', 'InventoryManager', 'inventory-manager']
  return roots.flatMap((root) => names.map((name) => join(root, name, 'mcp-connection.json')))
}

const file = discoveryCandidates().find((candidate) => existsSync(candidate))
if (!file) {
  console.error(`找不到连接文件，已尝试：\n${discoveryCandidates().join('\n')}\n请先启动 BoxFlow。`)
  process.exit(1)
}

const conn = JSON.parse(readFileSync(file, 'utf8'))
const URL_BASE = `http://${HOST}:${conn.port}`
const TOKEN = process.env.INVENTORY_MCP_TOKEN || conn.token

let sessionId = null
let nextId = 1
const results = []

async function rpc(method, params, { token = TOKEN, expectHttp = 200 } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (sessionId) headers['Mcp-Session-Id'] = sessionId

  const response = await fetch(`${URL_BASE}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params })
  })

  const issued = response.headers.get('mcp-session-id')
  if (issued) sessionId = issued

  const body = await response.json().catch(() => null)

  if (expectHttp !== response.status) {
    throw new Error(`${method} 期望 HTTP ${expectHttp}，实际 ${response.status}`)
  }
  return body
}

function check(label, condition, detail) {
  results.push({ label, ok: Boolean(condition), detail })
  const mark = condition ? '  OK  ' : ' FAIL '
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ''}`)
  return Boolean(condition)
}

function payload(response) {
  if (!response) return null
  const text = response.result?.content?.[0]?.text
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function main() {
  console.log(`目标：${URL_BASE}  令牌：${TOKEN.slice(0, 8)}…\n`)

  /* 1. 健康检查 */
  const health = await fetch(`${URL_BASE}/health`).then((r) => r.json())
  check('健康检查可访问', health.ok === true, `${health.tools} 个工具`)

  /* 2. 握手 */
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'selftest', version: '1.0.0' }
  })
  check('initialize 返回 serverInfo', init?.result?.serverInfo?.name === 'boxflow',
    init?.result?.serverInfo?.version)
  check('返回 Mcp-Session-Id', Boolean(sessionId), sessionId ?? '（无）')

  /* 3. 工具清单 */
  const list = await rpc('tools/list', {})
  const tools = list?.result?.tools ?? []
  check('tools/list 非空', tools.length >= 10, `${tools.length} 个：${tools.map((t) => t.name).join(', ')}`)

  /* 4. 自动建档入库 */
  // 每次用新料号，断言才能是绝对值，也不会被上一轮残留干扰
  const stamp = Date.now().toString(36).toUpperCase().slice(-6)
  const partNumber = `SELFTEST-${stamp}`
  const bulkA = `${partNumber}-A`
  const bulkB = `${partNumber}-B`

  const add1 = payload(
    await rpc('tools/call', {
      name: 'add_stock',
      arguments: {
        partNumber,
        quantity: 100,
        manufacturer: 'ST',
        locationCode: 'SELFTEST-A-01',
        unitPrice: 9.9,
        note: '自测入库'
      }
    })
  )
  check('add_stock 自动建档并入库', add1?.ok === true && add1?.after === 100,
    `created=${add1?.created} after=${add1?.after}`)

  /* 5. 重复入库累加 */
  const add2 = payload(
    await rpc('tools/call', { name: 'add_stock', arguments: { partNumber, quantity: 50 } })
  )
  check('重复 add_stock 累加到 150', add2?.after === 150 && add2?.created === false,
    `created=${add2?.created} after=${add2?.after}`)

  /* 6. 检索 */
  const search = payload(
    await rpc('tools/call', { name: 'search_components', arguments: { keyword: 'SELFTEST' } })
  )
  check('search_components 能命中', (search?.items ?? []).some((i) => i.partNumber === partNumber),
    `total=${search?.total}`)

  /* 7. 明细含流水 */
  const detail = payload(
    await rpc('tools/call', { name: 'get_component', arguments: { partNumber, movementLimit: 5 } })
  )
  check('get_component 返回最近流水',
    (detail?.recentMovements ?? []).length >= 2,
    `${(detail?.recentMovements ?? []).length} 条，来源=${detail?.recentMovements?.[0]?.operator}`)

  /* 8. 出库 */
  const out = payload(
    await rpc('tools/call', {
      name: 'remove_stock',
      arguments: { partNumber, quantity: 30, projectRef: 'SELFTEST-BOARD' }
    })
  )
  check('remove_stock 扣减到 120', out?.after === 120, `after=${out?.after}`)

  /* 9. 超量出库应被拒绝 */
  const over = await rpc('tools/call', {
    name: 'remove_stock',
    arguments: { partNumber, quantity: 99999 }
  })
  check('超量出库被拒绝', over?.result?.isError === true, over?.result?.content?.[0]?.text?.slice(0, 40))

  /* 10. 盘点 */
  const adjust = payload(
    await rpc('tools/call', { name: 'set_stock', arguments: { partNumber, quantity: 88 } })
  )
  check('set_stock 盘点生效', adjust?.after === 88, `after=${adjust?.after}`)

  /* 11. 概览 */
  const stats = payload(await rpc('tools/call', { name: 'get_stats', arguments: {} }))
  check('get_stats 返回指标', typeof stats?.skuCount === 'number',
    `SKU=${stats?.skuCount} 总数量=${stats?.totalQuantity}`)

  /* 12. 批量入库 */
  const bulk = payload(
    await rpc('tools/call', {
      name: 'bulk_add_stock',
      arguments: {
        items: [
          { partNumber: bulkA, quantity: 10 },
          { partNumber: bulkB, quantity: 20, kind: '五金' }
        ]
      }
    })
  )
  check('bulk_add_stock 全部成功', bulk?.succeeded === 2, `${bulk?.succeeded}/${bulk?.total}`)

  /* 12.1 大类过滤：批量入库时指定了五金，应能按大类查到 */
  const byKind = payload(
    await rpc('tools/call', {
      name: 'search_components',
      arguments: { keyword: partNumber, kind: '五金' }
    })
  )
  check(
    'search_components 支持按大类过滤',
    (byKind?.items ?? []).length === 1 && byKind?.items?.[0]?.kind === '五金',
    `命中 ${byKind?.total}，kind=${byKind?.items?.[0]?.kind}`
  )

  /* 13. 鉴权拒绝 */
  const denied = await rpc('tools/list', {}, { token: 'wrong-token', expectHttp: 401 })
  check('错误令牌返回 401', denied?.error?.code === -32001)

  /* 14. 未知方法 */
  const unknown = await rpc('no/such/method', {})
  check('未知方法返回 methodNotFound', unknown?.error?.code === -32601)

  /* 15. 归档测试数据，避免污染界面 */
  const archived = payload(
    await rpc('tools/call', {
      name: 'archive_component',
      arguments: { partNumber, restore: false }
    })
  )
  check('archive_component 归档自测物料', archived?.status === 'archived', archived?.message)

  /* 16. 已归档物料再次入库应自动恢复，不能报"型号已存在" */
  const revived = payload(
    await rpc('tools/call', { name: 'add_stock', arguments: { partNumber, quantity: 5 } })
  )
  check('归档物料再次入库自动恢复', revived?.reactivated === true, revived?.message)

  /* 17. 收尾：把自测物料全部归档 */
  for (const pn of [partNumber, bulkA, bulkB]) {
    await rpc('tools/call', {
      name: 'archive_component',
      arguments: { partNumber: pn, restore: false }
    }).catch(() => null)
  }

  const afterClean = payload(
    await rpc('tools/call', { name: 'search_components', arguments: { keyword: 'SELFTEST' } })
  )
  check('归档后默认检索不再出现', (afterClean?.items ?? []).length === 0,
    `剩余 ${(afterClean?.items ?? []).length} 条`)

  /* 汇总 */
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${'─'.repeat(52)}`)
  console.log(`共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (failed.length) {
    for (const f of failed) console.log(`  失败：${f.label}（${f.detail ?? ''}）`)
    process.exit(1)
  }
  console.log('MCP 服务全部检查通过。')
}

main().catch((err) => {
  console.error('自测中断：', err.message)
  process.exit(1)
})
