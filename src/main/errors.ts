import { ZodError } from 'zod'

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'DUPLICATE_COMPONENT'
  | 'DUPLICATE_SUPPLIER'
  | 'DUPLICATE_LOCATION'
  | 'LOCATION_NOT_FOUND'
  | 'LOCATION_IN_USE'
  | 'COMPONENT_NOT_FOUND'
  | 'SUPPLIER_NOT_FOUND'
  | 'MOVEMENT_NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_QUANTITY'
  | 'WEBDAV_NOT_CONFIGURED'
  | 'WEBDAV_FAILED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTH_FAILED'
  | 'AI_BUSY'
  | 'AI_NO_MODEL_LIST'
  | 'AI_FAILED'
  | 'DB_ERROR'
  | 'INTERNAL_ERROR'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.details = details
  }
}

export function serializeError(err: unknown): { code: string; message: string; details?: unknown } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, details: err.details }
  }
  // 校验错误默认的 message 是一整串 JSON，界面里没法看，取第一条的说明
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return {
      code: 'VALIDATION_FAILED',
      message: first?.message ?? '输入不合法',
      details: err.issues
    }
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: err.message }
  }
  return { code: 'INTERNAL_ERROR', message: '未知错误' }
}
