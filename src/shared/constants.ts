export const CATEGORIES = [
  '电阻',
  '电容',
  '电感',
  '二极管',
  '三极管',
  'MOS管',
  'LED',
  '光耦',
  '晶振',
  '继电器',
  '保险丝',
  'MCU',
  '电源管理',
  '运放',
  '存储',
  '逻辑',
  '连接器',
  '传感器',
  '模块',
  '其他'
] as const

export const PACKAGINGS = ['盘装', '管装', '托盘', '散装'] as const

export const UNITS = ['个', '片', '只', '颗', '盘', '卷', 'm', 'g'] as const

/* ------------------------- 物料大类 ------------------------- */

export const ITEM_KINDS = ['component', 'board', 'module', 'hardware', 'consumable'] as const

export type ItemKind = (typeof ITEM_KINDS)[number]

export interface KindMeta {
  key: ItemKind
  /** 导航与页面标题 */
  label: string
  /** 单个物料的称呼，用于"新建××"这类文案 */
  noun: string
  /** 型号 / 规格 */
  specLabel: string
  specPlaceholder: string
  /** 厂商 / 品牌 */
  makerLabel: string
  makerPlaceholder: string
  /** 封装 / 尺寸 */
  packageLabel: string
  packagePlaceholder: string
  /** 描述输入框的示例文案 */
  descriptionPlaceholder: string
  categories: readonly string[]
  units: readonly string[]
  packagings: readonly string[]
  defaultUnit: string
}

export const KIND_META: Record<ItemKind, KindMeta> = {
  component: {
    key: 'component',
    label: '电子元器件',
    noun: '物料',
    specLabel: '型号',
    specPlaceholder: 'STM32F103C8T6',
    makerLabel: '厂商',
    makerPlaceholder: 'ST / TI / Espressif',
    packageLabel: '封装',
    packagePlaceholder: 'LQFP-48 / 0402',
    descriptionPlaceholder: 'ARM Cortex-M3 72MHz 64KB Flash',
    categories: CATEGORIES,
    units: UNITS,
    packagings: PACKAGINGS,
    defaultUnit: '个'
  },
  board: {
    key: 'board',
    label: '开发板',
    noun: '开发板',
    specLabel: '型号',
    specPlaceholder: 'STM32F407ZGT6 核心板',
    makerLabel: '厂商',
    makerPlaceholder: '正点原子 / 野火 / 树莓派',
    packageLabel: '板型',
    packagePlaceholder: '核心板 / 100×60mm',
    descriptionPlaceholder: '主控型号、板载资源与接口',
    categories: ['核心板', '开发套件', '扩展板', '下载器', '其他'],
    units: ['块', '片', '套', '个'],
    packagings: ['原包', '静电袋', '散装'],
    defaultUnit: '块'
  },
  module: {
    key: 'module',
    label: '电子模块',
    noun: '模块',
    specLabel: '型号',
    specPlaceholder: 'ESP32-CAM / LM2596 降压模块',
    makerLabel: '厂商',
    makerPlaceholder: '安信可 / 微雪 / 国产',
    packageLabel: '尺寸',
    packagePlaceholder: '28×32mm',
    descriptionPlaceholder: '模块用途与关键参数',
    categories: ['通信模块', '电源模块', '传感模块', '驱动模块', '显示模块', '其他'],
    units: ['个', '块', '片'],
    packagings: ['静电袋', '托盘', '散装'],
    defaultUnit: '个'
  },
  hardware: {
    key: 'hardware',
    label: '五金',
    noun: '五金件',
    specLabel: '规格',
    specPlaceholder: 'M3×8 内六角螺丝',
    makerLabel: '品牌',
    makerPlaceholder: '国产 / 进口',
    packageLabel: '尺寸',
    packagePlaceholder: 'M3 / 8mm',
    descriptionPlaceholder: '材质、头型、表面处理',
    categories: ['螺丝', '螺母', '垫片', '支架', '外壳', '工具', '其他'],
    units: ['个', '套', '包', '只', 'kg'],
    packagings: ['散装', '袋装', '盒装'],
    defaultUnit: '个'
  },
  consumable: {
    key: 'consumable',
    label: '耗材',
    noun: '耗材',
    specLabel: '规格',
    specPlaceholder: '0.8mm 有铅焊锡丝 100g',
    makerLabel: '品牌',
    makerPlaceholder: '白猴 / 千住 / 3M',
    packageLabel: '包装规格',
    packagePlaceholder: '100g / 500ml',
    descriptionPlaceholder: '规格、成分与净含量',
    categories: ['焊锡', '助焊剂', '清洗剂', '胶粘', '线材', '其他'],
    units: ['卷', '瓶', '支', '包', 'm', 'g'],
    packagings: ['盒装', '瓶装', '卷装', '散装'],
    defaultUnit: '瓶'
  }
}

export const KIND_OPTIONS = ITEM_KINDS.map((kind) => ({
  value: kind,
  label: KIND_META[kind].label
}))

/** 所有大类分类的并集，给 AI 工具这类"不知道当前页面"的场景用 */
export const ALL_CATEGORIES: readonly string[] = Array.from(
  new Set(ITEM_KINDS.flatMap((kind) => KIND_META[kind].categories))
)

/** 把任意文本（中文标签或英文键）解析成合法大类，认不出来就退回元器件 */
export function normalizeKind(raw: unknown): ItemKind {
  const text = String(raw ?? '').trim()
  if (!text) return 'component'
  const lower = text.toLowerCase()
  if ((ITEM_KINDS as readonly string[]).includes(lower)) return lower as ItemKind
  const byLabel = ITEM_KINDS.find((kind) => KIND_META[kind].label === text)
  if (byLabel) return byLabel
  const alias: Record<string, ItemKind> = {
    元器件: 'component',
    芯片: 'component',
    电子元件: 'component',
    开发板: 'board',
    核心板: 'board',
    模块: 'module',
    电子模块: 'module',
    五金: 'hardware',
    五金件: 'hardware',
    紧固件: 'hardware',
    耗材: 'consumable'
  }
  return alias[text] ?? 'component'
}

export const MOVEMENT_TYPES = ['in', 'out', 'adjust', 'init'] as const

export const MOVEMENT_LABELS: Record<string, string> = {
  in: '入库',
  out: '出库',
  adjust: '盘点',
  init: '建档'
}

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

export const DEFAULT_MCP_PORT = 8788
export const DEFAULT_MCP_HOST = '127.0.0.1'
