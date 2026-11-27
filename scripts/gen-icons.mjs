import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'

const ACCENT = [79, 70, 229]
const WHITE = [255, 255, 255]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width
  const bottom = top + height
  if (x < left || x > right || y < top || y > bottom) return false
  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

function render(size) {
  const scale = 4
  const buffer = Buffer.alloc(size * size * 4)
  const outerRadius = size * 0.225
  const inset = size * 0.255
  const boxSize = size - inset * 2
  const boxRadius = size * 0.055
  const bandTop = size * 0.452
  const bandBottom = size * 0.512

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let bgHits = 0
      let fgHits = 0
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const px = x + (sx + 0.5) / scale
          const py = y + (sy + 0.5) / scale
          const inBg = insideRoundedRect(px, py, 0, 0, size, size, outerRadius)
          const inBox = insideRoundedRect(px, py, inset, inset, boxSize, boxSize, boxRadius)
          const inBand = py >= bandTop && py <= bandBottom && px >= inset && px <= size - inset
          const narrow = px >= inset + size * 0.085 && px <= size - inset - size * 0.085
          const inUpper = py < bandTop && narrow
          const inLower = py > bandBottom
          const inShape = inBox && (inBand ? false : inUpper || inLower)
          if (inBg) {
            bgHits += 1
            if (inShape) fgHits += 1
          }
        }
      }
      const total = scale * scale
      const bgAlpha = bgHits / total
      const fgAlpha = fgHits / total
      const index = (y * size + x) * 4
      const alpha = bgAlpha
      const r = bgAlpha > 0 ? (ACCENT[0] * (bgAlpha - fgAlpha) + WHITE[0] * fgAlpha) / bgAlpha : 0
      const g = bgAlpha > 0 ? (ACCENT[1] * (bgAlpha - fgAlpha) + WHITE[1] * fgAlpha) / bgAlpha : 0
      const b = bgAlpha > 0 ? (ACCENT[2] * (bgAlpha - fgAlpha) + WHITE[2] * fgAlpha) / bgAlpha : 0
      buffer[index] = Math.round(r)
      buffer[index + 1] = Math.round(g)
      buffer[index + 2] = Math.round(b)
      buffer[index + 3] = Math.round(alpha * 255)
    }
  }
  return encodePng(size, size, buffer)
}

function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let offset = 6 + entries.length * 16
  const dirs = []
  for (const entry of entries) {
    const dir = Buffer.alloc(16)
    dir[0] = entry.size >= 256 ? 0 : entry.size
    dir[1] = entry.size >= 256 ? 0 : entry.size
    dir[2] = 0
    dir[3] = 0
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(entry.png.length, 8)
    dir.writeUInt32LE(offset, 12)
    dirs.push(dir)
    offset += entry.png.length
  }

  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)])
}

const root = process.cwd()
const buildDir = join(root, 'build')
const resDir = join(root, 'resources')
mkdirSync(buildDir, { recursive: true })
mkdirSync(resDir, { recursive: true })

const png512 = render(512)
writeFileSync(join(buildDir, 'icon.png'), png512)
writeFileSync(join(resDir, 'icon.png'), png512)

const icoEntries = [256, 128, 64, 48, 32, 16].map((size) => ({ size, png: render(size) }))
writeFileSync(join(buildDir, 'icon.ico'), buildIco(icoEntries))

writeFileSync(join(resDir, 'tray.png'), render(32))

const outDir = join(root, 'docs', 'shots')
mkdirSync(outDir, { recursive: true })
void dirname
process.stdout.write('icons generated\n')
