import { randomBytes } from 'node:crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export function newId(size = 12): string {
  const bytes = randomBytes(size)
  let out = ''
  for (let i = 0; i < size; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export function nowIso(): string {
  return new Date().toISOString()
}
