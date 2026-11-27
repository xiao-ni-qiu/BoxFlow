export interface Migration {
  version: number
  name: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    sql: `
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code TEXT,
  name TEXT NOT NULL,
  short_name TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  payment_terms TEXT,
  level INTEGER NOT NULL DEFAULT 3,
  tags TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_name ON suppliers (name);
CREATE INDEX IF NOT EXISTS ix_suppliers_status ON suppliers (status);

CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES storage_locations (id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  full_code TEXT NOT NULL,
  name TEXT,
  kind TEXT NOT NULL DEFAULT 'box',
  capacity INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_full_code ON storage_locations (full_code);

CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  part_number TEXT NOT NULL,
  manufacturer TEXT NOT NULL DEFAULT '',
  category TEXT,
  package TEXT,
  description TEXT,
  date_code TEXT,
  packaging TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '个',
  safety_stock INTEGER NOT NULL DEFAULT 0,
  unit_price REAL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  moq INTEGER,
  msl INTEGER,
  rohs INTEGER,
  location_id TEXT REFERENCES storage_locations (id) ON DELETE SET NULL,
  location_full_code TEXT,
  supplier_id TEXT REFERENCES suppliers (id) ON DELETE SET NULL,
  image_path TEXT,
  tags TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_components_part ON components (part_number, manufacturer);
CREATE INDEX IF NOT EXISTS ix_components_manufacturer ON components (manufacturer);
CREATE INDEX IF NOT EXISTS ix_components_category ON components (category);
CREATE INDEX IF NOT EXISTS ix_components_location ON components (location_full_code);
CREATE INDEX IF NOT EXISTS ix_components_supplier ON components (supplier_id);
CREATE INDEX IF NOT EXISTS ix_components_status ON components (status);
CREATE INDEX IF NOT EXISTS ix_components_updated ON components (updated_at DESC);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL REFERENCES components (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  before_qty INTEGER NOT NULL,
  after_qty INTEGER NOT NULL,
  unit_price REAL,
  supplier_id TEXT REFERENCES suppliers (id) ON DELETE SET NULL,
  date_code TEXT,
  project_ref TEXT,
  operator TEXT NOT NULL DEFAULT 'local',
  note TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mov_component ON stock_movements (component_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_mov_occurred ON stock_movements (occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_mov_type ON stock_movements (type, occurred_at);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  component_id TEXT NOT NULL REFERENCES components (id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  sha256 TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_att_component ON attachments (component_id);
`
  },
  {
    version: 2,
    name: 'component-kind',
    // 同一张表承载元器件 / 开发板 / 电子模块 / 五金 / 耗材，靠 kind 区分
    sql: `
ALTER TABLE components ADD COLUMN kind TEXT NOT NULL DEFAULT 'component';
CREATE INDEX IF NOT EXISTS ix_components_kind ON components (kind, status);
`
  }
]
