/**
 * 极简 WebDAV 客户端，只实现备份需要的四个动作：建目录、列目录、上传、下载、删除。
 * 不引入第三方依赖，直接用 Node 20 内置 fetch + Basic Auth。
 *
 * 针对坚果云的两点特殊处理：
 * 1. 根地址是 https://dav.jianguoyun.com/dav/，账号用登录邮箱，密码必须用「应用密码」；
 * 2. 它对请求频率敏感，所以这里不做任何并发，所有调用串行执行。
 */

export interface WebdavAuth {
  url: string
  username: string
  password: string
}

export interface RemoteBackup {
  name: string
  href: string
  size: number
  modifiedAt: string
}

export class WebdavError extends Error {
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'WebdavError'
    this.status = status
  }
}

/** 统一成以 / 结尾的绝对地址，避免用户少写或多写斜杠 */
function normalizeBase(url: string): string {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new WebdavError('服务地址必须以 http:// 或 https:// 开头')
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function encodePath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function authHeader(auth: WebdavAuth): string {
  return `Basic ${Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64')}`
}

function friendlyError(status: number, body: string): string {
  const snippet = body.replace(/\s+/g, ' ').slice(0, 120)
  switch (status) {
    case 401:
      return '认证失败：坚果云要填「应用密码」，不是登录密码（设置 → 安全选项 → 第三方应用管理 → 添加应用）'
    case 403:
      return '拒绝访问：账号可能触发了坚果云的请求频率限制，或该目录没有写入权限'
    case 404:
      return '路径不存在：请检查服务地址是否以 /dav/ 结尾'
    case 405:
      return '服务端不允许该操作，请确认地址指向的是 WebDAV 根目录'
    case 429:
      return '请求过于频繁，坚果云对免费账号有频率限制，请稍后再试'
    case 507:
      return '云端空间不足'
    default:
      return `WebDAV 返回 ${status}${snippet ? `：${snippet}` : ''}`
  }
}

async function request(
  auth: WebdavAuth,
  method: string,
  path: string,
  init: { body?: BodyInit; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<{ status: number; text: string; buffer?: Buffer }> {
  const base = normalizeBase(auth.url)
  const url = `${base}${encodePath(path)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30000)

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(auth),
        ...(init.headers ?? {})
      },
      body: init.body,
      signal: controller.signal
    })

    const status = response.status
    const isBinary = response.headers.get('content-type')?.includes('octet-stream')
    if (status === 401 || status === 403 || status === 404 || status === 429 || status === 507) {
      const text = await response.text().catch(() => '')
      throw new WebdavError(friendlyError(status, text), status)
    }

    if (init.body && (status === 200 || status === 201 || status === 204)) {
      return { status, text: '' }
    }

    if (isBinary || method === 'GET') {
      const buffer = Buffer.from(await response.arrayBuffer())
      return { status, text: '', buffer }
    }

    return { status, text: await response.text() }
  } catch (error) {
    if (error instanceof WebdavError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new WebdavError('连接超时，请检查网络或服务地址')
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new WebdavError(`无法连接 WebDAV 服务：${reason}`)
  } finally {
    clearTimeout(timer)
  }
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:getlastmodified/>
    <D:getcontentlength/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`

/** 逐级创建目录；已存在时服务器返回 405，视为成功 */
export async function ensureDir(auth: WebdavAuth, dir: string): Promise<void> {
  const segments = dir.split('/').filter(Boolean)
  let current = ''
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    const { status } = await request(auth, 'MKCOL', `${current}/`, { timeoutMs: 20000 })
    if (status >= 400 && status !== 405) {
      throw new WebdavError(friendlyError(status, ''), status)
    }
  }
}

/** 连通性 + 写权限检查：建目录再列一次，两步都过才算可用 */
export async function testConnection(auth: WebdavAuth, dir: string): Promise<void> {
  await ensureDir(auth, dir)
  await request(auth, 'PROPFIND', `${dir}/`, {
    headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
    body: PROPFIND_BODY,
    timeoutMs: 20000
  })
}

function pick(block: string, tag: string): string {
  const matched = block.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'))
  return matched ? matched[1].trim() : ''
}

/** 列出目录下的备份文件，按修改时间倒序 */
export async function listFiles(auth: WebdavAuth, dir: string): Promise<RemoteBackup[]> {
  const { text } = await request(auth, 'PROPFIND', `${dir}/`, {
    headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    body: PROPFIND_BODY,
    timeoutMs: 25000
  })

  const blocks = text.match(/<(?:\w+:)?response\b[\s\S]*?<\/(?:\w+:)?response>/gi) ?? []
  const files: RemoteBackup[] = []

  for (const block of blocks) {
    const href = pick(block, 'href')
    if (!href) continue
    const isDir = /<(?:\w+:)?collection\s*\/?>/i.test(block) || href.endsWith('/')
    if (isDir) continue

    const name = decodeURIComponent(href.split('/').filter(Boolean).pop() ?? '')
    if (!name.toLowerCase().endsWith('.db')) continue

    files.push({
      name,
      href,
      size: Number(pick(block, 'getcontentlength')) || 0,
      modifiedAt: pick(block, 'getlastmodified')
    })
  }

  return files.sort((a, b) => {
    const left = Date.parse(a.modifiedAt) || 0
    const right = Date.parse(b.modifiedAt) || 0
    if (left !== right) return right - left
    return b.name.localeCompare(a.name)
  })
}

export async function uploadFile(
  auth: WebdavAuth,
  dir: string,
  name: string,
  content: Buffer
): Promise<void> {
  await request(auth, 'PUT', `${dir}/${name}`, {
    body: new Uint8Array(content),
    headers: { 'Content-Type': 'application/octet-stream' },
    // 备份文件可能上百 MB，给足时间
    timeoutMs: 180000
  })
}

export async function downloadFile(auth: WebdavAuth, dir: string, name: string): Promise<Buffer> {
  const { buffer } = await request(auth, 'GET', `${dir}/${name}`, { timeoutMs: 180000 })
  if (!buffer || buffer.length === 0) throw new WebdavError('下载到的文件为空')
  return buffer
}

export async function deleteFile(auth: WebdavAuth, dir: string, name: string): Promise<void> {
  const { status } = await request(auth, 'DELETE', `${dir}/${name}`, { timeoutMs: 20000 })
  if (status >= 400 && status !== 404) {
    throw new WebdavError(friendlyError(status, ''), status)
  }
}
