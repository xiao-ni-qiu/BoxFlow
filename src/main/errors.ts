export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'DUPLICATE_COMPONENT'
  | 'DUPLICATE_SUPPLIER'
  | 'DUPLICATE_LOCATION'
  | 'COMPONENT_NOT_FOUND'
  | 'SUPPLIER_NOT_FOUND'
  | 'MOVEMENT_NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_QUANTITY'
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
  if (err instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: err.message }
  }
  return { code: 'INTERNAL_ERROR', message: '未知错误' }
}
