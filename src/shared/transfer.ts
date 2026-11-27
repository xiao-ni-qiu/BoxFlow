/**
 * 导入导出的列定义。
 * 表头用中文，同时接受常见的英文/别名写法，导入时自动识别。
 */

export type ColumnKind = 'text' | 'int' | 'price' | 'bool'

export interface ColumnDef {
  /** 内部字段名，对应 Component 的属性 */
  key: string
  /** 导出时的表头文字 */
  label: string
  /** 导入时额外认可的别名（大小写、空格不敏感） */
  aliases: string[]
  kind: ColumnKind
  /** Excel 列宽 */
  width: number
  /** 是否必填 */
  required?: boolean
  hint?: string
}

export const COMPONENT_COLUMNS: ColumnDef[] = [
  {
    key: 'kind',
    label: '大类',
    aliases: ['kind', 'bigcategory', '大类', '物料大类'],
    kind: 'text',
    width: 12,
    hint: '电子元器件 / 开发板 / 电子模块 / 五金 / 耗材，留空按当前页面归类'
  },
  {
    key: 'partNumber',
    label: '型号',
    aliases: ['partnumber', 'part_no', 'partno', 'pn', '料号', '物料型号', '规格型号'],
    kind: 'text',
    width: 22,
    required: true,
    hint: '与厂商组合唯一'
  },
  {
    key: 'manufacturer',
    label: '厂商',
    aliases: ['manufacturer', 'mfr', 'brand', 'maker', '品牌', '厂家', '制造商'],
    kind: 'text',
    width: 16
  },
  {
    key: 'category',
    label: '分类',
    aliases: ['category', 'type', '类别', '类型'],
    kind: 'text',
    width: 12
  },
  {
    key: 'package',
    label: '封装',
    aliases: ['package', 'footprint', 'case', '封装形式'],
    kind: 'text',
    width: 12
  },
  {
    key: 'quantity',
    label: '数量',
    aliases: ['quantity', 'qty', 'stock', 'amount', '库存', '库存数量', '在手数量'],
    kind: 'int',
    width: 10
  },
  {
    key: 'unit',
    label: '单位',
    aliases: ['unit', 'uom', '单位名称'],
    kind: 'text',
    width: 8
  },
  {
    key: 'safetyStock',
    label: '安全库存',
    aliases: ['safetystock', 'safety_stock', 'minstock', 'min', '预警值', '最小库存'],
    kind: 'int',
    width: 10
  },
  {
    key: 'locationCode',
    label: '位置编码',
    aliases: ['locationcode', 'location', 'bin', 'position', '库位', '位置', '存放位置'],
    kind: 'text',
    width: 14,
    hint: '如 A-01-03，不存在会自动创建'
  },
  {
    key: 'unitPrice',
    label: '单价',
    aliases: ['unitprice', 'price', 'cost', '价格', '成本价'],
    kind: 'price',
    width: 10
  },
  {
    key: 'currency',
    label: '币种',
    aliases: ['currency', 'ccy', '货币'],
    kind: 'text',
    width: 8
  },
  {
    key: 'packaging',
    label: '包装形式',
    aliases: ['packaging', 'package_type', '包装'],
    kind: 'text',
    width: 10
  },
  {
    key: 'dateCode',
    label: '批号',
    aliases: ['datecode', 'date_code', 'lot', '批次', '生产批次'],
    kind: 'text',
    width: 10
  },
  {
    key: 'msl',
    label: 'MSL',
    aliases: ['msl', '湿敏等级'],
    kind: 'int',
    width: 8
  },
  {
    key: 'rohs',
    label: 'RoHS',
    aliases: ['rohs', '环保'],
    kind: 'bool',
    width: 8
  },
  {
    key: 'supplierName',
    label: '供应商',
    aliases: ['supplier', 'vendorname', 'suppliername', 'vendor', '供货商'],
    kind: 'text',
    width: 18
  },
  {
    key: 'tags',
    label: '标签',
    aliases: ['tags', 'tag', '标记'],
    kind: 'text',
    width: 16,
    hint: '逗号分隔'
  },
  {
    key: 'description',
    label: '描述',
    aliases: ['description', 'desc', 'remark_name', '说明', '物料描述'],
    kind: 'text',
    width: 30
  },
  {
    key: 'note',
    label: '备注',
    aliases: ['note', 'notes', 'comment', 'comments', 'remarks'],
    kind: 'text',
    width: 24
  },
  {
    key: 'imageUrl',
    label: '照片链接',
    aliases: ['imageurl', 'image', 'img', 'photo', 'picture', '图片', '照片', '图片链接'],
    kind: 'text',
    width: 30,
    hint: 'http(s) 图片地址，留空则不显示缩略图'
  }
]

export const SUPPLIER_COLUMNS: ColumnDef[] = [
  { key: 'name', label: '供应商名称', aliases: ['name', 'supplier', 'vendor', '名称'], kind: 'text', width: 24, required: true },
  { key: 'code', label: '编码', aliases: ['code', 'no', '编号'], kind: 'text', width: 12 },
  { key: 'shortName', label: '简称', aliases: ['shortname', 'short_name', 'alias', '缩写'], kind: 'text', width: 14 },
  { key: 'contactName', label: '联系人', aliases: ['contactname', 'contact', 'contact_name', '联络人'], kind: 'text', width: 12 },
  { key: 'phone', label: '电话', aliases: ['phone', 'tel', 'telephone', 'mobile', '手机', '联系电话'], kind: 'text', width: 16 },
  { key: 'email', label: '邮箱', aliases: ['email', 'mail', 'e-mail'], kind: 'text', width: 24 },
  { key: 'address', label: '地址', aliases: ['address', 'addr', '地址信息'], kind: 'text', width: 28 },
  { key: 'website', label: '网站', aliases: ['website', 'url', 'site', '网址'], kind: 'text', width: 22 },
  { key: 'paymentTerms', label: '账期', aliases: ['paymentterms', 'payment_terms', 'terms', '付款条件'], kind: 'text', width: 14 },
  { key: 'level', label: '等级', aliases: ['level', 'grade', '评级'], kind: 'int', width: 8, hint: '1-5' },
  { key: 'tags', label: '标签', aliases: ['tags', 'tag'], kind: 'text', width: 14 },
  { key: 'note', label: '备注', aliases: ['note', 'notes', '备注信息'], kind: 'text', width: 24 }
]

export const MOVEMENT_COLUMNS: ColumnDef[] = [
  { key: 'occurredAt', label: '时间', aliases: ['occurredat', 'time', 'date', '日期', '操作时间'], kind: 'text', width: 20 },
  { key: 'partNumber', label: '型号', aliases: ['partnumber', 'part_no', 'pn', '料号'], kind: 'text', width: 22 },
  { key: 'manufacturer', label: '厂商', aliases: ['manufacturer', 'mfr', '品牌'], kind: 'text', width: 16 },
  { key: 'type', label: '类型', aliases: ['type', 'kind', '操作类型'], kind: 'text', width: 10 },
  { key: 'quantity', label: '变动数量', aliases: ['quantity', 'qty', 'change', '数量', '变动'], kind: 'int', width: 10 },
  { key: 'beforeQty', label: '变动前', aliases: ['beforeqty', 'before', '变动前数量'], kind: 'int', width: 10 },
  { key: 'afterQty', label: '变动后', aliases: ['afterqty', 'after', '变动后数量'], kind: 'int', width: 10 },
  { key: 'unitPrice', label: '单价', aliases: ['unitprice', 'price'], kind: 'price', width: 10 },
  { key: 'supplierName', label: '供应商', aliases: ['supplier', 'vendor', '供货商'], kind: 'text', width: 18 },
  { key: 'projectRef', label: '项目/工单', aliases: ['projectref', 'project', 'ref', '工单', '项目'], kind: 'text', width: 16 },
  { key: 'operator', label: '操作来源', aliases: ['operator', 'source', 'user', '操作人'], kind: 'text', width: 16 },
  { key: 'note', label: '备注', aliases: ['note', 'notes', '备注信息'], kind: 'text', width: 24 }
]

/** 表头归一化：去掉空格、下划线、连字符，转小写 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/[\s_\-()[\]（）]/g, '')
    .toLowerCase()
}

/** 根据表头文字找列定义 */
export function matchColumn(header: string, columns: ColumnDef[]): ColumnDef | null {
  const key = normalizeHeader(header)
  if (!key) return null
  for (const col of columns) {
    if (normalizeHeader(col.label) === key) return col
    if (normalizeHeader(col.key) === key) return col
    if (col.aliases.some((alias) => normalizeHeader(alias) === key)) return col
  }
  return null
}

export type DuplicateStrategy = 'skip' | 'merge' | 'overwrite'

export interface ImportPreviewRow {
  /** 原始行号（Excel 行号，从 1 开始，含表头） */
  row: number
  values: Record<string, string | number | boolean | null>
  /** 校验问题，非空则这行会被跳过 */
  errors: string[]
  /** 与库中已有记录的匹配情况 */
  action: 'create' | 'update' | 'skip' | 'error'
  existingId?: string
  existingLabel?: string
}

export interface ImportPreview {
  /** 文件解析出的完整表头 */
  headers: string[]
  /** 自动识别的映射：表头 -> 字段 key */
  mapping: Record<string, string>
  /** 未识别的表头 */
  unmapped: string[]
  rows: ImportPreviewRow[]
  summary: {
    total: number
    create: number
    update: number
    skip: number
    error: number
  }
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  failed: { row: number; message: string }[]
}

export type TransferEntity = 'components' | 'suppliers' | 'movements'

export const ENTITY_COLUMNS: Record<TransferEntity, ColumnDef[]> = {
  components: COMPONENT_COLUMNS,
  suppliers: SUPPLIER_COLUMNS,
  movements: MOVEMENT_COLUMNS
}

export const ENTITY_LABELS: Record<TransferEntity, string> = {
  components: '电子元器件',
  suppliers: '供应商',
  movements: '出入库流水'
}
