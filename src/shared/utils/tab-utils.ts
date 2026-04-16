/** 生成 UUID v4 */
export function generateUUID(): string {
  return crypto.randomUUID()
}

/** 获取当前时间的 ISO 字符串 */
export function nowISO(): string {
  return new Date().toISOString()
}
