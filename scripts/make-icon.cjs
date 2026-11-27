/**
 * 从 build/logo-source.jpg 生成应用图标。
 *
 * 用 Electron 的 nativeImage 解码与缩放（不额外引入图像库），
 * 把纯白背景抠成透明，再输出：
 *   build/icon.png      512  （electron-builder 用）
 *   build/icon.ico      多尺寸（Windows 标题栏/任务栏/安装包）
 *   resources/icon.png  512  （窗口图标）
 *   resources/tray.png  32   （托盘）
 *
 * 运行：npx electron scripts/make-icon.cjs
 */
const { app, nativeImage } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const SOURCE = join(ROOT, 'build', 'logo-source.jpg')

/** 把接近纯白的像素抠成透明，边缘按白度渐变，避免锯齿 */
function keyOutWhite(image) {
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap() // BGRA
  let cleared = 0

  for (let i = 0; i < bitmap.length; i += 4) {
    const b = bitmap[i]
    const g = bitmap[i + 1]
    const r = bitmap[i + 2]
    const min = Math.min(r, g, b)
    const chroma = Math.max(r, g, b) - min

    if (chroma <= 18 && min >= 235) {
      // 254~255 的白直接归零，235~250 之间按比例过渡，边缘才不会出现硬边
      const alpha = Math.round(Math.max(0, Math.min(255, ((250 - min) / 15) * 255)))
      bitmap[i + 3] = Math.min(bitmap[i + 3], alpha)
      if (alpha === 0) cleared += 1
    }
  }

  process.stdout.write(`keyOutWhite: ${cleared} / ${width * height} px -> transparent\n`)
  return nativeImage.createFromBitmap(bitmap, { width, height })
}

function resize(image, size) {
  return image.resize({ width: size, height: size, quality: 'best' })
}

/** ICO 直接内嵌 PNG（Vista 之后都支持），省掉 BMP 那一套 */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let offset = 6 + 16 * entries.length
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
    offset += entry.png.length
    dirs.push(dir)
  }

  return Buffer.concat([header, ...dirs, ...entries.map((entry) => entry.png)])
}

app.whenReady().then(() => {
  try {
    const raw = nativeImage.createFromPath(SOURCE)
    if (raw.isEmpty()) throw new Error(`无法读取 ${SOURCE}`)

    const size = raw.getSize()
    process.stdout.write(`source: ${size.width}x${size.height}\n`)

    // 源图理论上已是正方形，仍然按中心裁一次，防止比例被拉伸
    const side = Math.min(size.width, size.height)
    const square = raw.crop({
      x: Math.round((size.width - side) / 2),
      y: Math.round((size.height - side) / 2),
      width: side,
      height: side
    })

    const transparent = keyOutWhite(square)

    const png512 = resize(transparent, 512).toPNG()
    const trayPng = resize(transparent, 32).toPNG()

    writeFileSync(join(ROOT, 'build', 'icon.png'), png512)
    writeFileSync(join(ROOT, 'resources', 'icon.png'), png512)
    writeFileSync(join(ROOT, 'resources', 'tray.png'), trayPng)

    const sizes = [256, 128, 64, 48, 32, 16]
    const ico = buildIco(
      sizes.map((size) => ({ size, png: resize(transparent, size).toPNG() }))
    )
    writeFileSync(join(ROOT, 'build', 'icon.ico'), ico)

    process.stdout.write(`icons written: png 512, ico ${sizes.join('/')}, tray 32\n`)
    app.exit(0)
  } catch (err) {
    process.stderr.write(`FAILED: ${String(err)}\n`)
    app.exit(1)
  }
})
