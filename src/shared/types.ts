import type { ItemKind } from './constants'

export interface Component {
  id: string
  kind: ItemKind
  partNumber: string
  manufacturer: string
  category: string | null
  package: string | null
  description: string | null
  dateCode: string | null
  packaging: string | null
  quantity: number
  unit: string
  safetyStock: number
  unitPrice: number | null
  currency: string
  moq: number | null
  msl: number | null
  rohs: number | null
  locationId: string | null
  locationFullCode: string | null
  supplierId: string | null
  supplierName: string | null
  /** 本地附件路径，预留给后台上传的图片 */
  imagePath: string | null
  /** 商品照片外链，填了才在界面上显示缩略图 */
  imageUrl: string | null
  tags: string | null
  note: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: string
  code: string | null
  name: string
  shortName: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  website: string | null
  paymentTerms: string | null
  level: number
  tags: string | null
  note: string | null
  status: string
  createdAt: string
  updatedAt: string
  componentCount?: number
  totalQuantity?: number
}

export interface StorageLocation {
  id: string
  parentId: string | null
  code: string
  fullCode: string
  name: string | null
  kind: string
  capacity: number | null
  note: string | null
  createdAt: string
}

export interface Movement {
  id: string
  componentId: string
  type: string
  quantity: number
  beforeQty: number
  afterQty: number
  unitPrice: number | null
  supplierId: string | null
  dateCode: string | null
  projectRef: string | null
  operator: string
  note: string | null
  occurredAt: string
  createdAt: string
  partNumber?: string
  manufacturer?: string
  supplierName?: string | null
}

export type SortKey = 'updated' | 'partNumber' | 'quantity' | 'location'

export interface ComponentListQuery {
  q?: string
  kind?: ItemKind
  manufacturer?: string
  category?: string
  locationCode?: string
  supplierId?: string
  lowStock?: boolean
  status?: 'active' | 'archived' | 'all'
  sort?: SortKey
  page?: number
  pageSize?: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface SupplierListQuery {
  q?: string
  status?: 'active' | 'archived' | 'all'
  page?: number
  pageSize?: number
}

export interface MovementListQuery {
  componentId?: string
  type?: string
  source?: 'all' | 'local' | 'ai'
  page?: number
  pageSize?: number
}

export interface InventoryStats {
  skuCount: number
  totalQuantity: number
  lowStockCount: number
  movementsToday: number
  supplierCount: number
  locationCount: number
}

export interface AppSettings {
  dataDir: string
  mcpPort: number
  mcpToken: string
  mcpEnabled: boolean
  minimizeToTray: boolean
  launchAtLogin: boolean
  closeToTray: boolean
  /** 界面字体，默认 'misans'（小米 MiSans） */
  fontFamily: string
}
