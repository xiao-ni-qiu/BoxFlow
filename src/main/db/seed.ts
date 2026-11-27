import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDb, getDataDir } from '../db'
import { componentsRepo } from '../modules/components/repository'
import { componentsService } from '../modules/components/service'
import { suppliersRepo } from '../modules/suppliers/repository'
import { locationsRepo } from '../modules/locations/repository'
import { movementsRepo } from '../modules/movements/repository'
import { newId, nowIso } from '../ids'
import type { ItemKind } from '@shared/constants'

const SUPPLIERS = [
  { name: '立创商城', shortName: '立创', contactName: '张工', phone: '400-800-1234', level: 5, paymentTerms: '现结', tags: '现货,原厂' },
  { name: '深圳华强电子', shortName: '华强', contactName: '李经理', phone: '0755-8888-6666', level: 4, paymentTerms: '月结30天', tags: '现货' },
  { name: '得捷电子 Digi-Key', shortName: 'DigiKey', contactName: 'Support', phone: '', level: 4, paymentTerms: '预付', tags: '原厂,海外' },
  { name: '贸泽电子 Mouser', shortName: 'Mouser', contactName: '', phone: '', level: 3, paymentTerms: '预付', tags: '原厂,海外' },
  { name: '东莞长安电子城', shortName: '长安', contactName: '陈老板', phone: '138-0000-0000', level: 2, paymentTerms: '现结', tags: '拆机件' }
]

const LOCATIONS = ['A-01-01', 'A-01-02', 'A-02-03', 'B-01-05', 'B-02-04', 'C-03-01', 'D-01-01', 'D-02-02']

interface SeedComponent {
  partNumber: string
  manufacturer: string
  category: string
  package: string
  description: string
  quantity: number
  safetyStock: number
  unitPrice: number
  location: string
  supplierIndex: number
  dateCode: string
  packaging: string
  msl?: number
  tags?: string
}

const COMPONENTS: SeedComponent[] = [
  { partNumber: 'STM32F103C8T6', manufacturer: 'ST', category: 'MCU', package: 'LQFP-48', description: 'ARM Cortex-M3 72MHz 64KB Flash', quantity: 340, safetyStock: 50, unitPrice: 8.6, location: 'A-02-03', supplierIndex: 0, dateCode: '2432', packaging: '托盘', msl: 3, tags: '常用' },
  { partNumber: 'STM32F407VGT6', manufacturer: 'ST', category: 'MCU', package: 'LQFP-100', description: 'Cortex-M4 168MHz 1MB Flash', quantity: 62, safetyStock: 20, unitPrice: 32.5, location: 'A-02-03', supplierIndex: 0, dateCode: '2418', packaging: '托盘', msl: 3 },
  { partNumber: 'ESP32-WROOM-32E', manufacturer: 'Espressif', category: '模块', package: 'SMD-38', description: 'Wi-Fi + BLE 双模模组 4MB Flash', quantity: 96, safetyStock: 30, unitPrice: 15.8, location: 'B-02-04', supplierIndex: 1, dateCode: '2426', packaging: '盘装', msl: 3, tags: '物联网' },
  { partNumber: 'AMS1117-3.3', manufacturer: 'AMS', category: '电源管理', package: 'SOT-223', description: '1A 低压差线性稳压器 3.3V', quantity: 1250, safetyStock: 200, unitPrice: 0.32, location: 'B-01-05', supplierIndex: 1, dateCode: '2408', packaging: '盘装' },
  { partNumber: 'TPS5430DDA', manufacturer: 'TI', category: '电源管理', package: 'SOIC-8', description: '3A 降压型 DC-DC 转换器', quantity: 18, safetyStock: 50, unitPrice: 4.75, location: 'C-03-01', supplierIndex: 2, dateCode: '2412', packaging: '管装', msl: 2, tags: '缺货预警' },
  { partNumber: 'LM2596S-5.0', manufacturer: 'TI', category: '电源管理', package: 'TO-263', description: '3A 降压稳压器 5V 固定输出', quantity: 240, safetyStock: 60, unitPrice: 2.1, location: 'C-03-01', supplierIndex: 1, dateCode: '2405', packaging: '管装' },
  { partNumber: 'NE5532DR', manufacturer: 'TI', category: '运放', package: 'SOIC-8', description: '双通道低噪声运算放大器', quantity: 620, safetyStock: 100, unitPrice: 1.35, location: 'A-01-02', supplierIndex: 0, dateCode: '2420', packaging: '盘装' },
  { partNumber: 'OPA2134PA', manufacturer: 'TI', category: '运放', package: 'DIP-8', description: '音频级双运放', quantity: 45, safetyStock: 20, unitPrice: 12.4, location: 'A-01-02', supplierIndex: 3, dateCode: '2312', packaging: '管装' },
  { partNumber: 'W25Q128JVSIQ', manufacturer: 'Winbond', category: '存储', package: 'SOIC-8', description: '128Mbit SPI NOR Flash', quantity: 380, safetyStock: 80, unitPrice: 3.2, location: 'D-02-02', supplierIndex: 1, dateCode: '2422', packaging: '盘装' },
  { partNumber: 'AT24C02C-SSHM-T', manufacturer: 'Microchip', category: '存储', package: 'SOIC-8', description: '2Kbit I2C EEPROM', quantity: 860, safetyStock: 150, unitPrice: 0.45, location: 'D-02-02', supplierIndex: 0, dateCode: '2415', packaging: '盘装' },
  { partNumber: '74HC595D', manufacturer: 'Nexperia', category: '逻辑', package: 'SOIC-16', description: '8 位串行移位寄存器', quantity: 1450, safetyStock: 300, unitPrice: 0.28, location: 'D-01-01', supplierIndex: 1, dateCode: '2410', packaging: '盘装' },
  { partNumber: 'SN74LVC1G17DBVR', manufacturer: 'TI', category: '逻辑', package: 'SOT-23-5', description: '单路施密特触发缓冲器', quantity: 2100, safetyStock: 400, unitPrice: 0.19, location: 'D-01-01', supplierIndex: 2, dateCode: '2430', packaging: '盘装' },
  { partNumber: '0402 100nF X7R 50V', manufacturer: '三星', category: '被动件', package: '0402', description: '贴片陶瓷电容 100nF ±10% 50V', quantity: 4800, safetyStock: 1000, unitPrice: 0.008, location: 'D-01-01', supplierIndex: 1, dateCode: '2433', packaging: '盘装', tags: '通用' },
  { partNumber: '0603 10kΩ 1%', manufacturer: '国巨', category: '被动件', package: '0603', description: '贴片电阻 10kΩ ±1% 1/10W', quantity: 3200, safetyStock: 800, unitPrice: 0.005, location: 'D-01-01', supplierIndex: 1, dateCode: '2429', packaging: '盘装' },
  { partNumber: 'TYPE-C-16P', manufacturer: '立讯', category: '连接器', package: 'SMD-16', description: 'USB Type-C 母座 16P 贴板式', quantity: 145, safetyStock: 40, unitPrice: 1.6, location: 'B-02-04', supplierIndex: 4, dateCode: '2402', packaging: '盘装' },
  { partNumber: 'XH2.54-4P', manufacturer: 'JST', category: '连接器', package: 'THT-4', description: 'XH 系列 2.54mm 4 针直插座', quantity: 640, safetyStock: 100, unitPrice: 0.55, location: 'B-02-04', supplierIndex: 4, dateCode: '2406', packaging: '散装' },
  { partNumber: 'MPU-6050', manufacturer: 'TDK InvenSense', category: '传感器', package: 'QFN-24', description: '六轴陀螺仪加速度计', quantity: 27, safetyStock: 30, unitPrice: 9.8, location: 'A-01-01', supplierIndex: 0, dateCode: '2319', packaging: '盘装', msl: 3, tags: '缺货预警' },
  { partNumber: 'BMP280', manufacturer: 'Bosch', category: '传感器', package: 'LGA-8', description: '气压式高度计', quantity: 158, safetyStock: 40, unitPrice: 7.2, location: 'A-01-01', supplierIndex: 0, dateCode: '2424', packaging: '盘装', msl: 1 },
  { partNumber: 'SS34', manufacturer: 'MDD', category: '被动件', package: 'SMA', description: '3A 40V 肖特基二极管', quantity: 2800, safetyStock: 500, unitPrice: 0.12, location: 'D-01-01', supplierIndex: 4, dateCode: '2411', packaging: '盘装' },
  { partNumber: 'IRF3205PBF', manufacturer: 'Infineon', category: '电源管理', package: 'TO-220', description: 'N 沟道 MOSFET 55V 110A', quantity: 112, safetyStock: 40, unitPrice: 6.4, location: 'C-03-01', supplierIndex: 1, dateCode: '2403', packaging: '管装' }
]

export function seedIfEmpty(): void {
  const marker = join(getDataDir(), '.seeded')
  if (existsSync(marker)) return

  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) AS n FROM components').get() as { n: number }).n
  if (count > 0) {
    writeFileSync(marker, '1', 'utf8')
    return
  }

  const run = db.transaction(() => {
    const supplierIds: string[] = []
    for (const s of SUPPLIERS) {
      const id = newId()
      suppliersRepo.insert({
        id,
        code: null,
        name: s.name,
        shortName: s.shortName ?? null,
        contactName: s.contactName || null,
        phone: s.phone || null,
        email: null,
        address: null,
        website: null,
        paymentTerms: s.paymentTerms ?? null,
        level: s.level,
        tags: s.tags ?? null,
        note: null,
        ts: nowIso()
      })
      supplierIds.push(id)
    }

    const locationIds = new Map<string, string>()
    for (const code of LOCATIONS) {
      const segments = code.split('-')
      const id = locationsRepo.insert({
        code: segments[segments.length - 1],
        fullCode: code,
        name: null,
        parentId: null,
        kind: 'box',
        capacity: null,
        note: null
      })
      locationIds.set(code, id)
    }

    for (const c of COMPONENTS) {
      const ts = nowIso()
      const id = componentsRepo.insert({
        kind: 'component',
        partNumber: c.partNumber,
        manufacturer: c.manufacturer,
        category: c.category,
        package: c.package,
        description: c.description,
        dateCode: c.dateCode,
        packaging: c.packaging,
        quantity: c.quantity,
        unit: '个',
        safetyStock: c.safetyStock,
        unitPrice: c.unitPrice,
        currency: 'CNY',
        moq: null,
        msl: c.msl ?? null,
        rohs: 1,
        locationId: locationIds.get(c.location) ?? null,
        locationFullCode: c.location,
        supplierId: supplierIds[c.supplierIndex] ?? null,
        tags: c.tags ?? null,
        note: null
      })

      movementsRepo.insert({
        id: newId(),
        componentId: id,
        type: 'init',
        quantity: c.quantity,
        beforeQty: 0,
        afterQty: c.quantity,
        unitPrice: c.unitPrice,
        supplierId: supplierIds[c.supplierIndex] ?? null,
        dateCode: c.dateCode,
        projectRef: null,
        operator: 'local',
        note: '示例数据初始库存',
        occurredAt: ts,
        createdAt: ts
      })
    }
  })

  run()
  writeFileSync(marker, '1', 'utf8')
}

/* ---------------------- 新增大类的示例数据 ---------------------- */

interface SeedKindItem {
  partNumber: string
  manufacturer: string
  category: string
  package?: string
  description: string
  quantity: number
  safetyStock: number
  unitPrice: number
  unit: string
  locationCode: string
}

const EXTRA_KINDS: { kind: ItemKind; items: SeedKindItem[] }[] = [
  {
    kind: 'board',
    items: [
      { partNumber: 'STM32F407-Explorer', manufacturer: '正点原子', category: '核心板', package: '核心板', description: '探索者 STM32F407ZGT6 开发板', quantity: 4, safetyStock: 1, unitPrice: 268, unit: '块', locationCode: 'B-01-05' },
      { partNumber: 'RaspberryPi-4B-4G', manufacturer: 'Raspberry Pi', category: '开发套件', package: '120×80mm', description: '树莓派 4B 4GB 单板计算机', quantity: 2, safetyStock: 1, unitPrice: 480, unit: '块', locationCode: 'B-01-05' },
      { partNumber: 'ESP32-S3-DevKitC-1', manufacturer: 'Espressif', category: '开发套件', package: '开发板', description: 'ESP32-S3 官方开发板 8MB Flash', quantity: 6, safetyStock: 2, unitPrice: 68, unit: '块', locationCode: 'B-01-05' }
    ]
  },
  {
    kind: 'module',
    items: [
      { partNumber: 'ESP-01S', manufacturer: '安信可', category: '通信模块', package: '24×16mm', description: 'ESP8266 WiFi 模块 1MB Flash', quantity: 30, safetyStock: 10, unitPrice: 9.5, unit: '个', locationCode: 'B-02-04' },
      { partNumber: 'LM2596-BUCK', manufacturer: '国产', category: '电源模块', package: '43×21mm', description: 'LM2596 可调降压模块 3A', quantity: 25, safetyStock: 8, unitPrice: 3.2, unit: '个', locationCode: 'B-02-04' },
      { partNumber: 'OLED-0.96-SSD1306', manufacturer: '中景园', category: '显示模块', package: '27×27mm', description: '0.96 寸 I2C OLED 显示模块', quantity: 18, safetyStock: 5, unitPrice: 12.8, unit: '个', locationCode: 'B-02-04' }
    ]
  },
  {
    kind: 'hardware',
    items: [
      { partNumber: 'M3x8-SOCKET', manufacturer: '国产', category: '螺丝', package: 'M3×8', description: '304 不锈钢内六角圆柱头螺丝', quantity: 500, safetyStock: 100, unitPrice: 0.05, unit: '个', locationCode: 'C-03-01' },
      { partNumber: 'M3-WASHER', manufacturer: '国产', category: '垫片', package: 'M3', description: '304 不锈钢平垫片', quantity: 800, safetyStock: 150, unitPrice: 0.02, unit: '个', locationCode: 'C-03-01' },
      { partNumber: 'CASE-100x60x30', manufacturer: '定制', category: '外壳', package: '100×60×30mm', description: '亚克力透明外壳 带螺丝孔', quantity: 6, safetyStock: 2, unitPrice: 18, unit: '套', locationCode: 'C-03-01' }
    ]
  },
  {
    kind: 'consumable',
    items: [
      { partNumber: 'SOLDER-0.8-100G', manufacturer: '白猴', category: '焊锡', package: '100g', description: '0.8mm 有铅焊锡丝 63/37', quantity: 5, safetyStock: 2, unitPrice: 22, unit: '卷', locationCode: 'A-01-01' },
      { partNumber: 'FLUX-100ML', manufacturer: '金鸡', category: '助焊剂', package: '100ml', description: '免清洗无铅助焊剂', quantity: 3, safetyStock: 1, unitPrice: 15, unit: '瓶', locationCode: 'A-01-01' },
      { partNumber: 'TAPE-KAPTON-10MM', manufacturer: '3M', category: '胶粘', package: '10mm×33m', description: '聚酰亚胺高温胶带', quantity: 8, safetyStock: 3, unitPrice: 9, unit: '卷', locationCode: 'A-01-01' }
    ]
  }
]

/**
 * 开发板 / 电子模块 / 五金 / 耗材的示例数据。
 * 只在对应大类为空时补一次，避免用户清空后被重新塞回来。
 */
export function seedExtraKinds(): void {
  const marker = join(getDataDir(), '.seeded-kinds')
  if (existsSync(marker)) return

  for (const group of EXTRA_KINDS) {
    const existing = getDb()
      .prepare('SELECT COUNT(*) AS n FROM components WHERE kind = ?')
      .get(group.kind) as { n: number }
    if (existing.n > 0) continue

    for (const item of group.items) {
      try {
        componentsService.create({ kind: group.kind, ...item })
      } catch {
        // 型号撞了就当已有，不让示例数据阻塞启动
      }
    }
  }

  writeFileSync(marker, '1', 'utf8')
}
