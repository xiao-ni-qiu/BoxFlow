import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 主进程的兜底日志。
 * 打包后 stdout 拿不到，初始化一旦抛异常就是一个"启动了但没窗口"的黑盒，
 * 所以所有未捕获异常都落到 userData/logs/main.log 里。
 */
function logFile(): string {
  try {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    return join(dir, 'main.log')
  } catch {
    return join(app.getPath('temp'), 'inventory-main.log')
  }
}

export function logMain(tag: string, detail: unknown): void {
  const text =
    detail instanceof Error
      ? `${detail.message}\n${detail.stack ?? ''}`
      : typeof detail === 'string'
        ? detail
        : JSON.stringify(detail, null, 2)

  const line = `[${new Date().toISOString()}] ${tag}: ${text}\n`
  try {
    appendFileSync(logFile(), line, 'utf8')
  } catch {
    /* 日志本身失败就放弃，不能因为写日志再抛一次 */
  }
  try {
    process.stdout.write(line)
  } catch {
    /* 打包环境没有 stdout */
  }
}

export function installCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    logMain('uncaughtException', err)
  })
  process.on('unhandledRejection', (reason) => {
    logMain('unhandledRejection', reason)
  })
}
